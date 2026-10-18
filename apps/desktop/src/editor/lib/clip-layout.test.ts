import { describe, expect, it } from "vitest";
import { clip, makeProject } from "../test-utils";
import {
  minClipDuration,
  placeClips,
  previewReorder,
  previewTrim,
  reorderedIds,
  repack,
} from "./clip-layout";
import { mainClips } from "./project";

// Three clips of one 10 s asset: c1 = [0,4], c2 = [2,5], c3 = [1,6]  ->  timeline 0..4, 4..7, 7..12.
const laid = () =>
  placeClips(
    mainClips(makeProject([clip("c1", "a", 0, 4), clip("c2", "a", 2, 5), clip("c3", "a", 1, 6)])),
  );

describe("placeClips / repack", () => {
  it("lays clips back to back from zero", () => {
    expect(laid().map((c) => c.start)).toEqual([0, 4, 7]);
  });

  it("repack closes gaps after a length change", () => {
    const l = laid();
    const shorter = l.map((c) => (c.id === "c1" ? { ...c, out: 3 } : c));
    expect(repack(shorter).map((c) => c.start)).toEqual([0, 3, 6]);
  });
});

describe("previewTrim (ripple)", () => {
  const base = { assetDuration: 10, fps: 30 };

  it("extends the end edge and ripples later clips right", () => {
    const r = previewTrim({ ...base, clips: laid(), clipId: "c2", edge: "end", deltaSec: 1.5 });
    expect(r.out).toBeCloseTo(6.5);
    expect(r.clips.map((c) => c.start)).toEqual([0, 4, 8.5]);
    expect(r.unchanged).toBe(false);
  });

  it("shortens from the end edge and ripples later clips left", () => {
    const r = previewTrim({ ...base, clips: laid(), clipId: "c1", edge: "end", deltaSec: -1 });
    expect(r.out).toBeCloseTo(3);
    expect(r.clips.map((c) => c.start)).toEqual([0, 3, 6]);
  });

  it("cannot extend past the end of the source file", () => {
    const r = previewTrim({ ...base, clips: laid(), clipId: "c3", edge: "end", deltaSec: 99 });
    expect(r.out).toBe(10);
  });

  it("cannot shrink below one frame", () => {
    const r = previewTrim({ ...base, clips: laid(), clipId: "c1", edge: "end", deltaSec: -99 });
    expect(r.out - r.in).toBeCloseTo(minClipDuration(30), 6);
    const s = previewTrim({ ...base, clips: laid(), clipId: "c1", edge: "start", deltaSec: 99 });
    expect(s.out - s.in).toBeCloseTo(minClipDuration(30), 6);
  });

  it("trims the start edge: in moves, the clip stays anchored, later clips ripple", () => {
    const r = previewTrim({ ...base, clips: laid(), clipId: "c2", edge: "start", deltaSec: 1 });
    expect(r.in).toBeCloseTo(3);
    expect(r.out).toBe(5);
    expect(r.clips[1]?.start).toBe(4); // anchored
    expect(r.clips[2]?.start).toBe(6); // later clip slid left by 1
  });

  it("cannot trim the start before the beginning of the source", () => {
    const r = previewTrim({ ...base, clips: laid(), clipId: "c2", edge: "start", deltaSec: -99 });
    expect(r.in).toBe(0);
  });

  it("snaps the end edge to a timeline target such as the playhead", () => {
    // c2 ends at 7 on the timeline; dragging +0.96 puts it at 7.96; the playhead at 8 is within 0.1 s.
    const r = previewTrim({
      ...base,
      clips: laid(),
      clipId: "c2",
      edge: "end",
      deltaSec: 0.96,
      targets: [8],
      threshold: 0.1,
    });
    expect(r.snappedTo).toBe(8);
    expect(r.out).toBeCloseTo(6); // timeline 8 = start 4 + (6 - 2)
  });

  it("snaps the start edge to the frame under the playhead and to the source start", () => {
    const toPlayhead = previewTrim({
      ...base,
      clips: laid(),
      clipId: "c2",
      edge: "start",
      deltaSec: 0.95,
      targets: [],
      threshold: 0.1,
      playhead: 5, // 1 s into c2 -> source 3
    });
    expect(toPlayhead.in).toBeCloseTo(3);
    const toZero = previewTrim({
      ...base,
      clips: laid(),
      clipId: "c2",
      edge: "start",
      deltaSec: -1.95,
      targets: [],
      threshold: 0.1,
    });
    expect(toZero.in).toBe(0);
  });

  it("does not snap when the threshold is zero (snapping off)", () => {
    const r = previewTrim({
      ...base,
      clips: laid(),
      clipId: "c2",
      edge: "end",
      deltaSec: 0.96,
      targets: [8],
      threshold: 0,
    });
    expect(r.snappedTo).toBeNull();
    expect(r.out).toBeCloseTo(5.96);
  });

  it("reports an unchanged trim", () => {
    expect(
      previewTrim({ ...base, clips: laid(), clipId: "c1", edge: "end", deltaSec: 0 }).unchanged,
    ).toBe(true);
  });

  it("throws for an unknown clip", () => {
    expect(() =>
      previewTrim({ ...base, clips: laid(), clipId: "nope", edge: "end", deltaSec: 1 }),
    ).toThrow(/nope/);
  });
});

describe("previewReorder", () => {
  it("keeps the order when dragged a little", () => {
    expect(previewReorder(laid(), "c1", 2.5).index).toBe(0);
  });

  it("moves after a neighbour once the dragged centre passes that neighbour's midpoint", () => {
    // c2's midpoint is 5.5; c1's centre dragged to 5.6 goes after c2.
    expect(previewReorder(laid(), "c1", 5.6).index).toBe(1);
    expect(previewReorder(laid(), "c1", 5.4).index).toBe(0);
  });

  it("can move to the very end and the very start", () => {
    expect(previewReorder(laid(), "c1", 99).index).toBe(2);
    expect(previewReorder(laid(), "c3", -5).index).toBe(0);
  });

  it("holds a gap the width of the dragged clip at the drop slot", () => {
    const r = previewReorder(laid(), "c1", 5.6); // -> [c2, c1, c3]
    expect(r.slotStart).toBe(3); // after c2 (3 s)
    expect(r.starts.get("c2")).toBe(0);
    expect(r.starts.get("c3")).toBe(7); // c2 (3) + gap (4)
  });

  it("puts the gap at zero when moving to the front", () => {
    const r = previewReorder(laid(), "c3", 0);
    expect(r.slotStart).toBe(0);
    expect(r.starts.get("c1")).toBe(5);
  });

  it("matches what move_clip does to the order", () => {
    const ids = ["c1", "c2", "c3"];
    expect(reorderedIds(ids, "c1", 1)).toEqual(["c2", "c1", "c3"]);
    expect(reorderedIds(ids, "c3", 0)).toEqual(["c3", "c1", "c2"]);
    expect(reorderedIds(ids, "c2", 99)).toEqual(["c1", "c3", "c2"]);
  });

  it("throws for an unknown clip", () => {
    expect(() => previewReorder(laid(), "nope", 1)).toThrow(/nope/);
  });
});
