// The outcome checks for music, word tails, drift and retakes, each tried on a good edit (must pass) and a bad one (must
// fail). A check that passes both would prove nothing, so every check has a bad edit that it must catch.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  analyzeAudio,
  applyCutPlan,
  deleteRange,
  detectSilence,
  mainClips,
  type Project,
  padSilences,
  planCuts,
  removeAssetRanges,
  timelineDuration,
} from "@dax/core";
import { afterAll, describe, expect, it } from "vitest";
import { fixtureTranscript } from "./fixtures.js";
import { fixtureProject } from "./runner.js";
import { runChecks, streamEnds } from "./score.js";
import { type Check, CheckSchema } from "./task.js";

const fixtureDir = mkdtempSync(join(tmpdir(), "dax-checks-"));
afterAll(() => rmSync(fixtureDir, { recursive: true, force: true }));

/** Run one check on a project and return whether it passed. */
async function passes(project: Project, check: Check): Promise<boolean> {
  return (await runChecks(project, [check])).pass;
}

describe.skipIf(!hasFfmpeg())("music bed: toneSeconds (needs ffmpeg)", () => {
  // The music bed plays for the whole 8 s file; the gap from 2.0 to 3.5 s holds only the bed.
  // Parsed, so the schema's default for `minDb` is filled in as it would be for a real task.
  const check = CheckSchema.parse({ type: "toneSeconds", hz: 220, min: 7.8 });

  it("passes when the music bed is left whole", async () => {
    const { project } = await fixtureProject("music-bed", fixtureDir, "bed");
    expect(await passes(project, check)).toBe(true);
  }, 60_000);

  it("fails when the music-only gap is cut out with the speech pause", async () => {
    const { project } = await fixtureProject("music-bed", fixtureDir, "bed");
    const cut = deleteRange(project, 2.0, 3.5);
    expect(await passes(cut, check)).toBe(false);
  }, 60_000);
});

describe.skipIf(!hasFfmpeg())("word tails: clippedTail (needs ffmpeg)", () => {
  const check: Check = { type: "clippedTail", max: 0.1 };

  it("passes when the pauses are cut with the planner, which keeps each word's tail", async () => {
    const { project, assetId } = await fixtureProject("word-tails", fixtureDir, "tails");
    const asset = project.assets[assetId];
    if (!asset?.transcript) throw new Error("fixture has no transcript");
    const plan = planCuts({
      assetId,
      duration: asset.duration,
      words: asset.transcript.words,
      levels: await analyzeAudio(asset.path),
      preset: "standard",
    });
    expect(await passes(applyCutPlan(project, plan), check)).toBe(true);
  }, 60_000);

  it("fails when each pause is cut right at the word end, which removes every tail", async () => {
    const { project, assetId } = await fixtureProject("word-tails", fixtureDir, "tails");
    const words = project.assets[assetId]?.transcript?.words ?? [];
    // Cut from the end of each word to the start of the next, last gap first so earlier times stay valid.
    let cut = project;
    for (let i = words.length - 2; i >= 0; i--) {
      const a = words[i];
      const b = words[i + 1];
      if (a && b) cut = deleteRange(cut, a.end, b.start);
    }
    expect(await passes(cut, check)).toBe(false);
  }, 60_000);
});

describe.skipIf(!hasFfmpeg())("drift after 60 joins: avSync (needs ffmpeg)", () => {
  it("removes every pause from 61 words (60 joins) and ends the picture and sound within a frame", async () => {
    const { project, fixturePath, assetId } = await fixtureProject(
      "sixty-joins",
      fixtureDir,
      "drift",
    );
    const duration = project.assets[assetId]?.duration ?? 0;
    const silences = padSilences(await detectSilence(fixturePath, duration), 0.1);
    const cut = removeAssetRanges(project, assetId, silences);
    expect(mainClips(cut).length).toBeGreaterThanOrEqual(61);
    const result = await runChecks(cut, [
      { type: "clipCount", min: 61 },
      { type: "avSync", maxFrames: 1 },
    ]);
    expect(result.failures).toEqual([]);
    expect(result.pass).toBe(true);
    expect(timelineDuration(cut)).toBeLessThan(duration);
  }, 180_000);
});

describe.skipIf(!hasFfmpeg())("avSync measures the gap between the streams (needs ffmpeg)", () => {
  // A render cannot be made to drift through the project model, so the measurement itself is tested on a file that
  // does: 2 s of picture with 2.5 s of sound.
  it("reports half a second of audio past the picture, and none when both end together", async () => {
    const tail = join(fixtureDir, "audio-tail.mp4");
    const even = join(fixtureDir, "even.mp4");
    const make = (out: string, audioSeconds: number) =>
      spawnSync(
        "ffmpeg",
        [
          "-y",
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          "testsrc=d=2:s=160x120:r=30",
          "-f",
          "lavfi",
          "-i",
          `sine=f=440:d=${audioSeconds}`,
          "-c:v",
          "mpeg4",
          "-c:a",
          "aac",
          out,
        ],
        { stdio: "ignore" },
      );
    make(tail, 2.5);
    make(even, 2);
    const off = await streamEnds(tail);
    expect(off.audio - off.video).toBeCloseTo(0.5, 1);
    const matched = await streamEnds(even);
    expect(Math.abs(matched.audio - matched.video)).toBeLessThan(1 / 30);
  }, 60_000);
});

describe.skipIf(!hasFfmpeg())("retakes: sourceKept (needs ffmpeg)", () => {
  // Every word of the two takes of "so the plan is simple" must stay. The first ten words of the transcript are those.
  const takeWords = fixtureTranscript("retake-takes")?.words.slice(0, 10) ?? [];
  const check: Check = {
    type: "sourceKept",
    ranges: takeWords.map((w) => ({ start: w.start, end: w.end })),
  };

  it("passes when the planner applies only its approved cuts", async () => {
    const { project, assetId } = await fixtureProject("retake-takes", fixtureDir, "retake");
    const asset = project.assets[assetId];
    if (!asset?.transcript) throw new Error("fixture has no transcript");
    const plan = planCuts({
      assetId,
      duration: asset.duration,
      words: asset.transcript.words,
      levels: await analyzeAudio(asset.path),
    });
    expect(plan.decisions.some((d) => d.kind === "retake" && d.status === "proposed")).toBe(true);
    expect(await passes(applyCutPlan(project, plan), check)).toBe(true);
  }, 60_000);

  it("fails when the proposed retake is applied as well", async () => {
    const { project, assetId } = await fixtureProject("retake-takes", fixtureDir, "retake");
    const asset = project.assets[assetId];
    if (!asset?.transcript) throw new Error("fixture has no transcript");
    const plan = planCuts({
      assetId,
      duration: asset.duration,
      words: asset.transcript.words,
      levels: await analyzeAudio(asset.path),
    });
    expect(await passes(applyCutPlan(project, plan, { includeProposed: true }), check)).toBe(false);
  }, 60_000);
});

/** Whether ffmpeg is on the path; these checks render or decode real media, so they are skipped without it. */
function hasFfmpeg(): boolean {
  return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
}
