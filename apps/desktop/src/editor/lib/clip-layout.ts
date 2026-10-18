// Pure maths for live feedback while dragging clips: ripple-trim previews and drag-to-reorder previews.
// The real edit is always done by the `trim_clip` / `move_clip` commands; these functions only predict
// what the timeline will look like so the UI can show it before the command round trip finishes.

import type { Clip } from "@dax/core";
import { clipDur } from "./project";
import { snapValue } from "./snap";
import { clamp } from "./time";

/** A clip as drawn: its timeline position plus the source slice it plays. */
export interface PlacedClip {
  id: string;
  assetId: string;
  /** Timeline second where the clip starts. */
  start: number;
  /** Source seconds. */
  in: number;
  out: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

/** Lay clips out back to back from zero, the way the gapless main track does. */
export function placeClips(clips: readonly Clip[]): PlacedClip[] {
  let t = 0;
  return clips.map((c) => {
    const placed: PlacedClip = {
      id: c.id,
      assetId: c.assetId,
      start: t,
      in: c.in,
      out: c.out,
      volume: c.volume,
      fadeIn: c.fadeIn,
      fadeOut: c.fadeOut,
    };
    t += clipDur(c);
    return placed;
  });
}

/** Re-pack already placed clips back to back (after one of them changed length). */
export function repack(clips: readonly PlacedClip[]): PlacedClip[] {
  let t = 0;
  return clips.map((c) => {
    const next = { ...c, start: t };
    t += clipDur(c);
    return next;
  });
}

/** Shortest length, in seconds, a clip can be trimmed to: one frame. */
export function minClipDuration(fps: number): number {
  return 1 / Math.max(1, fps);
}

/** Which edge of a clip is being trimmed. */
type TrimEdge = "start" | "end";

/** Inputs for {@link previewTrim}. */
export interface TrimInput {
  clips: readonly PlacedClip[];
  clipId: string;
  edge: TrimEdge;
  /** Pointer movement in seconds (positive = to the right). */
  deltaSec: number;
  /** Length of the clip's whole source file, which bounds how far the end can be extended. */
  assetDuration: number;
  fps: number;
  /** Timeline magnets (playhead, other edges) used to snap the end edge. Empty disables snapping. */
  targets?: readonly number[];
  /** Snap distance in seconds. */
  threshold?: number;
  /** Playhead time, used so the start edge can snap to "the frame under the playhead". */
  playhead?: number;
}

/** Result of {@link previewTrim}. */
export interface TrimPreview {
  /** All clips after the ripple (later clips shifted). */
  clips: PlacedClip[];
  /** The source in/out the trimmed clip will have. */
  in: number;
  out: number;
  /** The timeline time that was snapped to (to draw a guide line), or null. */
  snappedTo: number | null;
  /** True when the clip would end up unchanged. */
  unchanged: boolean;
}

/**
 * Predict a ripple trim. Dragging the end edge changes `out`; dragging the start edge changes `in` and keeps the
 * clip anchored in place (the track is gapless, so what follows slides to close the hole), exactly like `trim_clip`.
 * Both edges are limited to the source file and to at least one frame of length.
 */
export function previewTrim(input: TrimInput): TrimPreview {
  const idx = input.clips.findIndex((c) => c.id === input.clipId);
  const clip = input.clips[idx];
  if (!clip) throw new Error(`Unknown clip "${input.clipId}"`);
  const minDur = minClipDuration(input.fps);
  const threshold = input.threshold ?? 0;
  const targets = input.targets ?? [];
  let inPoint = clip.in;
  let outPoint = clip.out;
  let snappedTo: number | null = null;

  if (input.edge === "end") {
    let wanted = clip.out + input.deltaSec;
    // Snap in timeline space: where would the clip's end land on the timeline?
    if (threshold > 0) {
      const timelineEnd = clip.start + (wanted - clip.in);
      const s = snapValue(timelineEnd, targets, threshold);
      if (s.target !== null) {
        wanted = clip.in + (s.time - clip.start);
        snappedTo = s.target;
      }
      // Also snap to the end of the source file, so a clip can be restored to full length exactly.
      const full = snapValue(wanted, [input.assetDuration], threshold);
      if (full.target !== null && snappedTo === null) wanted = full.time;
    }
    outPoint = clamp(wanted, clip.in + minDur, input.assetDuration);
  } else {
    let wanted = clip.in + input.deltaSec;
    if (threshold > 0) {
      const sources: number[] = [0];
      if (
        input.playhead !== undefined &&
        input.playhead > clip.start &&
        input.playhead < clip.start + clipDur(clip)
      ) {
        sources.push(clip.in + (input.playhead - clip.start));
      }
      const s = snapValue(wanted, sources, threshold);
      if (s.target !== null) {
        wanted = s.time;
        snappedTo = s.target === 0 ? clip.start : (input.playhead ?? null);
      }
    }
    inPoint = clamp(wanted, 0, clip.out - minDur);
  }

  const changed = Math.abs(inPoint - clip.in) > 1e-6 || Math.abs(outPoint - clip.out) > 1e-6;
  const next = input.clips.map((c) =>
    c.id === clip.id ? { ...c, in: inPoint, out: outPoint } : c,
  );
  return { clips: repack(next), in: inPoint, out: outPoint, snappedTo, unchanged: !changed };
}

/** Result of {@link previewReorder}. */
export interface ReorderPreview {
  /** Index the dragged clip would take among all clips (the `index` argument for `move_clip`). */
  index: number;
  /** Timeline start of each *other* clip while a gap is held open at `index`, keyed by clip id. */
  starts: Map<string, number>;
  /** Timeline start of the gap where the dragged clip would land. */
  slotStart: number;
}

/**
 * Work out where a dragged clip would land. `draggedCenter` is the timeline time under the middle of the dragged
 * block. The dragged clip goes after every other clip whose midpoint is before it. Other clips are re-packed with
 * a gap the width of the dragged clip, so the UI can slide them aside while dragging.
 */
export function previewReorder(
  clips: readonly PlacedClip[],
  clipId: string,
  draggedCenter: number,
): ReorderPreview {
  const dragged = clips.find((c) => c.id === clipId);
  if (!dragged) throw new Error(`Unknown clip "${clipId}"`);
  const others = clips.filter((c) => c.id !== clipId);
  let index = 0;
  for (const c of others) if (c.start + clipDur(c) / 2 < draggedCenter) index++;
  // Midpoints come from the original layout, not the shifted preview, so the drop index is stable
  // while the neighbours animate out of the way.
  const starts = new Map<string, number>();
  let t = 0;
  let slotStart = 0;
  others.forEach((c, i) => {
    if (i === index) {
      slotStart = t;
      t += clipDur(dragged);
    }
    starts.set(c.id, t);
    t += clipDur(c);
  });
  if (index >= others.length) slotStart = t;
  return { index, starts, slotStart };
}

/** Clip ids in order after moving `clipId` to `index` (what `move_clip` does). */
export function reorderedIds(ids: readonly string[], clipId: string, index: number): string[] {
  const rest = ids.filter((id) => id !== clipId);
  rest.splice(clamp(index, 0, rest.length), 0, clipId);
  return rest;
}
