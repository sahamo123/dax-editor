// Pure maths for the overlay lanes of the timeline: which row each overlay is drawn on, and the move/resize
// previews used while dragging overlay blocks. The real edit is done by `move_overlay` / `update_overlay`.

import type { Overlay } from "@dax/core";
import { MIN_OVERLAY_DURATION } from "./project";
import { snapSpan, snapValue } from "./snap";

/** The minimum fields of an overlay that layout needs. */
export type OverlaySpan = Pick<Overlay, "id" | "start" | "duration" | "lane">;

/**
 * Decide the display row of each overlay. The stored `lane` is the preferred row; if another overlay on that row
 * overlaps in time the block is bumped to the next free row, so overlapping overlays never draw on top of each
 * other. Row 0 is the row nearest the video. Deterministic: ordered by lane, then start, then id.
 */
export function assignRows(overlays: readonly OverlaySpan[]): {
  rows: Map<string, number>;
  rowCount: number;
} {
  const sorted = [...overlays].sort(
    (a, b) => a.lane - b.lane || a.start - b.start || a.id.localeCompare(b.id),
  );
  const rowEnds: number[] = [];
  const rows = new Map<string, number>();
  for (const o of sorted) {
    let r = o.lane;
    // A tiny tolerance lets overlays that merely touch share a row.
    while ((rowEnds[r] ?? Number.NEGATIVE_INFINITY) > o.start + 1e-6) r++;
    rowEnds[r] = o.start + o.duration;
    rows.set(o.id, r);
  }
  return { rows, rowCount: Math.max(1, rowEnds.length) };
}

/** Result of an overlay drag preview. */
export interface OverlayDragResult {
  start: number;
  duration: number;
  /** Timeline time of the magnet that was hit, or null. */
  snappedTo: number | null;
}

/** Inputs shared by the overlay drag previews. */
export interface OverlayDragInput {
  start: number;
  duration: number;
  /** Pointer movement in seconds (positive = right). */
  deltaSec: number;
  targets: readonly number[];
  /** Snap distance in seconds; 0 turns snapping off. */
  threshold: number;
}

/** Move an overlay: the start never goes below zero, and either edge snaps to a magnet. */
export function previewOverlayMove(input: OverlayDragInput): OverlayDragResult {
  const wanted = Math.max(0, input.start + input.deltaSec);
  if (input.threshold <= 0) return { start: wanted, duration: input.duration, snappedTo: null };
  const s = snapSpan(wanted, input.duration, input.targets, input.threshold);
  return { start: Math.max(0, s.time), duration: input.duration, snappedTo: s.target };
}

/**
 * Resize an overlay from its right edge (changes duration, start fixed) or its left edge (changes start and
 * duration, end fixed). The duration never drops below {@link MIN_OVERLAY_DURATION} and the start never below zero.
 */
export function previewOverlayResize(
  input: OverlayDragInput & { edge: "start" | "end" },
): OverlayDragResult {
  const end = input.start + input.duration;
  let snappedTo: number | null = null;
  if (input.edge === "end") {
    let wantedEnd = end + input.deltaSec;
    if (input.threshold > 0) {
      const s = snapValue(wantedEnd, input.targets, input.threshold);
      if (s.target !== null) {
        wantedEnd = s.time;
        snappedTo = s.target;
      }
    }
    const duration = Math.max(MIN_OVERLAY_DURATION, wantedEnd - input.start);
    return { start: input.start, duration, snappedTo };
  }
  let wantedStart = input.start + input.deltaSec;
  if (input.threshold > 0) {
    const s = snapValue(wantedStart, input.targets, input.threshold);
    if (s.target !== null) {
      wantedStart = s.time;
      snappedTo = s.target;
    }
  }
  const start = Math.min(Math.max(0, wantedStart), end - MIN_OVERLAY_DURATION);
  return { start, duration: end - start, snappedTo };
}
