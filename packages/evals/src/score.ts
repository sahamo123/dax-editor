// Evaluates a task's checks against a finished edit.

import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  analyzeAudio,
  clippedTailRatio,
  detectSilence,
  exportProject,
  ffmpegBin,
  ffprobeBin,
  mainClips,
  mergeRanges,
  type Project,
  probe,
  type Range,
  timelineDuration,
} from "@dax/core";
import type { Check } from "./task.js";

const execFileAsync = promisify(execFile);

/** Outcome of running a task's checks. */
export interface ScoreResult {
  /** True only if every check passed. */
  pass: boolean;
  /** One human-readable line per failed check. */
  failures: string[];
}

/** Sample rate of the sound the tone check decodes, in Hz. Enough for the tones the fixtures use. */
const TONE_RATE = 16000;
/** Length of the windows the tone check measures, in seconds. The same 20 ms frames the cut engine uses. */
const TONE_WINDOW = 0.02;
/** How far a kept range may start or end from the footage it asks for, in seconds (one frame at 50 fps). */
const KEPT_TOLERANCE = 0.02;

/**
 * Evaluate `checks` against the finished edit. Checks that need the actual
 * picture or sound (such as silence) render the project to a temporary file
 * first, so they are slower than pure timeline checks.
 */
export async function runChecks(project: Project, checks: Check[]): Promise<ScoreResult> {
  const failures: string[] = [];

  for (const check of checks) {
    switch (check.type) {
      case "duration": {
        const d = timelineDuration(project);
        if (d < check.min || d > check.max) {
          failures.push(`duration ${d.toFixed(2)}s is outside [${check.min}, ${check.max}]`);
        }
        break;
      }
      case "clipCount": {
        const n = mainClips(project).length;
        if (check.min !== undefined && n < check.min)
          failures.push(`${n} clips, wanted >= ${check.min}`);
        if (check.max !== undefined && n > check.max)
          failures.push(`${n} clips, wanted <= ${check.max}`);
        break;
      }
      case "noSilenceLongerThan": {
        const found = await silencesInRender(project, check.seconds);
        if (found > 0) {
          failures.push(
            `output still has ${found} silent stretch(es) of ${check.seconds}s or more`,
          );
        }
        break;
      }
      case "toneSeconds": {
        const seconds = await withRender(project, async (file) =>
          toneSeconds(await decodeMono(file), TONE_RATE, check.hz, check.minDb),
        );
        if (check.min !== undefined && seconds < check.min) {
          failures.push(
            `a ${check.hz} Hz tone is heard for ${seconds.toFixed(2)}s, at least ${check.min}s wanted`,
          );
        }
        if (check.max !== undefined && seconds > check.max) {
          failures.push(
            `a ${check.hz} Hz tone is heard for ${seconds.toFixed(2)}s, at most ${check.max}s wanted`,
          );
        }
        break;
      }
      case "clippedTail": {
        const asset = editedAsset(project);
        if (!asset?.transcript) {
          failures.push("clippedTail needs a transcript on the edited asset");
          break;
        }
        // The source's own loudness and words, with everything the edit does not use counted as removed.
        const levels = await analyzeAudio(asset.path);
        const ratio = clippedTailRatio(
          levels,
          asset.transcript.words,
          removedSource(project, asset.id, asset.duration),
        );
        if (ratio > check.max) {
          failures.push(
            `${pct(ratio)} of the word-tail energy is cut, at most ${pct(check.max)} allowed`,
          );
        }
        break;
      }
      case "avSync": {
        const frame = 1 / project.timeline.fps;
        await withRender(project, async (file) => {
          const ends = await streamEnds(file);
          const gap = Math.abs(ends.video - ends.audio);
          if (gap > check.maxFrames * frame + 1e-9) {
            failures.push(
              `picture and sound end ${(gap * 1000).toFixed(1)} ms apart, at most ${check.maxFrames} frame(s) (${(check.maxFrames * frame * 1000).toFixed(1)} ms) allowed`,
            );
          }
        });
        break;
      }
      case "sourceKept": {
        const asset = editedAsset(project);
        const kept = keptSource(project, asset?.id);
        for (const r of check.ranges) {
          const whole = kept.some(
            (k) => k.start <= r.start + KEPT_TOLERANCE && k.end >= r.end - KEPT_TOLERANCE,
          );
          if (!whole) {
            failures.push(`source ${r.start.toFixed(2)}-${r.end.toFixed(2)}s is not fully kept`);
          }
        }
        break;
      }
    }
  }

  return { pass: failures.length === 0, failures };
}

/** Format a 0 to 1 share as a whole percentage. */
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The asset the edit is about: the one under the first clip on the main track (eval tasks use one asset). */
function editedAsset(project: Project) {
  const first = mainClips(project)[0];
  return first ? project.assets[first.assetId] : undefined;
}

/** The footage of `assetId` that the main track keeps, in source seconds, merged. */
function keptSource(project: Project, assetId: string | undefined): Range[] {
  return mergeRanges(
    mainClips(project)
      .filter((c) => c.assetId === assetId)
      .map((c) => ({ start: c.in, end: c.out })),
  );
}

/** The parts of `[0, duration]` of `assetId` that the edit does not keep, in source seconds. */
function removedSource(project: Project, assetId: string, duration: number): Range[] {
  const out: Range[] = [];
  let t = 0;
  for (const r of keptSource(project, assetId)) {
    if (r.start > t) out.push({ start: t, end: r.start });
    t = Math.max(t, r.end);
  }
  if (t < duration) out.push({ start: t, end: duration });
  return out;
}

/**
 * Seconds of `samples` that carry a steady tone at `hz`. Each 20 ms window counts when the tone's peak amplitude
 * is at least `minDb` dBFS. The tone is measured with the Goertzel algorithm, so other tones and speech do not count.
 */
export function toneSeconds(samples: Int16Array, rate: number, hz: number, minDb: number): number {
  const n = Math.round(rate * TONE_WINDOW);
  const coeff = 2 * Math.cos((2 * Math.PI * hz) / rate);
  const threshold = 10 ** (minDb / 20);
  let windows = 0;
  let loud = 0;
  for (let start = 0; start + n <= samples.length; start += n) {
    let q1 = 0;
    let q2 = 0;
    for (let i = start; i < start + n; i++) {
      const q0 = coeff * q1 - q2 + (samples[i] ?? 0) / 32768;
      q2 = q1;
      q1 = q0;
    }
    const power = q1 * q1 + q2 * q2 - coeff * q1 * q2;
    // The peak amplitude of a sine of `power` over n samples is 2 * sqrt(power) / n.
    if ((2 * Math.sqrt(Math.max(0, power))) / n >= threshold) loud++;
    windows++;
  }
  return windows === 0 ? 0 : loud * TONE_WINDOW;
}

/**
 * End time, in seconds, of the first video and first audio stream of `file` (start time plus duration, from ffprobe).
 * The drift check compares the two.
 */
export async function streamEnds(file: string): Promise<{ video: number; audio: number }> {
  const { stdout } = await execFileAsync(
    ffprobeBin(),
    ["-v", "error", "-show_entries", "stream=codec_type,start_time,duration", "-of", "json", file],
    { maxBuffer: 1024 * 1024 },
  );
  const streams =
    (
      JSON.parse(stdout) as {
        streams?: { codec_type?: string; start_time?: string; duration?: string }[];
      }
    ).streams ?? [];
  const end = (kind: string): number => {
    const s = streams.find((x) => x.codec_type === kind);
    const duration = Number(s?.duration);
    if (!s || !Number.isFinite(duration))
      throw new Error(`${file} has no measurable ${kind} stream`);
    return Number(s.start_time ?? 0) + duration;
  };
  return { video: end("video"), audio: end("audio") };
}

/** Decode a file's first audio stream to mono 16-bit PCM at {@link TONE_RATE}. */
function decodeMono(file: string): Promise<Int16Array> {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegBin(),
      [
        "-v",
        "error",
        "-nostdin",
        "-i",
        file,
        "-vn",
        "-ac",
        "1",
        "-ar",
        String(TONE_RATE),
        "-f",
        "s16le",
        "-",
      ],
      { encoding: "buffer", maxBuffer: 512 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err);
        // Copy into an aligned buffer; a pooled Buffer may not start on an even byte.
        const bytes = stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.length);
        resolve(new Int16Array(bytes));
      },
    );
  });
}

/**
 * Render the project to a temporary file, run `use` on it, and delete that folder afterwards. Checks that need the
 * picture or the sound go through here.
 */
async function withRender<T>(project: Project, use: (file: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "dax-eval-"));
  try {
    const out = join(dir, "out.mp4");
    await exportProject(project, out);
    return await use(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Render to a temp file and count silences of at least `minSeconds`. */
async function silencesInRender(project: Project, minSeconds: number): Promise<number> {
  return withRender(project, async (out) => {
    const asset = await probe(out);
    const silences = await detectSilence(out, asset.duration, { minDuration: minSeconds });
    return silences.length;
  });
}
