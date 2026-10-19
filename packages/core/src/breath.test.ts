// Breath attenuation: a breath inside a pause is kept and quietened by 12 dB, not deleted with the pause.
// Unit tests use hand-made loudness frames; the "real audio" tests synthesise sound with FFmpeg (no media is committed).

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCommand } from "./commands.js";
import { type AudioLevels, planCuts, planRanges } from "./cuts.js";
import { probe } from "./media.js";
import { exportProject } from "./render.js";
import type { Word } from "./schema.js";
import { Session } from "./session.js";
import { addAsset, appendClip, emptyProject, setAssetTranscript } from "./timeline.js";

/** Build words from "text@start-end" pieces. */
const w = (...pieces: string[]): Word[] =>
  pieces.map((p) => {
    const [text = "", range = ""] = p.split("@");
    const [s = "0", e = "0"] = range.split("-");
    return { text, start: Number(s), end: Number(e) };
  });

/** Loudness frames of 20 ms for `seconds` of audio at `room` dBFS, with `loud` (from, to, dB) stretches laid on top. */
function frames(seconds: number, room: number, loud: [number, number, number][]): AudioLevels {
  const db = Array<number>(Math.round(seconds / 0.02)).fill(room);
  for (const [from, to, level] of loud) {
    for (let i = Math.round(from / 0.02); i < Math.round(to / 0.02); i++) db[i] = level;
  }
  return { frameSeconds: 0.02, db };
}

/** Two words, 1.0 s apart; the speech itself is at -20 dBFS over a -60 dBFS room. */
const WORDS = w("hello@0-0.8", "world@1.8-2.6");
const SPEECH: [number, number, number][] = [
  [0, 0.8, -20],
  [1.8, 2.6, -20],
];

describe("breaths in a pause (unit)", () => {
  it("keeps a 0.4 s breath in the pause and cuts only the silence after it", () => {
    const levels = frames(2.8, -60, [...SPEECH, [1.1, 1.5, -38]]);
    const plan = planCuts({ assetId: "a1", duration: 2.8, words: WORDS, levels });
    const breath = plan.decisions.find((d) => d.kind === "breath");
    expect(breath?.status).toBe("approved");
    expect(breath?.range.start).toBeCloseTo(1.1, 2);
    expect(breath?.range.end).toBeCloseTo(1.5, 2);
    // The removal starts 0.1 s after the breath and never covers it.
    const removed = planRanges(plan);
    expect(removed).toHaveLength(1);
    expect(removed[0]?.start).toBeCloseTo(1.6, 2);
    expect(removed[0]?.end).toBeCloseTo(1.7, 2);
    expect(plan.decisions.some((d) => d.kind === "non_silent_gap")).toBe(false);
  });

  it("does not count a breath in approvedSeconds (it is attenuated, not removed)", () => {
    const levels = frames(2.8, -60, [...SPEECH, [1.1, 1.5, -38]]);
    const plan = planCuts({ assetId: "a1", duration: 2.8, words: WORDS, levels });
    expect(plan.approvedSeconds).toBeCloseTo(0.1, 2);
  });

  it("does not keep a burst at speech level as a breath, and still lists the gap as not silent", () => {
    const levels = frames(2.8, -60, [...SPEECH, [1.1, 1.5, -20]]);
    const plan = planCuts({ assetId: "a1", duration: 2.8, words: WORDS, levels });
    expect(plan.decisions.some((d) => d.kind === "breath")).toBe(false);
    expect(plan.decisions.some((d) => d.kind === "non_silent_gap")).toBe(true);
  });

  it("does not treat a 0.1 s click as a breath (too short), so the pause is cut as before", () => {
    const levels = frames(2.8, -60, [...SPEECH, [1.1, 1.2, -38]]);
    const plan = planCuts({ assetId: "a1", duration: 2.8, words: WORDS, levels });
    expect(plan.decisions.some((d) => d.kind === "breath")).toBe(false);
    expect(planRanges(plan)[0]?.start).toBeCloseTo(0.8 + 0.2, 2);
  });

  it("does not treat a breath-like sound that touches a word as a breath (word tails stay speech)", () => {
    const levels = frames(2.8, -60, [...SPEECH, [0.85, 1.25, -38]]);
    const plan = planCuts({ assetId: "a1", duration: 2.8, words: WORDS, levels });
    expect(plan.decisions.some((d) => d.kind === "breath")).toBe(false);
  });

  it("uses no breath kind without loudness frames (no levels, no attenuation)", () => {
    const plan = planCuts({ assetId: "a1", duration: 2.8, words: WORDS });
    expect(plan.decisions.some((d) => d.kind === "breath")).toBe(false);
  });
});

/** Band-limited RMS (dBFS) of `seconds` of `file` from `from`, measured with FFmpeg's bandpass and astats. */
function bandDb(file: string, from: number, seconds: number, hz: number, widthHz: number): number {
  const run = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-i",
      file,
      "-vn",
      // Downmix first: astats' overall level of a stereo file is 3 dB above a mono one with the same sound.
      "-ac",
      "1",
      // atrim, not -ss/-t: input seeking here read the wrong samples, which made the window contain speech.
      "-af",
      `atrim=start=${from}:duration=${seconds},bandpass=f=${hz}:width_type=h:w=${widthHz},astats=metadata=0`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  // astats prints one block per channel and an "Overall" block last; the last RMS line is the mono overall.
  const last = [...run.stderr.matchAll(/RMS level dB: (-?[\d.]+|-inf)/g)].at(-1)?.[1];
  if (last === undefined) throw new Error(`astats printed no RMS level: ${run.stderr.slice(-300)}`);
  return last === "-inf" ? Number.NEGATIVE_INFINITY : Number(last);
}

/** Mono 16 kHz samples of a file, for the click check. */
function samples(file: string): Int16Array {
  const pcm = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  return new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
}

/** Sample rate of the synthetic recording. */
const RATE = 48000;

/**
 * The synthetic recording's sound, 2.8 s: a 1 kHz word at -20 dBFS at 0-0.8 and 1.8-2.6 s, room tone at -60 dBFS, and a
 * 0.4 s breath (band-limited noise, calibrated to -38 dBFS RMS) at 1.1-1.5 s, inside the 1.0 s pause. Seeded, so every
 * run gets the same samples.
 */
function fixtureAudio(): Float32Array {
  const n = Math.round(2.8 * RATE);
  // Uniform noise in [-1, 1) has an RMS of 1/sqrt(3), so the scale below is the RMS wanted, times sqrt(3).
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 2 ** 32) * 2 - 1;
  };
  const room = 10 ** (-60 / 20) * Math.sqrt(3);
  // Band-limit the breath noise (1800 Hz centre, Q 1.125: roughly 1.6 kHz wide) with a biquad.
  const bp = bandpassCoefficients(1800, 1.125, RATE);
  const band = new Float32Array(n);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < n; i++) {
    const x = rand();
    const y = bp.b0 * x + bp.b2 * x2 - bp.a1 * y1 - bp.a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    band[i] = y;
  }
  // Calibrate the band-limited noise over the breath itself to -38 dBFS RMS.
  const from = Math.round(1.1 * RATE);
  const to = Math.round(1.5 * RATE);
  let power = 0;
  for (let i = from; i < to; i++) power += (band[i] ?? 0) ** 2;
  const breathScale = 10 ** (-38 / 20) / Math.sqrt(power / (to - from));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const word = t < 0.8 || (t >= 1.8 && t < 2.6) ? 0.1414 * Math.sin(2 * Math.PI * 1000 * t) : 0;
    const breath = t >= 1.1 && t < 1.5 ? (band[i] ?? 0) * breathScale : 0;
    out[i] = word + breath + room * rand();
  }
  return out;
}

/** Coefficients of a biquad bandpass (RBJ cookbook, 0 dB peak gain), normalised so a0 is 1. */
function bandpassCoefficients(hz: number, q: number, rate: number) {
  const w0 = (2 * Math.PI * hz) / rate;
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: alpha / a0,
    b2: -alpha / a0,
    a1: (-2 * Math.cos(w0)) / a0,
    a2: (1 - alpha) / a0,
  };
}

/**
 * Write 16-bit PCM WAV at {@link RATE} with the same signal on both channels. Stereo, because the render outputs stereo:
 * a mono file upmixed to stereo is 3 dB quieter per channel, which would look like an edit in the measurements.
 * Samples are clipped to [-1, 1].
 */
function writeWav(path: string, samples: Float32Array): void {
  const data = Buffer.alloc(samples.length * 4);
  samples.forEach((v, i) => {
    const s = Math.round(Math.max(-1, Math.min(1, v)) * 32767);
    data.writeInt16LE(s, i * 4);
    data.writeInt16LE(s, i * 4 + 2);
  });
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(2, 22); // stereo
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
}

/** Run FFmpeg quietly with the given arguments; throws with FFmpeg's message on failure. */
function ff(args: string[]): void {
  execFileSync("ffmpeg", ["-y", "-v", "error", ...args]);
}

describe.skipIf(!hasFfmpeg())("breath attenuation on real audio (needs ffmpeg)", () => {
  let dir: string;
  let src: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "dax-breath-"));
    src = join(dir, "breath.mov");
    const wav = join(dir, "breath.wav");
    writeWav(wav, fixtureAudio());
    // Picture from FFmpeg, sound from the WAV above. The sound is generated in code, so no filter graph changes its levels.
    ff([
      "-f",
      "lavfi",
      "-i",
      "testsrc=d=2.8:s=160x120:r=30",
      "-i",
      wav,
      "-map",
      "0:v",
      "-map",
      "1:a",
      "-c:v",
      "mpeg4",
      "-c:a",
      "pcm_s16le",
      src,
    ]);
  }, 60_000);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  /** Run smart_cut on the synthetic recording and return the session and the exported file. */
  async function smartCut(name: string) {
    const a = await probe(src);
    const project = setAssetTranscript(
      appendClip(addAsset(emptyProject(name, { width: 160, height: 120, fps: 30 }), a), a.id),
      a.id,
      { words: WORDS },
    );
    const session = new Session(project);
    const r = await runCommand({ session }, "smart_cut", {});
    const out = join(dir, `${name}.mp4`);
    await exportProject(session.project, out);
    return { session, out, summary: r.summary };
  }

  it("the input breath is about -38 dB in its band (the fixture is what the test claims)", () => {
    expect(bandDb(src, 1.15, 0.3, 1800, 1600)).toBeGreaterThan(-42);
    expect(bandDb(src, 1.15, 0.3, 1800, 1600)).toBeLessThan(-34);
  });

  it("keeps the breath and makes it about 12 dB quieter, measured in its band", async () => {
    const { out } = await smartCut("kept");
    // Nothing before the breath is removed, so the breath sits at the same time in the output.
    const before = bandDb(src, 1.15, 0.3, 1800, 1600);
    const after = bandDb(out, 1.15, 0.3, 1800, 1600);
    expect(after).toBeGreaterThan(-60); // still there, not removed
    expect(Math.abs(after - before + 12)).toBeLessThan(1);
  }, 90_000);

  it("leaves the speech unchanged, before and after the pause that was shortened", async () => {
    const { out } = await smartCut("speech");
    // Word 1 is before any edit. Word 2 moves 0.1 s earlier, because the silence after the breath is shorter.
    expect(
      Math.abs(bandDb(out, 0.2, 0.4, 1000, 200) - bandDb(src, 0.2, 0.4, 1000, 200)),
    ).toBeLessThan(0.3);
    expect(
      Math.abs(bandDb(out, 1.8, 0.4, 1000, 200) - bandDb(src, 1.9, 0.4, 1000, 200)),
    ).toBeLessThan(0.3);
  }, 90_000);

  it("has no click at the breath edges: the largest sample step there is no bigger than the input's", async () => {
    const { out } = await smartCut("clicks");
    const inS = samples(src);
    const outS = samples(out);
    const rate = 16000;
    const maxStep = (s: Int16Array, from: number, to: number) => {
      let m = 0;
      for (let i = Math.max(1, Math.round(from * rate)); i < Math.round(to * rate); i++) {
        m = Math.max(m, Math.abs((s[i] ?? 0) - (s[i - 1] ?? 0)));
      }
      return m;
    };
    // A 5 ms window either side of each breath edge (1.1 s and 1.5 s in both files: nothing moved before them).
    for (const edge of [1.1, 1.5]) {
      const input = maxStep(inS, edge - 0.005, edge + 0.005);
      const output = maxStep(outS, edge - 0.005, edge + 0.005);
      expect(output).toBeLessThanOrEqual(Math.max(input, 1) * 1.5);
    }
  }, 90_000);

  it("a second run is a no-op (idempotent): the project does not change", async () => {
    const { session } = await smartCut("twice");
    const once = JSON.stringify(session.project);
    const r = await runCommand({ session }, "smart_cut", {});
    expect(r.summary).toMatch(/No cuts needed/);
    expect(JSON.stringify(session.project)).toBe(once);
  }, 90_000);

  it("undo returns to the project before the breath was attenuated", async () => {
    const { session } = await smartCut("undo");
    const before = session.project.timeline.tracks[0]?.clips.length;
    await session.undo();
    expect(session.project.timeline.tracks[0]?.clips.length).toBe(1);
    expect(before).toBeGreaterThan(1);
  }, 90_000);
});

/** Whether ffmpeg is on the path; the real-audio tests are skipped without it. */
function hasFfmpeg(): boolean {
  return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
}
