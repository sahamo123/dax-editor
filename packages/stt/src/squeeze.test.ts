import { describe, expect, it } from "vitest";
import { isIdentityPlan, mapWordsToOriginal, planSqueeze, squeezedToOriginal } from "./squeeze.js";

describe("planSqueeze", () => {
  it("keeps a file with no quiet stretches whole", () => {
    const p = planSqueeze([], 30);
    expect(isIdentityPlan(p, 30)).toBe(true);
    expect(p.durationSec).toBe(30);
  });

  it("shortens a long silence to padding + gap + padding and lays segments back to back", () => {
    // speech 0-10, silence 10-20, speech 20-30
    const p = planSqueeze([{ start: 10, end: 20 }], 30, { padSec: 0.3, gapSec: 0.5 });
    expect(p.segments).toEqual([
      { origStart: 0, origEnd: 10.3, sqStart: 0 },
      { origStart: 19.7, origEnd: 30, sqStart: 10.8 },
    ]);
    expect(p.durationSec).toBeCloseTo(21.1);
    expect(p.joins).toHaveLength(1);
  });

  it("ignores a quiet stretch too short to be worth a join", () => {
    const p = planSqueeze([{ start: 10, end: 10.7 }], 30);
    expect(isIdentityPlan(p, 30)).toBe(true);
  });

  it("trims leading and trailing quiet down to the padding", () => {
    const p = planSqueeze(
      [
        { start: 0, end: 4 },
        { start: 26, end: 30 },
      ],
      30,
    );
    expect(p.segments).toHaveLength(1);
    expect(p.segments[0]?.origStart).toBeCloseTo(3.7);
    expect(p.segments[0]?.origEnd).toBeCloseTo(26.3);
    expect(p.durationSec).toBeCloseTo(22.6);
  });

  it("never returns an empty plan, even for an all-quiet file", () => {
    const p = planSqueeze([{ start: 0, end: 30 }], 30);
    expect(p.segments.length).toBeGreaterThan(0);
  });
});

describe("squeezedToOriginal", () => {
  const plan = planSqueeze([{ start: 10, end: 20 }], 30, { padSec: 0.3, gapSec: 0.5 });

  it("is the identity before the first join", () => {
    expect(squeezedToOriginal(plan, 5, "start")).toBe(5);
  });

  it("adds the removed silence after the join", () => {
    // squeezed 11.8 is 1.0 s into the second segment, which began at original 19.7
    expect(squeezedToOriginal(plan, 11.8, "start")).toBeCloseTo(20.7);
  });

  it("snaps a time inside the inserted gap forward for starts and back for ends", () => {
    expect(squeezedToOriginal(plan, 10.5, "start")).toBeCloseTo(19.7);
    expect(squeezedToOriginal(plan, 10.5, "end")).toBeCloseTo(10.3);
  });

  it("clamps past the end", () => {
    expect(squeezedToOriginal(plan, 999, "end")).toBeCloseTo(30);
  });
});

describe("mapWordsToOriginal", () => {
  it("maps start and end separately and keeps text and order", () => {
    const plan = planSqueeze([{ start: 10, end: 20 }], 30);
    const out = mapWordsToOriginal(plan, [
      { text: "before", start: 9.5, end: 10 },
      { text: "after", start: 11.0, end: 11.5 },
    ]);
    expect(out[0]).toMatchObject({ text: "before", start: 9.5, end: 10 });
    expect(out[1]?.start).toBeCloseTo(19.9);
    expect(out[1]?.end).toBeCloseTo(20.4);
  });
});
