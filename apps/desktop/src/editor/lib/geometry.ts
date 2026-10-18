// Pure time <-> pixel maths for the timeline: zoom limits, zooming around a point, and ruler tick spacing.

import { clamp } from "./time";

/** Fewest pixels per second the timeline can show (a long project fully visible). */
export const MIN_ZOOM = 2;
/** Most pixels per second (about 40 px per frame at 60 fps). */
export const MAX_ZOOM = 2400;
/** Zoom a new session starts at. */
export const DEFAULT_ZOOM = 80;

/** Clamp a zoom value (pixels per second) into the supported range. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return DEFAULT_ZOOM;
  return clamp(zoom, MIN_ZOOM, MAX_ZOOM);
}

/** Pixel offset (from the time origin) of a timeline time. */
export function timeToPx(seconds: number, zoom: number): number {
  return seconds * zoom;
}

/** Timeline time of a pixel offset from the time origin. */
export function pxToTime(px: number, zoom: number): number {
  return px / zoom;
}

/** Result of {@link zoomAround}. */
export interface ZoomResult {
  zoom: number;
  /** New horizontal scroll offset, in pixels, that keeps the anchor time under the same screen position. */
  scrollLeft: number;
}

/**
 * Change zoom by `factor` while keeping the timeline time under `anchorViewportX` (pixels from the left edge of
 * the visible track area) fixed on screen, which is how wheel/pinch zoom should feel.
 */
export function zoomAround(opts: {
  zoom: number;
  factor: number;
  scrollLeft: number;
  anchorViewportX: number;
}): ZoomResult {
  const next = clampZoom(opts.zoom * opts.factor);
  const anchorTime = (opts.scrollLeft + opts.anchorViewportX) / opts.zoom;
  const scrollLeft = Math.max(0, anchorTime * next - opts.anchorViewportX);
  return { zoom: next, scrollLeft };
}

/** The zoom at which `duration` seconds exactly fill `viewportWidth` pixels, leaving `padding` pixels spare. */
export function fitZoom(duration: number, viewportWidth: number, padding = 40): number {
  if (duration <= 0 || viewportWidth <= padding) return DEFAULT_ZOOM;
  return clampZoom((viewportWidth - padding) / duration);
}

/** Spacing of the ruler: a labelled major tick every `major` seconds and unlabelled minor ticks every `minor`. */
export interface TickSpec {
  major: number;
  minor: number;
}

const MIN_MAJOR_PX = 84;

/**
 * Choose ruler tick spacing so labelled ticks are at least ~84 px apart. Very high zoom switches to
 * frame-based spacing so individual frames can be located.
 */
export function tickSpec(zoom: number, fps: number): TickSpec {
  const f = 1 / Math.max(1, fps);
  const table: TickSpec[] = [
    { major: f, minor: f },
    { major: 2 * f, minor: f },
    { major: 5 * f, minor: f },
    { major: 10 * f, minor: 2 * f },
    { major: 0.5, minor: 0.1 },
    { major: 1, minor: 0.2 },
    { major: 2, minor: 0.5 },
    { major: 5, minor: 1 },
    { major: 10, minor: 2 },
    { major: 15, minor: 5 },
    { major: 30, minor: 5 },
    { major: 60, minor: 10 },
    { major: 120, minor: 30 },
    { major: 300, minor: 60 },
    { major: 600, minor: 120 },
    { major: 1800, minor: 300 },
    { major: 3600, minor: 600 },
  ].filter((t, i, all) => i === 0 || t.major > (all[i - 1]?.major ?? 0)) as TickSpec[];
  for (const t of table) if (t.major * zoom >= MIN_MAJOR_PX) return t;
  return table[table.length - 1] ?? { major: 3600, minor: 600 };
}

/** One tick to draw on the ruler. */
export interface Tick {
  time: number;
  major: boolean;
}

/** Ticks between two timeline times (inclusive), for the visible part of the ruler only. */
export function rulerTicks(from: number, to: number, spec: TickSpec): Tick[] {
  const ticks: Tick[] = [];
  const step = spec.minor;
  const startIndex = Math.max(0, Math.floor(from / step) - 1);
  const endIndex = Math.ceil(to / step) + 1;
  // Guard against a runaway loop if the caller passes a huge window at a tiny step.
  if (endIndex - startIndex > 5000) return ticks;
  for (let i = startIndex; i <= endIndex; i++) {
    const time = i * step;
    const ratio = time / spec.major;
    const major = Math.abs(ratio - Math.round(ratio)) < 1e-6;
    ticks.push({ time, major });
  }
  return ticks;
}

/** Text for a labelled ruler tick: `m:ss`, with fractions or frames when ticks are closer than a second. */
export function rulerLabel(time: number, spec: TickSpec, fps: number): string {
  const total = Math.max(0, time);
  const m = Math.floor(total / 60);
  const s = Math.floor(total + 1e-6) % 60;
  const base = `${m}:${String(s).padStart(2, "0")}`;
  if (spec.major >= 1 - 1e-9) return base;
  if (spec.major >= 0.5 - 1e-9) {
    const tenths = Math.round((total - Math.floor(total + 1e-6)) * 10);
    return `${base}.${tenths}`;
  }
  const frame = Math.round((total - Math.floor(total + 1e-6)) * fps);
  return `${base}:${String(frame).padStart(2, "0")}`;
}
