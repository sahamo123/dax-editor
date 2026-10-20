import { describe, expect, it } from "vitest";
import { defaultProject, overlay } from "../test-utils";
import { SNAP_PX, snapSpan, snapTargets, snapValue } from "./snap";

describe("snapValue", () => {
  it("snaps to the nearest target inside the threshold", () => {
    expect(snapValue(4.05, [0, 4, 8], 0.1)).toEqual({ time: 4, target: 4 });
    expect(snapValue(3.97, [3.9, 4], 0.1)).toEqual({ time: 4, target: 4 });
  });

  it("leaves the value alone outside the threshold", () => {
    expect(snapValue(5, [0, 4], 0.1)).toEqual({ time: 5, target: null });
    expect(snapValue(5, [], 0.1)).toEqual({ time: 5, target: null });
  });

  it("includes targets exactly at the threshold distance", () => {
    expect(snapValue(4.1, [4], 0.1).target).toBe(4);
  });
});

describe("snapSpan", () => {
  it("snaps the start edge when it is the closer one", () => {
    const r = snapSpan(2.04, 3, [2], 0.1);
    expect(r).toEqual({ time: 2, target: 2 });
  });

  it("snaps the end edge and moves the start with it", () => {
    const r = snapSpan(1.97, 3, [5], 0.1); // end at 4.97 -> 5
    expect(r.target).toBe(5);
    expect(r.time).toBeCloseTo(2, 9);
  });

  it("prefers whichever edge is nearer", () => {
    const r = snapSpan(2.08, 2, [2, 4.01], 0.1); // start off by .08, end off by .07
    expect(r.target).toBe(4.01);
  });

  it("returns the input when nothing is close", () => {
    expect(snapSpan(1, 1, [10], 0.1)).toEqual({ time: 1, target: null });
  });
});

describe("snapTargets", () => {
  it("collects zero, playhead, clip edges and overlay edges without duplicates", () => {
    const p = defaultProject([overlay("o1", 1, 2)]);
    const t = snapTargets(p, 2.5);
    expect(new Set(t).size).toBe(t.length);
    for (const x of [0, 2.5, 4, 7, 12, 1, 3]) expect(t).toContain(x);
  });

  it("leaves out the dragged clip and overlay", () => {
    const p = defaultProject([overlay("o1", 1.5, 2)]);
    const t = snapTargets(p, 0, { clipId: "c3", overlayId: "o1" });
    expect(t).not.toContain(1.5);
    expect(t).not.toContain(3.5);
    // c3 spans 7..12: its end (12) is gone, but its start (7) is also c2's end, so it stays.
    expect(t).not.toContain(12);
    expect(t).toContain(7);
    expect(t).toContain(4);
  });

  it("uses a modest pixel threshold", () => {
    expect(SNAP_PX).toBeGreaterThanOrEqual(4);
    expect(SNAP_PX).toBeLessThanOrEqual(16);
  });
});
