import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCommand } from "./commands.js";
import {
  analyzeAudio,
  applyCutPlan,
  CUT_PRESETS,
  detectSpeechSpans,
  estimateFloor,
  planCuts,
  planRanges,
} from "./cuts.js";
import { detectSilence, probe } from "./media.js";
import { exportProject } from "./render.js";
import type { Asset, Word } from "./schema.js";
import { Session } from "./session.js";
import { addAsset, appendClip, deleteRange, emptyProject, timelineDuration } from "./timeline.js";

const asset: Asset = { id: "a1", path: "/x/a.mp4", kind: "video", duration: 20, hasAudio: true };

/** Build words from "text@start-end" pieces, e.g. w("hello@0-0.4", "world@1.9-2.3"). */
const w = (...pieces: string[]): Word[] =>
  pieces.map((p) => {
    const [text = "", range = ""] = p.split("@");
    const [s = "0", e = "0"] = range.split("-");
    return { text, start: Number(s), end: Number(e) };
  });

const plan = (
  words: Word[],
  extra: Parameters<typeof planCuts>[0] extends infer T ? Partial<T> : never = {},
) => planCuts({ assetId: "a1", duration: 20, words, ...extra });

describe("speech detection", () => {
  const frames = (spec: [number, number][]) => ({
    frameSeconds: 0.02,
    db: spec.flatMap(([db, seconds]) => Array<number>(Math.round(seconds / 0.02)).fill(db)),
  });

  it("estimates the room-tone floor from the quiet frames", () => {
    expect(
      estimateFloor(
        frames([
          [-50, 8],
          [-20, 2],
        ]),
      ),
    ).toBeCloseTo(-50, 0);
    expect(estimateFloor({ frameSeconds: 0.02, db: [] })).toBe(-100);
  });

  it("finds speech relative to the floor, in quiet and noisy rooms alike", () => {
    for (const floor of [-60, -45, -35]) {
      const spans = detectSpeechSpans(
        frames([
          [floor, 2],
          [floor + 25, 1],
          [floor, 3],
          [floor + 25, 1],
          [floor, 2],
        ]),
      );
      expect(spans).toHaveLength(2);
      expect(spans[0]?.start).toBeCloseTo(2, 1);
      expect(spans[0]?.end).toBeCloseTo(3, 1);
    }
  });

  it("ignores clicks shorter than the minimum and uses hysteresis for dips", () => {
    expect(
      detectSpeechSpans(
        frames([
          [-50, 2],
          [-20, 0.06],
          [-50, 2],
        ]),
      ),
    ).toHaveLength(0);
    // A dip to +8 dB above the floor (between the on and off thresholds) does not split speech.
    const spans = detectSpeechSpans(
      frames([
        [-50, 2],
        [-30, 0.5],
        [-42, 0.1],
        [-30, 0.5],
        [-50, 2],
      ]),
    );
    expect(spans).toHaveLength(1);
  });
});

describe("planCuts from words", () => {
  const talk = w("So@0-0.3", "this@0.4-0.7", "is@0.8-1", "it@3-3.3", "done@3.4-3.8");

  it("shortens a long pause and keeps a natural gap on each side", () => {
    const p = plan(talk, { duration: 3.8 });
    const pause = p.decisions.find((d) => d.kind === "pause");
    // standard: keepPause 0.3 -> 0.2 kept after the last word and 0.1 before the next
    // Two thirds of the kept silence goes after the word (its tail decays), one third before the next word.
    expect(pause?.range.start).toBeCloseTo(1.2, 2);
    expect(pause?.range.end).toBeCloseTo(2.9, 2);
    expect(pause?.status).toBe("approved");
    expect(pause?.reason).toMatch(/2\.0s pause/);
  });

  it("leaves short pauses alone", () => {
    const p = plan(w("a@0-0.3", "b@0.8-1.1", "c@1.6-1.9"), { duration: 1.9 });
    expect(p.decisions).toEqual([]);
  });

  it("cuts silence at the head and tail but keeps a little padding", () => {
    const p = plan(w("hi@2-2.3", "there@2.4-2.8"), { duration: 6 });
    const head = p.decisions.find((d) => d.kind === "head");
    const tail = p.decisions.find((d) => d.kind === "tail");
    expect(head?.range.end).toBeCloseTo(2 - CUT_PRESETS.standard.padPre, 2);
    // The tail keeps the after-word share of the pause (0.2 s), since word endings are the ones that get clipped.
    expect(tail?.range.start).toBeCloseTo(2.8 + CUT_PRESETS.standard.keepPause * (2 / 3), 2);
    expect(tail?.range.end).toBe(6);
  });

  it("the tight preset removes more than gentle", () => {
    const words = w("a@0-0.3", "b@1.1-1.4", "c@2.5-2.8");
    const gentle = plan(words, { duration: 2.8, preset: "gentle" });
    const tight = plan(words, { duration: 2.8, preset: "tight" });
    expect(tight.approvedSeconds).toBeGreaterThan(gentle.approvedSeconds);
  });

  it("allows overriding a preset value", () => {
    const words = w("a@0-0.3", "b@1.1-1.4");
    expect(plan(words, { duration: 1.4 }).decisions).toHaveLength(1);
    expect(plan(words, { duration: 1.4, overrides: { pauseMin: 5 } }).decisions).toHaveLength(0);
  });

  it("removes a filler word even inside a short gap", () => {
    const p = plan(w("so@0-0.3", "um@0.5-0.8", "yes@1-1.3"), { duration: 1.3 });
    const filler = p.decisions.find((d) => d.kind === "filler");
    expect(filler).toBeDefined();
    expect(filler?.reason).toMatch(/um/);
    const project = appendClip(addAsset(emptyProject("t"), { ...asset, duration: 1.3 }), "a1");
    const after = applyCutPlan(project, p);
    expect(timelineDuration(after)).toBeLessThan(1.3 - 0.25);
  });

  it("does not touch words that were never fillers, and leaves fillers when the preset is gentle", () => {
    const words = w("so@0-0.3", "um@0.5-0.8", "yes@1-1.3");
    expect(plan(words, { duration: 1.3, preset: "gentle" }).decisions).toEqual([]);
  });

  it("the podcast preset only removes isolated fillers", () => {
    const crowded = plan(w("so@0-0.3", "um@0.35-0.6", "yes@0.65-1"), {
      duration: 1,
      preset: "podcast",
    });
    expect(crowded.decisions.filter((d) => d.kind === "filler")).toHaveLength(0);
    const isolated = plan(w("so@0-0.3", "um@1-1.3", "yes@2-2.3"), {
      duration: 2.3,
      preset: "podcast",
    });
    expect(isolated.decisions.filter((d) => d.kind === "filler").length).toBeGreaterThan(0);
  });
});

describe("false starts and repeated takes", () => {
  const stutter = w(
    "so@0-0.2",
    "the@0.25-0.4",
    "so@1.2-1.4",
    "the@1.45-1.6",
    "main@1.65-1.9",
    "point@1.95-2.3",
  );

  it("proposes (never auto-applies) a restated opening", () => {
    const p = plan(stutter, { duration: 2.3 });
    const fs = p.decisions.find((d) => d.kind === "false_start");
    expect(fs?.status).toBe("proposed");
    expect(fs?.range.end).toBeLessThanOrEqual(1.2);
    const project = appendClip(addAsset(emptyProject("t"), { ...asset, duration: 2.3 }), "a1");
    const kept = applyCutPlan(project, p);
    expect(applyCutPlan(project, p, { includeProposed: true })).not.toEqual(kept);
    expect(timelineDuration(applyCutPlan(project, p, { includeProposed: true }))).toBeLessThan(
      timelineDuration(kept),
    );
  });

  it("proposes the earlier of two near-identical sentences", () => {
    const sentence = ["the", "quick", "brown", "fox", "jumps", "over", "the", "lazy", "dog"];
    const take = (from: number) =>
      sentence.map(
        (t, i) => `${t}@${(from + i * 0.3).toFixed(2)}-${(from + i * 0.3 + 0.25).toFixed(2)}`,
      );
    const words = w(...take(0), ...take(6));
    const p = plan(words, { duration: 9 });
    expect(p.decisions.find((d) => d.kind === "retake")?.status).toBe("proposed");
  });

  it("is off for presets that do not look for them", () => {
    expect(
      plan(stutter, { duration: 2.3, preset: "gentle" }).decisions.some(
        (d) => d.kind === "false_start",
      ),
    ).toBe(false);
  });
});

describe("applying a plan", () => {
  const base = () => appendClip(addAsset(emptyProject("t"), asset), "a1");
  const p = plan(w("a@0-0.3", "b@3-3.3", "c@6-6.3"), { duration: 20 });

  it("removes only approved decisions by default and honours only/exclude", () => {
    const ids = p.decisions.map((d) => d.id);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    const all = applyCutPlan(base(), p);
    const without = applyCutPlan(base(), p, { exclude: [ids[0] as string] });
    const justOne = applyCutPlan(base(), p, { only: [ids[0] as string] });
    expect(timelineDuration(without)).toBeGreaterThan(timelineDuration(all));
    expect(timelineDuration(justOne)).toBeGreaterThan(timelineDuration(all));
  });

  it("does not change the input and skips ranges that are already gone", () => {
    const original = base();
    const snapshot = JSON.stringify(original);
    const once = applyCutPlan(original, p);
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(applyCutPlan(once, p)).toBe(once); // nothing left to cut: same object
  });

  it("works after other edits moved things around", () => {
    const edited = deleteRange(base(), 0, 1);
    const after = applyCutPlan(edited, p);
    expect(timelineDuration(after)).toBeLessThan(timelineDuration(edited));
  });

  it("planRanges merges overlapping decisions", () => {
    const merged = planRanges(p);
    for (let i = 1; i < merged.length; i++) {
      expect((merged[i] as { start: number }).start).toBeGreaterThan(
        (merged[i - 1] as { end: number }).end,
      );
    }
  });
});

describe("smart_cut command", () => {
  it("plans and applies in one undoable step, listing what needs review", async () => {
    const words = w(
      "so@0-0.2",
      "the@0.25-0.4",
      "so@1.2-1.4",
      "the@1.45-1.6",
      "main@1.65-1.9",
      "point@5-5.4",
    );
    const project = appendClip(
      addAsset(emptyProject("t"), { ...asset, duration: 8, transcript: { words } }),
      "a1",
    );
    const session = new Session(project);
    const r = await runCommand({ session }, "smart_cut", { preset: "standard" });
    expect(r.summary).toMatch(/Removed .* more for review/);
    expect(session.history().at(-1)).toMatchObject({ label: "Smart cut (standard)" });
    const planId = (r.data as { planId: string }).planId;
    const before = timelineDuration(session.project);
    await runCommand({ session }, "apply_cut_plan", { planId, includeProposed: true });
    expect(timelineDuration(session.project)).toBeLessThan(before);
    await runCommand({ session }, "undo", {});
    expect(timelineDuration(session.project)).toBe(before);
    await expect(runCommand({ session }, "apply_cut_plan", { planId: "nope" })).rejects.toThrow(
      /Unknown plan/,
    );
  });

  it("says so when there is nothing to cut", async () => {
    const words = w("a@0-0.3", "b@0.5-0.8");
    const project = appendClip(
      addAsset(emptyProject("t"), { ...asset, duration: 0.8, transcript: { words } }),
      "a1",
    );
    const r = await runCommand({ session: new Session(project) }, "smart_cut", {});
    expect(r.summary).toMatch(/No cuts needed/);
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

describe.skipIf(!hasFfmpeg())("cuts on real audio (needs ffmpeg)", () => {
  let dir: string;
  let noisy: string;
  let tone: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "dax-cuts-"));
    noisy = join(dir, "noisy.mp4");
    tone = join(dir, "tone.mp4");
    // 10 s: a 1 s tone burst every 2.5 s ("speech") over white noise at about -35 dBFS (a noisy room).
    execFileSync("ffmpeg", [
      ...["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=d=10:s=160x120:r=30"],
      ...[
        "-f",
        "lavfi",
        "-i",
        "aevalsrc='if(lt(mod(t,2.5),1),0.3*sin(2*PI*220*t),0)':d=10:s=44100",
      ],
      ...["-f", "lavfi", "-i", "anoisesrc=d=10:a=0.04:c=white:r=44100"],
      ...["-filter_complex", "[1:a][2:a]amix=inputs=2:duration=first:normalize=0[a]"],
      ...["-map", "0:v", "-map", "[a]", "-c:v", "mpeg4", "-c:a", "aac", noisy],
    ]);
    execFileSync("ffmpeg", [
      ...["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=d=6:s=160x120:r=30"],
      ...[
        "-f",
        "lavfi",
        "-i",
        "sine=f=220:d=6:r=44100",
        "-c:v",
        "mpeg4",
        "-c:a",
        "pcm_s16le",
        tone.replace(".mp4", ".mov"),
      ],
    ]);
  }, 60_000);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("finds the pauses in a noisy room where a fixed -30 dB threshold misses most of them", async () => {
    const a = await probe(noisy);
    // A fixed threshold finds at most one of the four pauses here; the floor-relative detector finds all.
    const fixed = await detectSilence(noisy, a.duration, { noiseDb: -30, minDuration: 0.5 });
    expect(fixed.length).toBeLessThanOrEqual(1);
    const levels = await analyzeAudio(noisy);
    expect(estimateFloor(levels)).toBeGreaterThan(-38);
    const spans = detectSpeechSpans(levels);
    expect(spans).toHaveLength(4);
    expect(spans[1]?.start).toBeCloseTo(2.5, 0);
  }, 60_000);

  it("tightens the noisy clip without cutting any speech", async () => {
    const a = await probe(noisy);
    const project = appendClip(
      addAsset(emptyProject("e2e", { width: 160, height: 120, fps: 30 }), a),
      a.id,
    );
    const session = new Session(project);
    const r = await runCommand({ session }, "smart_cut", {});
    expect(r.summary).toMatch(/Removed/);
    const duration = timelineDuration(session.project);
    expect(duration).toBeLessThan(6.5);
    expect(duration).toBeGreaterThan(4.5);

    const out = join(dir, "tight.mp4");
    await exportProject(session.project, out);
    const spans = detectSpeechSpans(await analyzeAudio(out));
    expect(spans).toHaveLength(4); // every burst survived
    for (const s of spans) expect(s.end - s.start).toBeGreaterThan(0.9); // none were clipped
  }, 90_000);

  it("a cut inside a sustained tone does not click", async () => {
    const mov = tone.replace(".mp4", ".mov");
    const a = await probe(mov);
    let project = appendClip(
      addAsset(emptyProject("click", { width: 160, height: 120, fps: 30 }), a),
      a.id,
    );
    project = deleteRange(project, 2, 3.37); // join in the middle of a sine, at an arbitrary phase
    const out = join(dir, "click.mp4");
    await exportProject(project, out);
    const pcm = execFileSync(
      "ffmpeg",
      ["-v", "error", "-i", out, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
      { maxBuffer: 20_000_000 },
    );
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
    const jumps: number[] = [];
    for (let i = 1; i < samples.length; i++)
      jumps.push(Math.abs((samples[i] ?? 0) - (samples[i - 1] ?? 0)));
    const median = [...jumps].sort((x, y) => x - y)[Math.floor(jumps.length / 2)] ?? 1;
    const join0 = 2 * 16000;
    const window = jumps.slice(join0 - 200, join0 + 200);
    expect(Math.max(...window) / median).toBeLessThan(4);
  }, 60_000);
});
