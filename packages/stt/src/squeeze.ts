// "Squeezing": long silences are shortened before recognition and word times are mapped back after.
// Whisper-family models invent text over silence and stamp the first word after a pause with the
// pause's start; never showing them long silences avoids both, and the audio is also shorter (faster).
// whisper.cpp's own --vad was measured to return wrong per-word times, so we do this ourselves.

import type { Range } from "@dax/core";
import type { RawWord } from "./whisper-json.js";

/** One kept stretch of the original audio and where it lands in the squeezed audio. */
export interface SqueezeSegment {
  /** Start in the original file (seconds). */
  origStart: number;
  /** End in the original file (seconds). */
  origEnd: number;
  /** Start in the squeezed audio (seconds). */
  sqStart: number;
}

/** How the original timeline maps onto the squeezed one. */
export interface SqueezePlan {
  /** Kept stretches in order; at least one. */
  segments: SqueezeSegment[];
  /** Silence inserted between consecutive segments (seconds). */
  gapSec: number;
  /** Length of the squeezed audio (seconds). */
  durationSec: number;
  /** Squeezed-time ranges around each join: good places to cut the audio into chunks. */
  joins: Range[];
}

/** Tuning for {@link planSqueeze}. */
export interface SqueezeOptions {
  /** Original quiet audio kept next to speech on each side of a removed silence. Default 0.3. */
  padSec?: number;
  /** Silence inserted at each join. Default 0.5. */
  gapSec?: number;
}

/**
 * Decide which parts of a `durationSec`-long file to keep, given its `quiet` ranges (see
 * `findQuietRanges`). Each quiet range long enough to be worth removing is cut down to `padSec` on
 * each side; leading and trailing quiet is cut to `padSec` next to the speech. With nothing to remove
 * the plan has one segment covering the whole file and the squeezed audio is identical to the input.
 */
export function planSqueeze(
  quiet: Range[],
  durationSec: number,
  opts: SqueezeOptions = {},
): SqueezePlan {
  const pad = opts.padSec ?? 0.3;
  const gap = opts.gapSec ?? 0.5;
  const kept: Range[] = [];
  let cursor = 0;
  for (const q of [...quiet].sort((a, b) => a.start - b.start)) {
    const atStart = q.start <= 0.001;
    const atEnd = q.end >= durationSec - 0.001;
    // Removing less than 0.2 s is not worth a join in the middle of the file.
    if (!atStart && !atEnd && q.end - q.start < 2 * pad + 0.2) continue;
    if (atStart) {
      cursor = Math.max(0, q.end - pad);
    } else if (atEnd) {
      kept.push({ start: cursor, end: Math.min(durationSec, q.start + pad) });
      cursor = durationSec;
    } else {
      kept.push({ start: cursor, end: q.start + pad });
      cursor = q.end - pad;
    }
  }
  if (cursor < durationSec) kept.push({ start: cursor, end: durationSec });
  const usable = kept.filter((r) => r.end - r.start > 0.05);
  // A file that is entirely quiet keeps its first stretch so the engine still has something to look at.
  const ranges = usable.length ? usable : [{ start: 0, end: durationSec }];
  const segments: SqueezeSegment[] = [];
  const joins: Range[] = [];
  let at = 0;
  ranges.forEach((r, i) => {
    if (i > 0) {
      const prev = segments[i - 1];
      const prevLen = prev ? prev.origEnd - prev.origStart : 0;
      joins.push({
        start: at - Math.min(pad, prevLen),
        end: at + gap + Math.min(pad, r.end - r.start),
      });
      at += gap;
    }
    segments.push({ origStart: r.start, origEnd: r.end, sqStart: at });
    at += r.end - r.start;
  });
  return { segments, gapSec: gap, durationSec: at, joins };
}

/** True when the plan keeps the whole file untouched. */
export function isIdentityPlan(plan: SqueezePlan, originalDurationSec: number): boolean {
  const only = plan.segments[0];
  return (
    plan.segments.length === 1 &&
    only !== undefined &&
    only.origStart === 0 &&
    only.origEnd >= originalDurationSec - 1e-6
  );
}

/**
 * Convert a time in the squeezed audio back to the original file. A time inside an inserted gap maps
 * to the edge of the nearest kept stretch on the side given by `edge`: `"start"` (a word's start)
 * snaps forward to the next stretch, `"end"` snaps back to the previous one.
 */
export function squeezedToOriginal(plan: SqueezePlan, t: number, edge: "start" | "end"): number {
  const segs = plan.segments;
  const first = segs[0];
  const last = segs[segs.length - 1];
  if (!first || !last) return t;
  if (t <= first.sqStart) return first.origStart + (t - first.sqStart);
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (!s) continue;
    const len = s.origEnd - s.origStart;
    if (t < s.sqStart + len || i === segs.length - 1) {
      return s.origStart + Math.min(t - s.sqStart, len);
    }
    const next = segs[i + 1];
    if (next && t < next.sqStart) return edge === "start" ? next.origStart : s.origEnd;
  }
  return last.origEnd;
}

/** Map words from squeezed time back to original time. Order and text are unchanged. */
export function mapWordsToOriginal(plan: SqueezePlan, words: RawWord[]): RawWord[] {
  return words.map((w) => {
    const start = squeezedToOriginal(plan, w.start, "start");
    const end = squeezedToOriginal(plan, w.end, "end");
    return { ...w, start, end: Math.max(start, end) };
  });
}
