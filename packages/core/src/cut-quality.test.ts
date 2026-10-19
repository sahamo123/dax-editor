// Cut quality on synthetic recordings with known truth: music and laughter in pauses, clipped word tails, breaths.
// Unit tests use hand-made loudness frames; the "real audio" tests synthesise sound with FFmpeg (no media is committed).

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCommand } from "./commands.js";
import { type AudioLevels, analyzeAudio, applyCutPlan, estimateFloor, planCuts } from "./cuts.js";
import { probe } from "./media.js";
import { exportProject } from "./render.js";
import type { Word } from "./schema.js";
import { Session } from "./session.js";
import {
  addAsset,
  appendClip,
  emptyProject,
  setAssetTranscript,
  timelineDuration,
} from "./timeline.js";

/** Build words from "text@start-end" pieces. */
const w = (...pieces: string[]): Word[] =>
  pieces.map((p) => {
    const [text = "", range = ""] = p.split("@");
    const [s = "0", e = "0"] = range.split("-");
    return { text, start: Number(s), end: Number(e) };
  });

/** 20 ms loudness frames from [dB, seconds] pieces. */
const frames = (...spec: [number, number][]): AudioLevels => ({
  frameSeconds: 0.02,
  db: spec.flatMap(([db, seconds]) => Array<number>(Math.round(seconds / 0.02)).fill(db)),
});

const ROOM = -60;
const VOICE = -15;

describe("pauses are only cut where the audio is silent (unit)", () => {
  // Two words 0.5-1.5 s and 4.5-5.5 s with a 3 s gap between them.
  const words = w("one@0.5-1.5", "two@4.5-5.5");
  const plan = (levels: AudioLevels | undefined) =>
    planCuts({ assetId: "a", duration: 6, words, ...(levels ? { levels } : {}) });
  // Head and tail silence are covered by their own test; here only the middle gap matters.
  const gapKinds = (levels: AudioLevels | undefined) =>
    plan(levels)
      .decisions.map((d) => d.kind)
      .filter((k) => k !== "head" && k !== "tail");

  it("cuts a silent gap exactly as before", () => {
    const silent = frames([ROOM, 0.5], [VOICE, 1], [ROOM, 3], [VOICE, 1], [ROOM, 0.5]);
    const p = plan(silent);
    expect(gapKinds(silent)).toEqual(["pause"]);
    expect(p.decisions.find((d) => d.kind === "pause")?.status).toBe("approved");
    // Without levels the planner behaves as it always did.
    expect(gapKinds(undefined)).toEqual(["pause"]);
  });

  it("does not cut a gap that holds music, and lists it as a proposal", () => {
    // A -32 dB music bed from 2.0 s to 4.0 s: 28 dB above the room tone.
    const music = frames(
      [ROOM, 0.5],
      [VOICE, 1],
      [ROOM, 0.5],
      [-32, 2],
      [ROOM, 0.5],
      [VOICE, 1],
      [ROOM, 0.5],
    );
    const p = plan(music);
    expect(gapKinds(music)).toEqual(["non_silent_gap"]);
    const d = p.decisions.find((x) => x.kind === "non_silent_gap");
    expect(d?.status).toBe("proposed");
    expect(d?.reason).toMatch(/not silent/);
    expect(p.proposedSeconds).toBeGreaterThan(2);
  });

  it("does not cut a gap that holds laughter-like bursts", () => {
    // Three 0.25 s bursts at -22 dB with 0.1 s dips between them.
    const laugh = frames(
      [ROOM, 0.5],
      [VOICE, 1],
      [ROOM, 1],
      ...[0, 1, 2].flatMap((): [number, number][] => [
        [-22, 0.25],
        [ROOM, 0.1],
      ]),
      [ROOM, 0.95],
      [VOICE, 1],
      [ROOM, 0.5],
    );
    expect(gapKinds(laugh)).toEqual(["non_silent_gap"]);
  });

  it("still cuts a gap with only a click in it", () => {
    const click = frames(
      [ROOM, 0.5],
      [VOICE, 1],
      [ROOM, 1],
      [-20, 0.04],
      [ROOM, 1.96],
      [VOICE, 1],
      [ROOM, 0.5],
    );
    expect(gapKinds(click)).toEqual(["pause"]);
  });

  it("does not cut when the transcript timing is 0.3 s late (a word would be clipped)", () => {
    // The audio has the words at 0.5-1.5 and 4.5-5.5, but the transcript says 0.8-1.8 and 4.8-5.8.
    const audio = frames([ROOM, 0.5], [VOICE, 1], [ROOM, 3], [VOICE, 1], [ROOM, 0.5]);
    const late = planCuts({
      assetId: "a",
      duration: 6.5,
      words: w("one@0.8-1.8", "two@4.8-5.8"),
      levels: audio,
    });
    expect(late.decisions.filter((d) => d.status === "approved" && d.kind === "pause")).toEqual([]);
  });

  it("does not cut head or tail silence that holds music", () => {
    const intro = frames([-30, 2], [ROOM, 0.5], [VOICE, 1], [ROOM, 0.5], [-30, 2]);
    const p = planCuts({ assetId: "a", duration: 6, words: w("hi@2.5-3.5"), levels: intro });
    expect(p.decisions.map((d) => d.kind)).toEqual(["non_silent_gap", "non_silent_gap"]);
    expect(p.approvedSeconds).toBe(0);
  });

  it("ignores a filler word inside the gap it is cutting out", () => {
    // The podcast preset leaves a crowded "um" alone; the pause rule then spans it, and the um is not "sound".
    const crowded = w("so@0.5-1.5", "um@2.4-2.7", "yes@4.5-5.5");
    const levels = frames(
      [ROOM, 0.5],
      [VOICE, 1],
      [ROOM, 0.9],
      [VOICE, 0.3],
      [ROOM, 1.8],
      [VOICE, 1],
      [ROOM, 0.5],
    );
    const p = planCuts({ assetId: "a", duration: 6, words: crowded, levels, preset: "gentle" });
    expect(p.decisions.some((d) => d.kind === "non_silent_gap")).toBe(false);
  });
});

function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** A sound that lasts from `from` to `to` seconds at `db` dBFS. */
interface Sound {
  from: number;
  to: number;
  db: number;
}

/** A synthetic recording: speech-like bursts over room tone, plus optional music and laughter. */
interface Scene {
  duration: number;
  roomDb: number;
  voice: [number, number][];
  music?: Sound[];
  laugh?: Sound[];
}

/** FFmpeg `between()` terms joined with `+`; `0` when empty. */
const sum = (terms: string[]) => (terms.length > 0 ? terms.join("+") : "0");

/**
 * Write `scene` as a .mov with a test picture and lossless audio. Speech is harmonic tones with a slow level wobble,
 * the room is white noise, music is a sustained C-major chord and laughter is white noise pulsed at 4 Hz.
 */
function synthesize(path: string, scene: Scene): void {
  const voice = sum(scene.voice.map(([a, b]) => `between(t,${a},${b})`));
  const tone = `0.16*(sin(2*PI*150*t)+0.5*sin(2*PI*300*t)+0.3*sin(2*PI*450*t))*(0.7+0.3*sin(2*PI*3*t))*(${voice})`;
  const chord = sum(
    (scene.music ?? []).map(
      (m) =>
        `between(t,${m.from},${m.to})*${(10 ** (m.db / 20) / Math.sqrt(1.5)).toFixed(6)}*(sin(2*PI*261.63*t)+sin(2*PI*329.63*t)+sin(2*PI*392*t))`,
    ),
  );
  // White noise has an RMS of amplitude / sqrt(3).
  const laugh = sum(
    (scene.laugh ?? []).map(
      (l) =>
        `between(t,${l.from},${l.to})*${(10 ** (l.db / 20) * Math.sqrt(3)).toFixed(6)}*(0.5+0.5*sin(2*PI*4*t))`,
    ),
  );
  const room = (10 ** (scene.roomDb / 20) * Math.sqrt(3)).toFixed(6);
  const d = scene.duration;
  execFileSync("ffmpeg", [
    ...["-y", "-v", "error", "-f", "lavfi", "-i", `testsrc=d=${d}:s=160x120:r=30`],
    ...["-f", "lavfi", "-i", `aevalsrc='${tone}+${chord}':d=${d}:s=44100`],
    ...["-f", "lavfi", "-i", `anoisesrc=d=${d}:a=${room}:c=white:r=44100:seed=7`],
    ...["-f", "lavfi", "-i", `anoisesrc=d=${d}:a=1:c=white:r=44100:seed=9`],
    ...[
      "-filter_complex",
      `[3:a]volume='${laugh}':eval=frame[l];[1:a][2:a][l]amix=inputs=3:normalize=0:duration=first[a]`,
    ],
    ...["-map", "0:v", "-map", "[a]", "-c:v", "mpeg4", "-c:a", "pcm_s16le", path],
  ]);
}

/** Number of 20 ms frames at or above `thresholdDb`. */
const loud = (l: AudioLevels, thresholdDb: number) => l.db.filter((v) => v >= thresholdDb).length;

describe.skipIf(!hasFfmpeg())("music and laughter in pauses, on real audio (needs ffmpeg)", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "dax-cutq-"));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  /** Voice 0.5-1.5, 3.5-4.5 and 6.5-7.5 s; the gaps are 1.5-3.5 and 4.5-6.5 s. */
  const base: Scene = {
    duration: 8,
    roomDb: ROOM,
    voice: [
      [0.5, 1.5],
      [3.5, 4.5],
      [6.5, 7.5],
    ],
  };
  const words = w("one@0.5-1.5", "two@3.5-4.5", "three@6.5-7.5");

  /** Synthesize, plan with the real loudness frames, apply, render, and measure the output. */
  async function run(name: string, scene: Scene, spoken = words, useLevels = true) {
    const src = join(dir, `${name}.mov`);
    synthesize(src, scene);
    const a = await probe(src);
    const levels = await analyzeAudio(src);
    const plan = planCuts({
      assetId: a.id,
      duration: a.duration,
      words: spoken,
      ...(useLevels ? { levels } : {}),
    });
    const project = setAssetTranscript(
      appendClip(addAsset(emptyProject(name, { width: 160, height: 120, fps: 30 }), a), a.id),
      a.id,
      { words: spoken },
    );
    const cut = applyCutPlan(project, plan);
    const out = join(dir, `${name}-out.mp4`);
    await exportProject(cut, out);
    const after = await analyzeAudio(out);
    const threshold = estimateFloor(levels) + 10;
    return { plan, levels, after, threshold, seconds: timelineDuration(cut) };
  }

  it("keeps a music bed that sits in a pause; without the gate the music is cut", async () => {
    const scene: Scene = { ...base, music: [{ from: 1.5, to: 3.5, db: -32 }] };
    const gated = await run("music-gated", scene);
    const ungated = await run("music-ungated", scene, words, false);
    const before = loud(gated.levels, gated.threshold);
    // All sound that was in the source is still there (a couple of frames of fade ramps are allowed).
    expect(loud(gated.after, gated.threshold)).toBeGreaterThanOrEqual(before - 4);
    // The second gap (silent) was still shortened.
    expect(gated.seconds).toBeLessThan(8 - 1);
    expect(gated.plan.decisions.some((d) => d.kind === "non_silent_gap")).toBe(true);
    // The old behaviour removed most of the 2 s of music.
    expect(loud(ungated.after, ungated.threshold)).toBeLessThan(before - 60);
  }, 90_000);

  it("keeps laughter-like bursts that sit in a pause", async () => {
    const scene: Scene = { ...base, laugh: [{ from: 1.8, to: 3.2, db: -22 }] };
    const gated = await run("laugh-gated", scene);
    const before = loud(gated.levels, gated.threshold);
    expect(loud(gated.after, gated.threshold)).toBeGreaterThanOrEqual(before - 4);
    expect(gated.plan.decisions.some((d) => d.kind === "non_silent_gap")).toBe(true);
  }, 90_000);

  it("still removes both gaps when they are silent (no regression)", async () => {
    const r = await run("silent", base);
    expect(r.plan.decisions.filter((d) => d.kind === "pause")).toHaveLength(2);
    expect(r.seconds).toBeLessThan(8 - 2.5);
  }, 90_000);

  it("removes no speech when the transcript is 0.3 s late", async () => {
    const late = words.map((x) => ({ ...x, start: x.start + 0.3, end: x.end + 0.3 }));
    const gated = await run("late-gated", { ...base, duration: 8.5 }, late);
    const ungated = await run("late-ungated", { ...base, duration: 8.5 }, late, false);
    const before = loud(gated.levels, gated.threshold);
    expect(loud(gated.after, gated.threshold)).toBeGreaterThanOrEqual(before - 4);
    // Without the check the late timing clips words.
    expect(loud(ungated.after, ungated.threshold)).toBeLessThan(before - 10);
  }, 90_000);

  it("smart_cut leaves the music alone and lists the gap for review", async () => {
    const src = join(dir, "music-cmd.mov");
    synthesize(src, { ...base, music: [{ from: 1.5, to: 3.5, db: -32 }] });
    const a = await probe(src);
    const project = setAssetTranscript(
      appendClip(addAsset(emptyProject("cmd", { width: 160, height: 120, fps: 30 }), a), a.id),
      a.id,
      { words },
    );
    const session = new Session(project);
    const r = await runCommand({ session }, "smart_cut", {});
    // The head (0.4 s), the tail (0.4 s) and the silent gap (1.7 s) went: 5.5 s are left. Cutting the music gap too would leave 3.8 s.
    expect(timelineDuration(session.project)).toBeGreaterThan(5);
    expect((r.data as { forReview: number }).forReview).toBe(1);
    expect(r.summary).toMatch(/1 more for review/);
  }, 60_000);
});

describe("plan_cuts when the audio cannot be read", () => {
  it("still plans from the transcript and says the pauses were not checked", async () => {
    const missing = {
      id: "a1",
      path: "/nonexistent/none.mp4",
      kind: "video" as const,
      duration: 6,
      hasAudio: true,
      transcript: { words: w("one@0.5-1.5", "two@4.5-5.5") },
    };
    const session = new Session(appendClip(addAsset(emptyProject("m"), missing), "a1"));
    const r = await runCommand({ session }, "plan_cuts", {});
    const data = r.data as { warnings?: string[]; decisions: { kind: string }[] };
    expect(data.warnings?.[0]).toMatch(/could not be read/);
    expect(data.decisions.some((d) => d.kind === "pause")).toBe(true);
  });
});
