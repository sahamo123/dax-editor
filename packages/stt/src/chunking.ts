// Long-file strategy: split audio into chunks at silences (overlapping only when no silence exists),
// and merge per-chunk words back onto one timeline. Pure maths, no I/O.

import type { Range } from "@dax/core";
import type { RawWord } from "./whisper-json.js";

/** One piece of the audio to transcribe. All times are seconds in the full file. */
export interface Chunk {
  /** First second of audio handed to the engine. */
  start: number;
  /** Last second of audio handed to the engine. */
  end: number;
  /** Words whose midpoint lies in [ownStart, ownEnd) belong to this chunk; others are overlap duplicates. */
  ownStart: number;
  /** See {@link Chunk.ownStart}. */
  ownEnd: number;
}

/** Tuning for {@link planChunks}. */
export interface ChunkOptions {
  /** Target chunk length in seconds. Default 600 (10 minutes). */
  chunkSec?: number;
  /** How far before the target a cut may move to land in a silence. Default 60. */
  searchSec?: number;
  /** Audio shared by neighbouring chunks after a hard cut (no silence found). Default 3. */
  overlapSec?: number;
  /** Silences shorter than this are not used as cut points. Default 0.4. */
  minSilenceSec?: number;
}

/**
 * Plan chunks for a file of `durationSec` seconds.
 *
 * A file no longer than `chunkSec * 1.25` is one chunk: the engine's own 30-second windowing with
 * context carry-over gives the best accuracy, so we only split when memory, cancel latency and
 * crash recovery matter. Longer files are cut near each multiple of `chunkSec`, in the middle of
 * the longest silence within `searchSec` before it, so no word is cut in half and chunks do not
 * overlap. With no usable silence the cut is hard: neighbours share `overlapSec` of audio on each
 * side of it and {@link mergeChunkWords} keeps each word from exactly one chunk.
 *
 * Throws if `durationSec` is not positive or an option is out of range.
 */
export function planChunks(
  durationSec: number,
  silences: Range[] = [],
  opts: ChunkOptions = {},
): Chunk[] {
  const chunkSec = opts.chunkSec ?? 600;
  const searchSec = opts.searchSec ?? 60;
  const overlap = opts.overlapSec ?? 3;
  const minSil = opts.minSilenceSec ?? 0.4;
  if (!(durationSec > 0)) throw new Error(`durationSec must be positive, got ${durationSec}`);
  if (!(chunkSec > 0) || !(searchSec >= 0) || !(overlap >= 0)) {
    throw new Error("chunkSec must be positive; searchSec and overlapSec must not be negative");
  }
  if (durationSec <= chunkSec * 1.25) {
    return [{ start: 0, end: durationSec, ownStart: 0, ownEnd: durationSec }];
  }
  const cuts: { at: number; hard: boolean }[] = [];
  let pos = 0;
  while (durationSec - pos > chunkSec * 1.25) {
    const target = pos + chunkSec;
    // Never cut earlier than half a chunk, or tiny chunks would pile up.
    const lo = Math.max(pos + chunkSec * 0.5, target - searchSec);
    let best: Range | undefined;
    for (const s of silences) {
      const a = Math.max(s.start, lo);
      const b = Math.min(s.end, target);
      if (b - a < minSil) continue;
      if (!best || b - a >= best.end - best.start) best = { start: a, end: b };
    }
    const cut = best
      ? { at: (best.start + best.end) / 2, hard: false }
      : { at: target, hard: true };
    cuts.push(cut);
    pos = cut.at;
  }
  const bounds = [0, ...cuts.map((c) => c.at), durationSec];
  return bounds.slice(0, -1).map((ownStart, i) => {
    const ownEnd = bounds[i + 1] ?? durationSec;
    const hardBefore = i > 0 && cuts[i - 1]?.hard === true;
    const hardAfter = cuts[i]?.hard === true;
    return {
      start: hardBefore ? Math.max(0, ownStart - overlap) : ownStart,
      end: hardAfter ? Math.min(durationSec, ownEnd + overlap) : ownEnd,
      ownStart,
      ownEnd,
    };
  });
}

/**
 * Put per-chunk words onto the full file's timeline.
 *
 * `perChunk[i]` holds the words of `chunks[i]` with times relative to that chunk's `start`. Each is
 * shifted by `chunks[i].start`; words whose midpoint falls outside the chunk's own range are dropped
 * (they are the duplicate side of an overlap). Throws if the arrays differ in length.
 */
export function mergeChunkWords(chunks: Chunk[], perChunk: RawWord[][]): RawWord[] {
  if (chunks.length !== perChunk.length) {
    throw new Error(`expected words for ${chunks.length} chunks, got ${perChunk.length}`);
  }
  const out: RawWord[] = [];
  chunks.forEach((chunk, i) => {
    const isFirst = i === 0;
    const isLast = i === chunks.length - 1;
    for (const w of perChunk[i] ?? []) {
      const shifted = { ...w, start: w.start + chunk.start, end: w.end + chunk.start };
      const mid = (shifted.start + shifted.end) / 2;
      // The first and last chunks own everything beyond the file edges (timestamps may overshoot slightly).
      const afterStart = isFirst || mid >= chunk.ownStart;
      const beforeEnd = isLast || mid < chunk.ownEnd;
      if (afterStart && beforeEnd) out.push(shifted);
    }
  });
  return out;
}
