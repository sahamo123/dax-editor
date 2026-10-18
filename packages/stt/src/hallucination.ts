// Post-filters for the ways Whisper-family models invent text: endless repeat loops and phrases
// ("Thank you.") written over silence. Pure functions over words; the decoder-side mitigations
// (no-speech threshold, temperature fallback) are flags in transcriber.ts.

import type { Range } from "@dax/core";
import type { RawWord } from "./whisper-json.js";

/** Lower-case letters and digits only, so `Okay,` and `okay` compare equal. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
}

/** Tuning for {@link collapseRepeatLoops}. */
export interface LoopFilterOptions {
  /** A single word repeated at least this many times in a row is a loop. Default 5. */
  minWordRepeats?: number;
  /** A phrase (2..8 words) repeated at least this many times in a row, and at least {@link minLoopWords} long in total, is a loop. Default 3. */
  minPhraseRepeats?: number;
  /** Minimum total number of repeated words for a phrase loop. Default 12. */
  minLoopWords?: number;
}

/** Result of {@link collapseRepeatLoops}. */
export interface LoopFilterResult {
  /** Words with every loop reduced to its first occurrence. */
  words: RawWord[];
  /** How many words were removed. */
  removed: number;
}

/**
 * Collapse runaway repetition ("the the the the the ...", or a whole sentence repeated again and
 * again), the most common Whisper failure on silence or music. Each loop keeps its first occurrence.
 *
 * Thresholds are deliberately high so natural repetition ("very, very good", "no no no") survives.
 * Footage that really repeats the same sentence many times would be collapsed too; disable the
 * filter with `loopFilter: false` in the transcriber options for such material.
 */
export function collapseRepeatLoops(
  words: RawWord[],
  opts: LoopFilterOptions = {},
): LoopFilterResult {
  const minWord = opts.minWordRepeats ?? 5;
  const minPhrase = opts.minPhraseRepeats ?? 3;
  const minWords = opts.minLoopWords ?? 12;
  const norm = words.map((w) => normalise(w.text));
  const out: RawWord[] = [];
  let removed = 0;
  let i = 0;
  while (i < words.length) {
    let skip = 0;
    let keep = 0;
    for (let n = 1; n <= 8 && i + 2 * n <= words.length; n++) {
      let reps = 1;
      while (sameBlock(norm, i, i + reps * n, n)) reps++;
      const isLoop = n === 1 ? reps >= minWord : reps >= minPhrase && reps * n >= minWords;
      if (isLoop && reps * n > skip + keep) {
        keep = n;
        skip = (reps - 1) * n;
      }
    }
    const next = words.slice(i, i + (keep || 1));
    out.push(...next);
    i += (keep || 1) + skip;
    removed += skip;
  }
  return { words: out, removed };
}

function sameBlock(norm: string[], a: number, b: number, n: number): boolean {
  if (b + n > norm.length) return false;
  for (let k = 0; k < n; k++) {
    const x = norm[a + k];
    if (!x || x !== norm[b + k]) return false;
  }
  return true;
}

/**
 * Drop words that sit (almost) entirely inside stretches the audio analysis found silent. Whisper
 * writes "Thank you." or "Thanks for watching." over silence; real speech never lies inside a
 * measured silence. `silences` come from FFmpeg `silencedetect` (see `detectSilence` in `@dax/core`)
 * and should be long (1 second or more) so quiet speech is not mistaken for silence.
 *
 * `minOverlap` is the fraction (0..1) of the word's duration that must lie in a silence; default 0.8.
 */
export function dropWordsInSilence(
  words: RawWord[],
  silences: Range[],
  minOverlap = 0.8,
): RawWord[] {
  if (silences.length === 0) return words;
  return words.filter((w) => {
    // A zero-length word (the engine does this at window ends) counts as inside if its instant is.
    if (w.end - w.start < 0.001)
      return !silences.some((s) => s.start <= w.start && w.start <= s.end);
    const dur = w.end - w.start;
    let inside = 0;
    for (const s of silences) {
      inside += Math.max(0, Math.min(w.end, s.end) - Math.max(w.start, s.start));
    }
    return inside / dur < minOverlap;
  });
}
