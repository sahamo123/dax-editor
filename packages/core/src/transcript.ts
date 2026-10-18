import type { Range } from "./schema.js";

export interface Word {
  text: string;
  /** Seconds, in the source file's own time. */
  start: number;
  end: number;
}

export interface Transcript {
  language?: string;
  words: Word[];
}

/** Anything that can turn a media file into a word-timed transcript (whisper.cpp, Parakeet, ...). */
export interface Transcriber {
  transcribe(path: string, opts?: { language?: string }): Promise<Transcript>;
}

export const DEFAULT_FILLERS = ["um", "umm", "uh", "uhh", "er", "erm", "hmm", "mm"];

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
}

/** Source-time ranges of filler words, ready for `removeAssetRanges`. */
export function findFillerRanges(
  t: Transcript,
  fillers: string[] = DEFAULT_FILLERS,
  pad = 0.02,
): Range[] {
  const set = new Set(fillers.map(normalise));
  return t.words
    .filter((w) => set.has(normalise(w.text)))
    .map((w) => ({ start: Math.max(0, w.start - pad), end: w.end + pad }));
}

/** Plain text of a transcript, with a [mm:ss] marker every `every` seconds. */
export function formatTranscript(t: Transcript, every = 15): string {
  const lines: string[] = [];
  let line: string[] = [];
  let next = 0;
  for (const w of t.words) {
    if (w.start >= next) {
      if (line.length) lines.push(line.join(" "));
      const mm = String(Math.floor(w.start / 60)).padStart(2, "0");
      const ss = String(Math.floor(w.start % 60)).padStart(2, "0");
      line = [`[${mm}:${ss}]`];
      next = w.start + every;
    }
    line.push(w.text.trim());
  }
  if (line.length) lines.push(line.join(" "));
  return lines.join("\n");
}
