import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tempDir, writeWav } from "../test-support/helpers.js";
import { computeEnergyEnvelope, findQuietRanges, trimWordsToSpeech } from "./timing.js";
import type { RawWord } from "./whisper-json.js";

let dir: string;
beforeAll(() => {
  dir = tempDir();
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const w = (start: number, end: number): RawWord => ({ text: "x", start, end });

describe("computeEnergyEnvelope", () => {
  it("measures tone as loud and digital silence as quiet, in 10 ms steps", async () => {
    const path = join(dir, "a.wav");
    writeWav(path, [{ sec: 1 }, { sec: 1, amp: 0 }]);
    const env = await computeEnergyEnvelope(path);
    expect(env.frameSec).toBeCloseTo(0.01);
    expect(env.db.length).toBe(200);
    expect(env.db[50]).toBeGreaterThan(60);
    expect(env.db[150]).toBeLessThan(-20);
  });

  it("rejects a file that is not a WAV", async () => {
    const path = join(dir, "bad.wav");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path, Buffer.from("this is not audio at all, just text padding"));
    await expect(computeEnergyEnvelope(path)).rejects.toThrow(/not a WAV/);
  });
});

describe("findQuietRanges", () => {
  it("reports silences of at least 1.2 s and ignores shorter pauses", async () => {
    const path = join(dir, "q.wav");
    // tone 2 s | silence 0.8 s | tone 2 s | silence 2 s | tone 1 s
    writeWav(path, [{ sec: 2 }, { sec: 0.8, amp: 0 }, { sec: 2 }, { sec: 2, amp: 0 }, { sec: 1 }]);
    const q = findQuietRanges(await computeEnergyEnvelope(path));
    expect(q).toHaveLength(1);
    expect(q[0]?.start).toBeCloseTo(4.8, 1);
    expect(q[0]?.end).toBeCloseTo(6.8, 1);
  });

  it("reports shorter quiet stretches at the very start and end", async () => {
    const path = join(dir, "edges.wav");
    writeWav(path, [{ sec: 0.7, amp: 0 }, { sec: 2 }, { sec: 0.7, amp: 0 }]);
    const q = findQuietRanges(await computeEnergyEnvelope(path));
    expect(q).toHaveLength(2);
    expect(q[0]?.start).toBe(0);
    expect(q[1]?.end).toBeCloseTo(3.4, 1);
  });

  it("adapts to a noisy floor: constant low-level noise counts as quiet next to loud speech", async () => {
    const path = join(dir, "noisy.wav");
    writeWav(path, [{ sec: 2 }, { sec: 2, amp: 0.001 }, { sec: 2 }]);
    const q = findQuietRanges(await computeEnergyEnvelope(path));
    expect(q).toHaveLength(1);
  });
});

describe("trimWordsToSpeech", () => {
  // tone 0-1 | silence 1-3 | tone 3-4 | silence 4-4.5 | tone 4.5-5
  let envPath: string;
  beforeAll(() => {
    envPath = join(dir, "trim.wav");
    writeWav(envPath, [
      { sec: 1 },
      { sec: 2, amp: 0 },
      { sec: 1 },
      { sec: 0.5, amp: 0 },
      { sec: 0.5 },
    ]);
  });

  it("pulls the end of a word back from a following silence", async () => {
    const env = await computeEnergyEnvelope(envPath);
    const [t] = trimWordsToSpeech([w(0.2, 2.5)], env);
    expect(t?.start).toBeCloseTo(0.2, 1);
    expect(t?.end).toBeCloseTo(1.0, 1);
  });

  it("pushes the start of a word forward past a preceding silence", async () => {
    const env = await computeEnergyEnvelope(envPath);
    const [t] = trimWordsToSpeech([w(1.5, 3.8)], env);
    expect(t?.start).toBeCloseTo(3.0, 1);
    expect(t?.end).toBeCloseTo(3.8, 1);
  });

  it("stops a word at a pause longer than 0.25 s inside its span", async () => {
    const env = await computeEnergyEnvelope(envPath);
    const [t] = trimWordsToSpeech([w(3.2, 5.0)], env);
    expect(t?.end).toBeCloseTo(4.0, 1);
  });

  it("leaves a word alone when nothing voiced lies inside its span", async () => {
    const env = await computeEnergyEnvelope(envPath);
    expect(trimWordsToSpeech([w(1.5, 2.5)], env)[0]).toEqual(w(1.5, 2.5));
  });

  it("never moves a boundary outside the span the engine gave", async () => {
    const env = await computeEnergyEnvelope(envPath);
    for (const [a, b] of [
      [0.5, 0.9],
      [3.1, 3.9],
      [4.6, 4.9],
    ] as const) {
      const [t] = trimWordsToSpeech([w(a, b)], env);
      expect(t?.start).toBeGreaterThanOrEqual(a - 1e-9);
      expect(t?.end).toBeLessThanOrEqual(b + 1e-9);
    }
  });

  it("returns the words unchanged for an empty envelope", () => {
    const words = [w(0, 1)];
    expect(trimWordsToSpeech(words, { frameSec: 0.01, db: new Float32Array(0) })).toBe(words);
  });
});
