// Snapping maths: find the nearest "magnet" (clip edge, overlay edge, playhead, zero) within a pixel threshold.

import type { Project } from "@dax/core";
import { clipEndTime, mainClips } from "./project";

/** Pixels within which a dragged edge is pulled onto a snap target. */
export const SNAP_PX = 8;

/** Outcome of a snap query. `target` is the magnet that was hit, or null when nothing was close enough. */
export interface SnapResult {
  /** The (possibly adjusted) time. */
  time: number;
  target: number | null;
}

/** Snap `value` to the nearest of `targets` if it is within `threshold` seconds; otherwise return it unchanged. */
export function snapValue(
  value: number,
  targets: readonly number[],
  threshold: number,
): SnapResult {
  let best: number | null = null;
  let bestDist = threshold;
  for (const t of targets) {
    const d = Math.abs(t - value);
    if (d <= bestDist) {
      best = t;
      bestDist = d;
    }
  }
  return best === null ? { time: value, target: null } : { time: best, target: best };
}

/**
 * Snap a block spanning [start, start + duration] by whichever of its two edges is closer to a target.
 * Returns the adjusted start and the target hit (or null). Used when moving overlays.
 */
export function snapSpan(
  start: number,
  duration: number,
  targets: readonly number[],
  threshold: number,
): SnapResult {
  const a = snapValue(start, targets, threshold);
  const b = snapValue(start + duration, targets, threshold);
  if (a.target === null && b.target === null) return { time: start, target: null };
  const da = a.target === null ? Number.POSITIVE_INFINITY : Math.abs(a.target - start);
  const db = b.target === null ? Number.POSITIVE_INFINITY : Math.abs(b.target - (start + duration));
  return da <= db && a.target !== null
    ? { time: a.time, target: a.target }
    : { time: (b.target ?? start) - duration, target: b.target };
}

/** What to leave out of the target list: the thing being dragged must not snap to itself. */
export interface SnapExclusion {
  clipId?: string;
  overlayId?: string;
}

/**
 * Collect snap targets in timeline seconds: zero, the playhead, every clip edge and every overlay edge.
 * Pass `exclude` for the item being dragged. Duplicates are removed.
 */
export function snapTargets(p: Project, playhead: number, exclude: SnapExclusion = {}): number[] {
  const set = new Set<number>([0, playhead]);
  for (const c of mainClips(p)) {
    if (c.id === exclude.clipId) continue;
    set.add(c.start);
    set.add(clipEndTime(c));
  }
  for (const o of p.timeline.overlays) {
    if (o.id === exclude.overlayId) continue;
    set.add(o.start);
    set.add(o.start + o.duration);
  }
  return [...set];
}
