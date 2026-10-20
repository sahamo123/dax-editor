import { describe, expect, it } from "vitest";
import type { Asset } from "./schema.js";
import {
  addAsset,
  appendClip,
  assetRangesToTimeline,
  deleteRange,
  emptyProject,
  keepRanges,
  mainClips,
  mergeRanges,
  moveClip,
  removeAssetRanges,
  splitAt,
  timelineDuration,
  trimClip,
} from "./timeline.js";

const asset: Asset = { id: "a1", path: "/x/a.mp4", kind: "video", duration: 10, hasAudio: true };

function base() {
  return appendClip(addAsset(emptyProject("t"), asset), "a1");
}

describe("timeline", () => {
  it("appends a full-length clip", () => {
    const p = base();
    expect(mainClips(p)).toHaveLength(1);
    expect(timelineDuration(p)).toBe(10);
  });

  it("does not mutate its input", () => {
    const p = base();
    const before = JSON.stringify(p);
    splitAt(p, 4);
    deleteRange(p, 2, 3);
    expect(JSON.stringify(p)).toBe(before);
  });

  it("splits a clip and keeps total duration", () => {
    const p = splitAt(base(), 4);
    const [a, b] = mainClips(p);
    expect(a).toMatchObject({ start: 0, in: 0, out: 4 });
    expect(b).toMatchObject({ start: 4, in: 4, out: 10 });
    expect(timelineDuration(p)).toBe(10);
  });

  it("refuses to split outside a clip", () => {
    expect(() => splitAt(base(), 10)).toThrow();
    expect(() => splitAt(base(), 0)).toThrow();
  });

  it("deletes a range and ripples later content left", () => {
    const p = deleteRange(base(), 2, 5);
    expect(timelineDuration(p)).toBeCloseTo(7);
    const [a, b] = mainClips(p);
    expect(a).toMatchObject({ start: 0, in: 0, out: 2 });
    expect(b).toMatchObject({ start: 2, in: 5, out: 10 });
  });

  it("deletes a range spanning a clip boundary", () => {
    const p = deleteRange(splitAt(base(), 5), 3, 7);
    expect(timelineDuration(p)).toBeCloseTo(6);
    const clips = mainClips(p);
    expect(clips.map((c) => [c.in, c.out])).toEqual([
      [0, 3],
      [7, 10],
    ]);
  });

  it("keepRanges keeps only the given ranges", () => {
    const p = keepRanges(base(), [
      { start: 1, end: 2 },
      { start: 6, end: 8 },
    ]);
    expect(timelineDuration(p)).toBeCloseTo(3);
    expect(mainClips(p).map((c) => [c.in, c.out])).toEqual([
      [1, 2],
      [6, 8],
    ]);
  });

  it("trims a clip and re-lays out following clips", () => {
    let p = splitAt(base(), 5);
    const first = mainClips(p)[0]!;
    p = trimClip(p, first.id, { out: 3 });
    expect(mainClips(p)[1]!.start).toBe(3);
    expect(timelineDuration(p)).toBe(8);
  });

  it("moves a clip", () => {
    let p = splitAt(base(), 5);
    const [a] = mainClips(p);
    p = moveClip(p, a!.id, 1);
    expect(mainClips(p).map((c) => c.in)).toEqual([5, 0]);
  });
});

describe("asset ranges", () => {
  it("mergeRanges merges overlaps", () => {
    expect(
      mergeRanges([
        { start: 5, end: 6 },
        { start: 1, end: 3 },
        { start: 2, end: 4 },
      ]),
    ).toEqual([
      { start: 1, end: 4 },
      { start: 5, end: 6 },
    ]);
  });

  it("maps source ranges onto the timeline after earlier edits", () => {
    // Remove source 0-2, so source time 5 now sits at timeline time 3.
    const p = deleteRange(base(), 0, 2);
    expect(assetRangesToTimeline(p, "a1", [{ start: 5, end: 6 }])).toEqual([{ start: 3, end: 4 }]);
  });

  it("ignores source ranges that were already cut out", () => {
    const p = deleteRange(base(), 0, 2);
    expect(assetRangesToTimeline(p, "a1", [{ start: 0, end: 1 }])).toEqual([]);
  });

  it("removes several source ranges in one go", () => {
    const p = removeAssetRanges(base(), "a1", [
      { start: 1, end: 2 },
      { start: 4, end: 6 },
    ]);
    expect(timelineDuration(p)).toBeCloseTo(7);
  });
});
