// Cut quality on synthetic recordings with known truth: music and laughter in pauses, clipped word tails, breaths.
// Unit tests use hand-made loudness frames; the "real audio" tests synthesise sound with FFmpeg (no media is committed).

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCommand } from "./commands.js";
import {
  type AudioLevels,
  analyzeAudio,
  applyCutPlan,
  clippedTailRatio,
  detectSpeechSpans,
  estimateFloor,
  planCuts,
  planRanges,
} from "./cuts.js";
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
  /** Constant white-noise bursts, such as a word-final "s" or "sh" (no pulsing). */
  fricative?: Sound[];
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
  const laugh = sum([
    ...(scene.laugh ?? []).map(
      (l) =>
        `between(t,${l.from},${l.to})*${(10 ** (l.db / 20) * Math.sqrt(3)).toFixed(6)}*(0.5+0.5*sin(2*PI*4*t))`,
    ),
    ...(scene.fricative ?? []).map(
      (l) => `between(t,${l.from},${l.to})*${(10 ** (l.db / 20) * Math.sqrt(3)).toFixed(6)}`,
    ),
  ]);
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

describe("word tails are kept (unit)", () => {
  // Word "one" ends at 0.5 s. Its final "s" is a 0.2 s noise tail at floor+4 dB (-56 dB against a -60 dB room),
  // too quiet to count as sound for the energy gate, so only the padding can protect it. Next word at 2.5 s.
  const words = w("one@0.2-0.5", "two@2.5-2.8");
  const levels = frames(
    [ROOM, 0.2],
    [VOICE, 0.3],
    [-56, 0.2],
    [ROOM, 1.8],
    [VOICE, 0.3],
    [ROOM, 0.5],
  );
  const pause = (duration = 3.3) =>
    planCuts({ assetId: "a", duration, words, levels }).decisions.find((d) => d.kind === "pause");

  it("measures the share of word-tail energy that a cut removes", () => {
    // Nothing removed: nothing clipped.
    expect(clippedTailRatio(levels, words, [])).toBe(0);
    // The whole tail window removed: everything clipped.
    expect(clippedTailRatio(levels, words, [{ start: 0.5, end: 0.7 }])).toBeCloseTo(1, 5);
    // Only the last 100 ms of a 200 ms tail removed: half.
    expect(clippedTailRatio(levels, words, [{ start: 0.6, end: 0.7 }])).toBeCloseTo(0.5, 2);
  });

  it("does not cut into a word-final tail", () => {
    const p = pause();
    expect(p).toBeDefined();
    expect(p?.status).toBe("approved");
    // The tail ends at 0.7 s; the pause must start no earlier than that.
    expect(p?.range.start).toBeGreaterThanOrEqual(0.7 - 0.01);
  });

  it("grows the cut past a decaying word tail that is still audible", () => {
    // The tail falls from -20 dB to -50 dB over 0.3 s after the word, then room tone. The fixed 0.2 s pad would
    // leave the last 0.1 s of it to be cut, so the cut must start where the tail has gone quiet (0.8 s).
    const decay: [number, number][] = Array.from({ length: 15 }, (_, i) => [
      -20 - (30 * i) / 14,
      0.02,
    ]);
    const lv = frames([ROOM, 0.2], [VOICE, 0.3], ...decay, [ROOM, 1.5], [VOICE, 0.3], [ROOM, 0.5]);
    const p = planCuts({
      assetId: "a",
      duration: 3.1,
      words: w("one@0.2-0.5", "two@2.3-2.6"),
      levels: lv,
    });
    const pause = p.decisions.find((d) => d.kind === "pause");
    expect(pause?.status).toBe("approved");
    expect(pause?.range.start).toBeGreaterThanOrEqual(0.8 - 0.001);
    // The growth is bounded: the pause still starts within 0.3 s of the word end.
    expect(pause?.range.start).toBeLessThanOrEqual(0.5 + 0.3 + 0.001);
  });

  it("grows the cut back over a soft onset before the next word", () => {
    // Before "two" (2.3 s) the sound rises from -50 dB at 2.1 s to -20 dB: a soft "s" or "f" that the pad would clip.
    const rise: [number, number][] = Array.from({ length: 10 }, (_, i) => [
      -50 + (30 * i) / 9,
      0.02,
    ]);
    const lv = frames([ROOM, 0.2], [VOICE, 0.3], [ROOM, 1.6], ...rise, [VOICE, 0.3], [ROOM, 0.5]);
    const p = planCuts({
      assetId: "a",
      duration: 3.1,
      words: w("one@0.2-0.5", "two@2.3-2.6"),
      levels: lv,
    });
    const pause = p.decisions.find((d) => d.kind === "pause");
    expect(pause?.status).toBe("approved");
    // The cut now ends where the rise starts (2.1 s), not at the 2.2 s pad.
    expect(pause?.range.end).toBeLessThanOrEqual(2.1 + 0.001);
  });

  it("keeps more silence after a word than before the next one (2:1)", () => {
    const p = planCuts({ assetId: "a", duration: 6, words: w("a@0-0.5", "b@3-3.3") });
    const pause = p.decisions.find((d) => d.kind === "pause");
    // standard: 0.3 s of silence is kept, 2/3 after the word and 1/3 before the next.
    expect((pause?.range.start ?? 0) - 0.5).toBeCloseTo(0.2, 2);
    expect(3 - (pause?.range.end ?? 0)).toBeCloseTo(0.1, 2);
  });

  it("removes the same total silence as before (keep length unchanged)", () => {
    const p = planCuts({ assetId: "a", duration: 6, words: w("a@0-0.5", "b@3-3.3") });
    const pause = p.decisions.find((d) => d.kind === "pause");
    expect((pause?.range.end ?? 0) - (pause?.range.start ?? 0)).toBeCloseTo(2.5 - 0.3, 2);
  });
});

describe.skipIf(!hasFfmpeg())("word tails on real audio (needs ffmpeg)", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "dax-tails-"));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("a word-final fricative survives the cut, and the clipped-tail share is near zero", async () => {
    // Three words, each a 0.5 s voiced sound followed by a 0.2 s "s" at floor+4 dB; 1 s of room tone between words.
    const starts = [0.5, 2.2, 3.9];
    const scene: Scene = {
      duration: 6,
      roomDb: ROOM,
      voice: starts.map((s) => [s, s + 0.5] as [number, number]),
      // floor+4 dB: quiet enough that the energy gate treats the gap as silent, so only the padding protects it.
      fricative: starts.map((s) => ({ from: s + 0.5, to: s + 0.7, db: -56 })),
    };
    const src = join(dir, "tails.mov");
    synthesize(src, scene);
    const a = await probe(src);
    const levels = await analyzeAudio(src);
    // The transcript times the word by its vowel, so the "s" is the 0.2 s tail after the word end.
    const spoken = starts.map((s, i) => ({ text: `w${i}`, start: s, end: s + 0.5 }));
    const plan = planCuts({ assetId: a.id, duration: a.duration, words: spoken, levels });
    const removed = planRanges(plan);
    expect(clippedTailRatio(levels, spoken, removed)).toBeLessThan(0.05);
    // And the cut still removes the silence it should (the two 1.2 s gaps are shortened).
    expect(plan.approvedSeconds).toBeGreaterThan(1.5);
  }, 60_000);
});

describe("speech spans keep word tails and soft onsets (unit)", () => {
  const frames = (...spec: [number, number][]): AudioLevels => ({
    frameSeconds: 0.02,
    db: spec.flatMap(([db, seconds]) => Array<number>(Math.round(seconds / 0.02)).fill(db)),
  });

  it("extends a span past a dip that is still audible (hangover)", () => {
    // Speech ends at 1.5 s, dips under the off threshold for 60 ms, then the tail is still audible for 100 ms.
    const lv = frames([-60, 0.5], [-20, 1], [-56, 0.06], [-50, 0.1], [-60, 0.5]);
    const plain = detectSpeechSpans(lv);
    expect(plain[0]?.end).toBeCloseTo(1.5, 2);
    const held = detectSpeechSpans(lv, { hangover: 0.12 });
    expect(held[0]?.end).toBeGreaterThanOrEqual(1.5 + 0.12 - 0.001);
  });

  it("does not extend a span whose following 120 ms are silent", () => {
    const lv = frames([-60, 0.5], [-20, 1], [-60, 0.5]);
    expect(detectSpeechSpans(lv, { hangover: 0.12 })[0]?.end).toBeCloseTo(1.5, 2);
  });

  it("starts a span before a soft onset that is already above the room tone (lookback)", () => {
    // A soft consonant at -52 dB (above floor+6) for 60 ms before the loud vowel that starts at 0.56 s.
    const lv = frames([-60, 0.5], [-52, 0.06], [-20, 1]);
    expect(detectSpeechSpans(lv)[0]?.start).toBeCloseTo(0.56, 2);
    expect(detectSpeechSpans(lv, { lookback: 0.06 })[0]?.start).toBeLessThanOrEqual(0.5 + 0.001);
  });
});
