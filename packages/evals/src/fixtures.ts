// Generates the synthetic footage that eval tasks run against, using FFmpeg so no media is committed.
// Fixtures with speech also have a known transcript (their ground truth), which checks and the oracle may use.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { ffmpegBin, type Transcript } from "@dax/core";
import type { FixtureName } from "./task.js";

const execFileAsync = promisify(execFile);

/** A spoken word in a fixture: its text and where it is in the file (seconds). */
export interface FixtureWord {
  text: string;
  start: number;
  end: number;
}

/** Pitch of the speech stand-in, in Hz. A steady tone, shaped into words. */
const SPEECH_HZ = 1500;
/** Peak amplitude of the speech stand-in (about -13 dBFS RMS). */
const SPEECH_PEAK = 0.3;
/** Pitch of the music bed, in Hz. Kept far from the speech so the two can be measured apart. */
export const MUSIC_HZ = 220;
/** Peak amplitude of the music bed: about -30 dBFS RMS, quiet under the speech. */
const MUSIC_PEAK = 0.0447;
/** Time constant of a word's decaying tail, in seconds. */
const TAIL_TAU = 0.04;

/** Words of the word-tails fixture: 0.5 s each, every 1.6 s, each with a 0.2 s decaying tail. */
const WORD_TAILS: FixtureWord[] = ["one", "two", "three", "four", "five"].map((text, k) => ({
  text,
  start: 1.6 * k,
  end: 1.6 * k + 0.5,
}));

/** Speech of the music-bed fixture: three phrases with 1.5 s gaps that hold only the music bed. */
const MUSIC_BED_WORDS: FixtureWord[] = [
  { text: "one", start: 0.5, end: 2.0 },
  { text: "two", start: 3.5, end: 5.0 },
  { text: "three", start: 6.5, end: 7.5 },
];

/** Words spaced 0.55 s apart from `from`, each 0.4 s long, so a phrase's internal gaps stay under the pause threshold. */
function phrase(words: string[], from: number): FixtureWord[] {
  return words.map((text, i) => ({ text, start: from + 0.55 * i, end: from + 0.55 * i + 0.4 }));
}

/**
 * Words of the retake fixture: "so the plan is simple" said twice (a retake), then a closing phrase. The two takes are
 * 1.2 s apart, so the planner splits them into phrases.
 */
const RETAKE_WORDS: FixtureWord[] = [
  ...phrase(["so", "the", "plan", "is", "simple"], 0.5),
  ...phrase(["so", "the", "plan", "is", "simple"], 4.3),
  ...phrase(["and", "we", "ship", "it"], 8.1),
];

/** Gap between joins in the sixty-joins fixture (seconds): a 0.3 s word and a 0.8 s pause, 61 words in all. */
const SIXTY_PERIOD = 1.1;
const SIXTY_WORDS: FixtureWord[] = Array.from({ length: 61 }, (_, k) => ({
  text: `w${k}`,
  start: SIXTY_PERIOD * k,
  end: SIXTY_PERIOD * k + 0.3,
}));

/** What each fixture sounds like, and how long it lasts. */
interface SoundSpec {
  seconds: number;
  words: FixtureWord[];
  /** Seconds of decaying tail after each word. */
  tail?: number;
  /** Whether a music bed plays under the whole file. */
  music?: boolean;
}

/** The sound of each generated fixture except `tone-silence-tone`, which keeps its own FFmpeg graph. */
const SOUND: Record<Exclude<FixtureName, "tone-silence-tone">, SoundSpec> = {
  "music-bed": { seconds: 8, words: MUSIC_BED_WORDS, music: true },
  "word-tails": { seconds: 8, words: WORD_TAILS, tail: 0.2 },
  "sixty-joins": { seconds: 66.8, words: SIXTY_WORDS },
  "retake-takes": { seconds: 10.5, words: RETAKE_WORDS },
};

/**
 * The transcript of a fixture with speech: its words, in the file's own time. Fixtures without speech return
 * undefined. The runner attaches this to the fixture's asset before a task starts.
 */
export function fixtureTranscript(name: FixtureName): Transcript | undefined {
  if (name === "tone-silence-tone" || name === "sixty-joins") return undefined;
  return { words: SOUND[name].words.map((w) => ({ ...w })) };
}

/**
 * The FFmpeg audio expression for a sound spec: speech tones shaped by each word (and its tail), plus a music bed if
 * asked. Quoted for `aevalsrc`, so it uses no single quotes.
 */
function soundExpression(spec: SoundSpec): string {
  const envelope = spec.words
    .flatMap((w) => {
      const body = `between(t,${w.start},${w.end})`;
      if (!spec.tail) return [body];
      return [body, `between(t,${w.end},${w.end + spec.tail})*exp(-(t-${w.end})/${TAIL_TAU})`];
    })
    .join("+");
  const speech = `${SPEECH_PEAK}*sin(2*PI*${SPEECH_HZ}*t)*(${envelope})`;
  return spec.music ? `${speech}+${MUSIC_PEAK}*sin(2*PI*${MUSIC_HZ}*t)` : speech;
}

/**
 * Create (or reuse) a synthetic test video in `dir` and return its path.
 * Fixtures are generated with FFmpeg so the repo stores no media files and
 * every machine gets byte-identical inputs.
 *
 * `tone-silence-tone`: 6 s, 320x240 @ 30 fps. Audio is a tone for 0-2 s,
 * silence for 2-4 s, and a tone again for 4-6 s.
 *
 * The other fixtures are described by the `SOUND` table: speech tone bursts at the words in {@link fixtureTranscript}, with
 * a music bed under the first (`music-bed`), a decaying tail after each word (`word-tails`), 61 short words separated by
 * 0.8 s pauses (`sixty-joins`), and a repeated phrase (`retake-takes`).
 */
export async function generateFixture(name: FixtureName, dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const out = join(dir, `${name}.mp4`);
  if (existsSync(out)) return out;

  switch (name) {
    case "tone-silence-tone":
      await execFileAsync(ffmpegBin(), [
        ...["-y", "-hide_banner", "-loglevel", "error"],
        ...["-f", "lavfi", "-i", "testsrc=d=6:s=320x240:r=30"],
        ...["-f", "lavfi", "-i", "sine=f=440:d=2"],
        ...["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=2"],
        ...["-f", "lavfi", "-i", "sine=f=440:d=2"],
        ...["-filter_complex", "[1:a][2:a][3:a]concat=n=3:v=0:a=1[a]"],
        ...["-map", "0:v", "-map", "[a]", "-c:v", "mpeg4", "-c:a", "aac", "-shortest"],
        out,
      ]);
      return out;
    default: {
      const spec = SOUND[name];
      await execFileAsync(ffmpegBin(), [
        ...["-y", "-hide_banner", "-loglevel", "error"],
        ...["-f", "lavfi", "-i", `testsrc=d=${spec.seconds}:s=320x240:r=30`],
        ...["-f", "lavfi", "-i", `aevalsrc='${soundExpression(spec)}':s=48000:d=${spec.seconds}`],
        ...["-map", "0:v", "-map", "1:a", "-c:v", "mpeg4", "-c:a", "aac", "-shortest"],
        out,
      ]);
      return out;
    }
  }
}
