import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tempDir, writeWav } from "../test-support/helpers.js";
import { computeEnergyEnvelope, trimWordsToSpeech } from "./timing.js";
import type { RawWord } from "./whisper-json.js";

// tone 0-1 | quiet 1-1.5 | tone 1.5-2 (the "um") | quiet 2-2.5 | tone 2.5-3.5
let dir: string;
let envPath: string;
beforeAll(() => {
  dir = tempDir();
  envPath = join(dir, "collapsed.wav");
  writeWav(envPath, [
    { sec: 1 },
    { sec: 0.5, amp: 0 },
    { sec: 0.5 },
    { sec: 0.5, amp: 0 },
    { sec: 1 },
  ]);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const word = (t: string, start: number, end: number): RawWord => ({ text: t, start, end });

describe("words the engine collapsed to zero length", () => {
  it("puts a zero-length interjection on the speech between its neighbours", async () => {
    const env = await computeEnergyEnvelope(envPath);
    const out = trimWordsToSpeech(
      [word("one", 0, 1), word("um,", 2.0, 2.0), word("two", 2.5, 3.5)],
      env,
    );
    expect(out[1]?.start).toBeCloseTo(1.5, 1);
    expect(out[1]?.end).toBeCloseTo(2.0, 1);
  });

  it("spreads several words stamped at one instant over the run in proportion to length", async () => {
    const env = await computeEnergyEnvelope(envPath);
    const out = trimWordsToSpeech(
      [word("one", 0, 1), word("so", 1.9, 1.9), word("um", 1.9, 1.9), word("two", 2.5, 3.5)],
      env,
    );
    expect(out[1]?.start).toBeCloseTo(1.5, 1);
    expect(out[1]?.end).toBeCloseTo(out[2]?.start ?? 0, 5);
    expect(out[2]?.end).toBeCloseTo(2.0, 1);
  });

  it("leaves a collapsed word alone when there is no speech between its neighbours", async () => {
    const env = await computeEnergyEnvelope(envPath);
    const hmm = word("hmm", 1.2, 1.2);
    const out = trimWordsToSpeech([word("one", 0, 1), hmm, word("two", 1.4, 1.45)], env);
    expect(out[1]).toEqual(hmm);
  });
});
