// Uses the audio's own loudness to (1) find quiet stretches and (2) tighten word times.
// whisper.cpp's token times are continuous: a word after a pause "starts" where the previous word
// ended and a word before a pause "ends" at the next word, so silence is credited to words.
// Pure maths plus one streamed WAV read.

import { createReadStream } from "node:fs";
import type { Range } from "@dax/core";
import { SttError } from "./errors.js";
import { parseWavHeader } from "./wav.js";
import type { RawWord } from "./whisper-json.js";

/** Loudness of a file in fixed steps. */
export interface EnergyEnvelope {
  /** Seconds per step (about 0.01). */
  frameSec: number;
  /** Mean-square level of each step in dB relative to one 16-bit sample unit (digital silence is about -30). */
  db: Float32Array;
}

/**
 * Measure loudness of a 16-bit mono PCM WAV in 10 ms steps. Streams the file, so memory is about
 * 4 bytes per 10 ms of audio (3 MB for two hours). Throws `bad-output` for any other format.
 */
export async function computeEnergyEnvelope(
  wavPath: string,
  frameSec = 0.01,
): Promise<EnergyEnvelope> {
  const out: number[] = [];
  let pending: Buffer = Buffer.alloc(0);
  let headerDone = false;
  let frameSamples = 1;
  let sampleRate = 16000;
  let sumSq = 0;
  let inFrame = 0;
  let size = 0;
  for await (const raw of createReadStream(wavPath)) {
    size += (raw as Buffer).length;
    let buf: Buffer = raw as Buffer;
    if (!headerDone) {
      pending = Buffer.concat([pending, buf]);
      // The header is tiny; the file size is not known yet, so assume the data runs to the end.
      const info = parseWavHeader(pending, Number.MAX_SAFE_INTEGER);
      if (!info) {
        if (pending.length > 1 << 20) throw new SttError("bad-output", "WAV header is malformed.");
        continue;
      }
      if (info.bitsPerSample !== 16 || info.channels !== 1) {
        throw new SttError("bad-output", "Energy analysis needs a mono 16-bit WAV.");
      }
      sampleRate = info.sampleRate;
      frameSamples = Math.max(1, Math.round(sampleRate * frameSec));
      headerDone = true;
      buf = pending.subarray(info.dataOffset);
      pending = Buffer.alloc(0);
    }
    const all: Buffer = pending.length ? Buffer.concat([pending, buf]) : buf;
    const usable = all.length - (all.length % 2);
    for (let i = 0; i < usable; i += 2) {
      const s = all.readInt16LE(i);
      sumSq += s * s;
      if (++inFrame === frameSamples) {
        out.push(10 * Math.log10(sumSq / frameSamples + 1e-3));
        sumSq = 0;
        inFrame = 0;
      }
    }
    pending = all.subarray(usable);
  }
  if (!headerDone)
    throw new SttError("bad-output", `WAV file is empty or truncated (${size} bytes).`);
  return { frameSec: frameSamples / sampleRate, db: Float32Array.from(out) };
}

/** Level above which a frame counts as voiced: `marginDb` over the 5th-percentile floor, capped below the loud end. */
function voicedThreshold(env: EnergyEnvelope, marginDb: number): number {
  const sorted = Float32Array.from(env.db).sort();
  const n = sorted.length;
  const floor = sorted[Math.floor(n * 0.05)] ?? -30;
  const peak = sorted[Math.floor(n * 0.98)] ?? floor;
  // Never let the threshold climb into the speech itself on files that are loud everywhere.
  return Math.min(floor + marginDb, peak - 25);
}

/** Tuning for {@link findQuietRanges}. */
export interface QuietOptions {
  /** A frame is voiced when it is this many dB above the file's quiet floor. Default 12. */
  marginDb?: number;
  /** Shortest quiet stretch to report, in seconds. Default 1.2. */
  minSec?: number;
  /** Shortest quiet stretch to report when it touches the start or end of the file. Default 0.5. */
  edgeMinSec?: number;
}

/**
 * Stretches of at least `minSec` seconds with no voiced frame, sorted, in the file's own time. The
 * level that counts as voiced adapts to the recording's noise floor, so a quiet room and a noisy one
 * both work; speech never contains a second without a single voiced frame.
 */
export function findQuietRanges(env: EnergyEnvelope, opts: QuietOptions = {}): Range[] {
  const n = env.db.length;
  if (n === 0) return [];
  const thr = voicedThreshold(env, opts.marginDb ?? 12);
  const minSec = opts.minSec ?? 1.2;
  const edgeMin = opts.edgeMinSec ?? 0.5;
  const f = env.frameSec;
  const out: Range[] = [];
  let runStart = -1;
  const close = (endFrame: number) => {
    if (runStart < 0) return;
    const start = runStart * f;
    const end = endFrame * f;
    const atEdge = runStart === 0 || endFrame >= n;
    if (end - start >= (atEdge ? edgeMin : minSec)) out.push({ start, end });
    runStart = -1;
  };
  for (let i = 0; i < n; i++) {
    const voiced = (env.db[i] ?? -Infinity) > thr;
    if (!voiced && runStart < 0) runStart = i;
    else if (voiced) close(i);
  }
  close(n);
  return out;
}

/** Tuning for {@link trimWordsToSpeech}. */
export interface TrimOptions {
  /** A frame is voiced when it is this many dB above the file's quiet floor. Default 12. */
  marginDb?: number;
  /** Only trim when at least this many seconds at an edge are unvoiced. Default 0.04. */
  minTrimSec?: number;
  /** A pause this long inside a word's span ends the word (it cannot be one word). Default 0.25. */
  maxInnerGapSec?: number;
}

/**
 * Shrink each word's [start, end] to the first voiced run inside its span.
 *
 * Start moves to the first voiced frame; end stops at the first pause longer than `maxInnerGapSec`
 * after that (so a word stretched across a silence loses the silence), or at the last voiced frame.
 * A word with no voiced frame inside its span is left untouched, and no time is ever moved outside
 * the span the engine gave, so word order is preserved. Returns new objects.
 */
export function trimWordsToSpeech(
  words: RawWord[],
  env: EnergyEnvelope,
  opts: TrimOptions = {},
): RawWord[] {
  const n = env.db.length;
  if (n === 0) return words;
  const thr = voicedThreshold(env, opts.marginDb ?? 12);
  const minTrim = opts.minTrimSec ?? 0.04;
  const f = env.frameSec;
  const maxGap = Math.round((opts.maxInnerGapSec ?? 0.25) / f);
  const voiced = (i: number) => (env.db[i] ?? -Infinity) > thr;
  return words.map((w) => {
    const from = Math.max(0, Math.floor(w.start / f));
    const to = Math.min(n, Math.ceil(w.end / f));
    let a = from;
    while (a < to && !voiced(a)) a++;
    if (a >= to) return w;
    // Walk forward through voiced frames, bridging short dips (stop consonants), until a real pause.
    let b = a;
    let gap = 0;
    for (let i = a; i < to; i++) {
      if (voiced(i)) {
        b = i;
        gap = 0;
      } else if (++gap > maxGap) break;
    }
    const start = (a - from) * f >= minTrim ? a * f : w.start;
    const end = (to - 1 - b) * f >= minTrim ? (b + 1) * f : w.end;
    return { ...w, start, end: Math.max(start, end) };
  });
}
