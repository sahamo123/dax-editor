// Cut points sit on the project's frame grid: every edit that cuts the main track puts its edges between whole frames.

import { describe, expect, it } from "vitest";
import type { Asset } from "./schema.js";
import {
  addAsset,
  appendClip,
  assetRangesToTimeline,
  deleteRange,
  emptyProject,
  frameRate,
  mainClips,
  snapToFrame,
  splitAt,
  timelineDuration,
  trimClip,
} from "./timeline.js";

/** True if `t` is a whole number of frames at `fps`, to well within a microsecond. */
function onGrid(t: number, fps: number): boolean {
  const frames = t * fps;
  return Math.abs(frames - Math.round(frames)) < 1e-6;
}

/** A 30 fps project with one clip covering the whole source (`duration` seconds). */
function base(duration = 10) {
  const asset: Asset = { id: "a1", path: "/x/a.mp4", kind: "video", duration, hasAudio: true };
  return appendClip(
    addAsset(emptyProject("grid", { width: 320, height: 180, fps: 30 }), asset),
    "a1",
  );
}

describe("frame grid", () => {
  it("maps NTSC rates to their exact fractions and leaves other rates alone", () => {
    expect(frameRate(29.97)).toEqual({ filter: "30000/1001", value: 30000 / 1001 });
    expect(frameRate(59.94).filter).toBe("60000/1001");
    expect(frameRate(30)).toEqual({ filter: "30", value: 30 });
    expect(frameRate(25).filter).toBe("25");
    expect(() => frameRate(0)).toThrow(/positive/);
    expect(() => frameRate(Number.NaN)).toThrow(/positive/);
  });

  it("rounds to the nearest frame, or floors to the last frame at or before a time", () => {
    expect(snapToFrame(1.02, 30)).toBeCloseTo(31 / 30, 12);
    expect(snapToFrame(1.0, 30)).toBe(1);
    // A time a rounding error below a frame boundary still counts as that boundary when flooring.
    expect(snapToFrame(10 - 1e-9, 30, "floor")).toBe(10);
    expect(snapToFrame(10.02, 30, "floor")).toBe(10);
  });

  it("puts a removed range's edges on frame boundaries", () => {
    const p = deleteRange(base(), 1.02, 2.01);
    const [first, second] = mainClips(p);
    expect(first && onGrid(first.out, 30)).toBe(true);
    expect(second && onGrid(second.in, 30)).toBe(true);
    // 1.02 s rounds up to frame 31 and 2.01 s rounds down to frame 60.
    expect(timelineDuration(p)).toBeCloseTo(10 - (2 - 31 / 30), 9);
  });

  it("ignores a removed range shorter than a frame", () => {
    const before = base();
    const after = deleteRange(before, 1.0, 1.01);
    expect(timelineDuration(after)).toBe(timelineDuration(before));
    expect(mainClips(after)).toHaveLength(1);
  });

  it("splits on the nearest frame and refuses a split that rounds onto an edge", () => {
    const p = splitAt(base(), 1.02);
    const [left] = mainClips(p);
    expect(left && onGrid(left.out, 30)).toBe(true);
    expect(mainClips(p)).toHaveLength(2);
    expect(() => splitAt(base(), 0.01)).toThrow(/No clip can be split/);
  });

  it("trims both ends onto frame boundaries", () => {
    const p = base();
    const id = mainClips(p)[0]?.id ?? "";
    const trimmed = trimClip(p, id, { in: 0.51, out: 3.02 });
    const [clip] = mainClips(trimmed);
    expect(clip && onGrid(clip.in, 30)).toBe(true);
    expect(clip && onGrid(clip.out, 30)).toBe(true);
    expect(clip?.in).toBeCloseTo(15 / 30, 12);
    expect(clip?.out).toBeCloseTo(91 / 30, 12);
  });

  it("never lets a clip run past the source's last whole frame", () => {
    // 10.02 s of source holds 300 whole frames at 30 fps, so the clip ends at 10 s.
    const p = base(10.02);
    expect(timelineDuration(p)).toBeCloseTo(10, 9);
  });

  it("drops source ranges that round to nothing, and snaps the rest", () => {
    const p = base();
    expect(assetRangesToTimeline(p, "a1", [{ start: 1.0, end: 1.01 }])).toEqual([]);
    const cut = assetRangesToTimeline(p, "a1", [{ start: 1.0, end: 1.1 }]);
    expect(cut).toHaveLength(1);
    expect(cut[0] && onGrid(cut[0].start, 30) && onGrid(cut[0].end, 30)).toBe(true);
  });
});
