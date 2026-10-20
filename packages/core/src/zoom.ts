// Punch-in and push-in zooms: pure edit operations (Project in, Project out) and the FFmpeg filter fragments that render them.
// A zoom scales the finished picture (after the clips are joined, before text and images are drawn), so it follows
// timeline time and never crosses into overlays or captions. Rendering uses `scale eval=frame` plus `crop`, not
// `zoompan`: the crop offset is computed from the same zoom expression, which keeps the picture exact (see
// docs/research/ffmpeg-animation-recipes.md, recipe 2.2) and avoids zoompan's jitter.

import { shiftOverlaysForDelete } from "./overlays.js";
import type { Ease, Project, Zoom } from "./schema.js";
import { MAX_ZOOM, ZoomSchema } from "./schema.js";

const EPS = 1e-6;

/** Zooms are ranges on the timeline; this is how close two starts and ends must be to count as the same range. */
export const SAME_RANGE_TOLERANCE = 0.01;

/** The zooms of a project, earliest first. Empty when it has none. */
export function zoomsOf(p: Project): Zoom[] {
  return [...(p.timeline.zooms ?? [])].sort((a, b) => a.start - b.start);
}

/** Timeline time, in seconds, at which a zoom ends. */
export function zoomEnd(z: Zoom): number {
  return z.start + z.duration;
}

/** Progress from 0 to 1 shaped by `ease`. `p` is already clamped to [0, 1]. */
function easeValue(ease: Ease, p: number): number {
  switch (ease) {
    case "ease-in":
      return p * p;
    case "ease-out":
      return 1 - (1 - p) * (1 - p);
    case "ease-in-out":
      return p * p * (3 - 2 * p);
    default:
      return p;
  }
}

/**
 * The zoom factor a zoom has at timeline time `t`. Before it starts this is `fromScale`, after it ends it is
 * `toScale`. The renderer uses the same maths as an FFmpeg expression, so tests can compare the two.
 */
export function zoomScaleAt(z: Zoom, t: number): number {
  const p = Math.min(1, Math.max(0, (t - z.start) / z.duration));
  return z.fromScale + (z.toScale - z.fromScale) * easeValue(z.ease, p);
}

/** The zoom that overlaps [start, end), other than `ignoreId`, or undefined. Touching ranges do not overlap. */
function overlapping(
  zooms: readonly Zoom[],
  start: number,
  end: number,
  ignoreId?: string,
): Zoom | undefined {
  return zooms.find((z) => z.id !== ignoreId && start < zoomEnd(z) - EPS && z.start < end - EPS);
}

function withZooms(p: Project, zooms: Zoom[]): Project {
  const next = structuredClone(p);
  next.timeline.zooms = zooms.sort((a, b) => a.start - b.start);
  return next;
}

function describeRange(z: Zoom): string {
  return `${Number(z.start.toFixed(2))}s to ${Number(zoomEnd(z).toFixed(2))}s`;
}

/**
 * Add a validated zoom. Throws if its fields are invalid, its id exists, or its time range overlaps another
 * zoom (zooms do not stack; change the other one with {@link updateZoom} or remove it first).
 */
export function addZoom(p: Project, zoom: Zoom): Project {
  const valid = ZoomSchema.parse(zoom);
  const all = p.timeline.zooms ?? [];
  if (all.some((z) => z.id === valid.id)) throw new Error(`Zoom "${valid.id}" already exists`);
  const clash = overlapping(all, valid.start, zoomEnd(valid));
  if (clash) {
    throw new Error(
      `That time overlaps zoom "${clash.id}" (${describeRange(clash)}). Change that zoom with update_zoom or remove it first.`,
    );
  }
  return withZooms(p, [...all, valid]);
}

/** Fields of a zoom that {@link updateZoom} can change. */
export interface ZoomPatch {
  start?: number;
  duration?: number;
  fromScale?: number;
  toScale?: number;
  ease?: Ease;
  x?: number;
  y?: number;
}

/** Change a zoom's timing, scales, easing or focus point. Throws for an unknown id, invalid values or a new overlap. */
export function updateZoom(p: Project, id: string, patch: ZoomPatch): Project {
  const all = p.timeline.zooms ?? [];
  const current = all.find((z) => z.id === id);
  if (!current) throw new Error(`Unknown zoom "${id}"`);
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const valid = ZoomSchema.parse({ ...current, ...defined });
  const clash = overlapping(all, valid.start, zoomEnd(valid), id);
  if (clash) {
    throw new Error(
      `That time overlaps zoom "${clash.id}" (${describeRange(clash)}). Move or remove that zoom first.`,
    );
  }
  return withZooms(
    p,
    all.map((z) => (z.id === id ? valid : z)),
  );
}

/** Remove a zoom. Throws if it does not exist. */
export function removeZoom(p: Project, id: string): Project {
  const all = p.timeline.zooms ?? [];
  if (!all.some((z) => z.id === id)) throw new Error(`Unknown zoom "${id}"`);
  return withZooms(
    p,
    all.filter((z) => z.id !== id),
  );
}

/**
 * Keep zooms attached to the footage they were placed over after the timeline range [from, to) is deleted
 * and the gap closed: later zooms slide left, a zoom crossing the range loses the deleted part (and so plays
 * its move in less time), and a zoom entirely inside it disappears.
 */
export function shiftZoomsForDelete(zooms: readonly Zoom[], from: number, to: number): Zoom[] {
  return shiftOverlaysForDelete(zooms, from, to);
}

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

/** A number as FFmpeg expression text: fixed precision, no exponent, no trailing zeros. */
const num = (x: number) => Number(x.toFixed(6)).toString();

/** FFmpeg expression for the eased progress, given the expression `p` (0 to 1) it is computed from. */
function easeExpr(ease: Ease, p: string): string {
  switch (ease) {
    case "ease-in":
      return `(${p})*(${p})`;
    case "ease-out":
      return `(1-(1-(${p}))*(1-(${p})))`;
    case "ease-in-out":
      return `((${p})*(${p})*(3-2*(${p})))`;
    default:
      return `(${p})`;
  }
}

/** The largest even whole number not above `x`. Scaled sizes are kept even because H.264 4:2:0 needs it. */
const evenDown = (x: number) => Math.floor(x / 2) * 2;

/** The scale and crop filters for one zoom; `t` is the frame time, so the zoom is a function of timeline time. */
function zoomChain(z: Zoom, W: number, H: number): string {
  const crop = (xExpr: string, yExpr: string) => `crop=w=${W}:h=${H}:x='${xExpr}':y='${yExpr}'`;
  if (Math.abs(z.toScale - z.fromScale) < 1e-9) {
    // A hold: every frame is scaled the same, so plain constants (no per-frame evaluation) are enough.
    const sw = evenDown(W * z.fromScale);
    const sh = evenDown(H * z.fromScale);
    const x = Math.max(0, Math.round((sw - W) * z.x));
    const y = Math.max(0, Math.round((sh - H) * z.y));
    return `scale=w=${sw}:h=${sh},crop=w=${W}:h=${H}:x=${x}:y=${y}`;
  }
  const p = `min(1,max(0,(t-${num(z.start)})/${num(z.duration)}))`;
  const zoom = `(${num(z.fromScale)}+${num(z.toScale - z.fromScale)}*${easeExpr(z.ease, p)})`;
  // The crop offset comes from the zoom expression, not from in_w/in_h, which stay at their first value
  // after a per-frame scale (the picture would drift out of centre).
  const sw = `trunc(${W}*${zoom}/2)*2`;
  const sh = `trunc(${H}*${zoom}/2)*2`;
  return (
    `scale=w='${sw}':h='${sh}':eval=frame,` +
    crop(`(${sw}-${W})*${num(z.x)}`, `(${sh}-${H})*${num(z.y)}`)
  );
}

/**
 * Filter fragments that zoom the picture on the `W`x`H` stream `inLabel` and produce `outLabel`. Each zoom is
 * cut out of a copy of the stream (so only its own frames are scaled), zoomed, and laid back over the
 * untouched stream at the same time. Zooms are clipped to `total` seconds; a zoom that starts at or after
 * `total` is left out. Returns an empty list when nothing needs drawing (the caller then keeps `inLabel`).
 * `prefix` keeps the labels unique when the helper is used more than once.
 */
export function zoomFilters(
  zooms: readonly Zoom[],
  inLabel: string,
  outLabel: string,
  W: number,
  H: number,
  total: number,
  prefix = "z",
): string[] {
  const live = [...zooms]
    .sort((a, b) => a.start - b.start)
    .map((z) => ({ z, end: Math.min(zoomEnd(z), total) }))
    .filter((it) => it.end - it.z.start > 1e-3 && it.z.start < total);
  if (live.length === 0) return [];
  const branches = live.map((_, i) => `[${prefix}s${i}]`);
  const filters = [`${inLabel}split=${live.length + 1}[${prefix}base]${branches.join("")}`];
  live.forEach(({ z, end }, i) => {
    // The cut-out keeps its original timestamps, so `t` inside the expression is timeline time.
    filters.push(
      `${branches[i]}trim=start=${num(z.start)}:end=${num(end)},${zoomChain(z, W, H)},setsar=1[${prefix}c${i}]`,
    );
  });
  let under = `[${prefix}base]`;
  live.forEach((_, i) => {
    const out = i === live.length - 1 ? outLabel : `[${prefix}o${i}]`;
    // eof_action=pass: outside its range the zoomed copy has no frame, so the untouched picture shows.
    filters.push(`${under}[${prefix}c${i}]overlay=eof_action=pass${out}`);
    under = out;
  });
  return filters;
}

/** Build a zoom from loose parameters: `style` `punch-in` holds `scale` for the whole range, `push-in` glides from 1 to `scale`. */
export function zoomFromStyle(opts: {
  id: string;
  start: number;
  duration: number;
  scale: number;
  style: "punch-in" | "push-in";
  startScale?: number;
  ease?: Ease;
  x?: number;
  y?: number;
}): Zoom {
  const scale = Math.min(MAX_ZOOM, Math.max(1, opts.scale));
  const from = opts.startScale ?? (opts.style === "push-in" ? 1 : scale);
  return ZoomSchema.parse({
    id: opts.id,
    start: opts.start,
    duration: opts.duration,
    fromScale: from,
    toScale: scale,
    ease: opts.ease ?? "ease-in-out",
    x: opts.x ?? 0.5,
    y: opts.y ?? 0.5,
  });
}
