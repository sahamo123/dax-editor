// Pure edit operations for text overlays (titles, lower-thirds, captions). Project in, Project out.

import type { Overlay, OverlayStyle, Project } from "./schema.js";
import { OverlaySchema } from "./schema.js";

const EPS = 1e-6;

/** Anything placed on the timeline for a stretch of time: text and image overlays, zooms. Times are timeline seconds. */
export interface Timed {
  start: number;
  duration: number;
}

/**
 * Keep overlays attached to the footage they were placed over after the
 * timeline range [from, to) is deleted and the gap closed. Overlays after the
 * range slide left; overlays crossing it lose the deleted part; overlays that
 * sat entirely inside it disappear. Works for any {@link Timed} item (image overlays and zooms follow
 * the same rule), and returns new objects without touching the input.
 */
export function shiftOverlaysForDelete<T extends Timed>(
  overlays: readonly T[],
  from: number,
  to: number,
): T[] {
  const gap = to - from;
  const out: T[] = [];
  for (const o of overlays) {
    const end = o.start + o.duration;
    if (end <= from + EPS) {
      out.push(o);
    } else if (o.start >= to - EPS) {
      out.push({ ...o, start: o.start - gap });
    } else {
      const overlap = Math.min(end, to) - Math.max(o.start, from);
      const remaining = o.duration - overlap;
      if (remaining > EPS) out.push({ ...o, start: Math.min(o.start, from), duration: remaining });
    }
  }
  return out;
}

function withOverlays(p: Project, overlays: Overlay[]): Project {
  const next = structuredClone(p);
  next.timeline.overlays = overlays;
  return next;
}

/** Add a validated overlay to the timeline. Throws if its fields are invalid. */
export function addOverlay(p: Project, overlay: Overlay): Project {
  const valid = OverlaySchema.parse(overlay);
  if (p.timeline.overlays.some((o) => o.id === valid.id)) {
    throw new Error(`Overlay "${valid.id}" already exists`);
  }
  return withOverlays(p, [...p.timeline.overlays, valid]);
}

/** Fields of an overlay that {@link updateOverlay} can change. `style` is merged, not replaced. */
export interface OverlayPatch {
  start?: number;
  duration?: number;
  text?: string;
  subtitle?: string | null;
  animation?: Overlay["animation"];
  lane?: number;
  style?: Partial<OverlayStyle>;
}

/** Change an overlay's text, timing, animation or style. Pass `subtitle: null` to remove the second line. */
export function updateOverlay(p: Project, id: string, patch: OverlayPatch): Project {
  const current = p.timeline.overlays.find((o) => o.id === id);
  if (!current) throw new Error(`Unknown overlay "${id}"`);
  const { style, subtitle, ...rest } = patch;
  const merged: Record<string, unknown> = {
    ...current,
    ...rest,
    style: { ...current.style, ...style },
  };
  if (subtitle === null) delete merged.subtitle;
  else if (subtitle !== undefined) merged.subtitle = subtitle;
  const valid = OverlaySchema.parse(merged);
  return withOverlays(
    p,
    p.timeline.overlays.map((o) => (o.id === id ? valid : o)),
  );
}

/** Move an overlay in time and/or to another UI lane. */
export function moveOverlay(
  p: Project,
  id: string,
  to: { start?: number; lane?: number },
): Project {
  const patch: OverlayPatch = {};
  if (to.start !== undefined) patch.start = Math.max(0, to.start);
  if (to.lane !== undefined) patch.lane = to.lane;
  return updateOverlay(p, id, patch);
}

/** Remove an overlay. Throws if it does not exist. */
export function removeOverlay(p: Project, id: string): Project {
  if (!p.timeline.overlays.some((o) => o.id === id)) throw new Error(`Unknown overlay "${id}"`);
  return withOverlays(
    p,
    p.timeline.overlays.filter((o) => o.id !== id),
  );
}
