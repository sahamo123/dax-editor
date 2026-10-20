import { describe, expect, it } from "vitest";
import { assignRows, previewOverlayMove, previewOverlayResize } from "./overlay-layout";
import { MIN_OVERLAY_DURATION } from "./project";

const span = (id: string, start: number, duration: number, lane = 0) => ({
  id,
  start,
  duration,
  lane,
});

describe("assignRows", () => {
  it("keeps non-overlapping overlays on their lane", () => {
    const { rows, rowCount } = assignRows([span("a", 0, 2), span("b", 3, 2)]);
    expect(rows.get("a")).toBe(0);
    expect(rows.get("b")).toBe(0);
    expect(rowCount).toBe(1);
  });

  it("lets overlays that merely touch share a row", () => {
    const { rows } = assignRows([span("a", 0, 2), span("b", 2, 2)]);
    expect(rows.get("b")).toBe(0);
  });

  it("bumps an overlapping overlay to the next free row", () => {
    const { rows, rowCount } = assignRows([span("a", 0, 4), span("b", 1, 4), span("c", 2, 1)]);
    expect(rows.get("a")).toBe(0);
    expect(rows.get("b")).toBe(1);
    expect(rows.get("c")).toBe(2);
    expect(rowCount).toBe(3);
  });

  it("honours the stored lane as the preferred row", () => {
    const { rows, rowCount } = assignRows([span("a", 0, 1, 2)]);
    expect(rows.get("a")).toBe(2);
    expect(rowCount).toBe(3);
  });

  it("is deterministic regardless of input order and has at least one row", () => {
    const a = assignRows([span("x", 0, 3), span("y", 1, 3)]);
    const b = assignRows([span("y", 1, 3), span("x", 0, 3)]);
    expect([...a.rows]).toEqual([...b.rows]);
    expect(assignRows([]).rowCount).toBe(1);
  });
});

describe("previewOverlayMove", () => {
  it("moves by the pointer delta", () => {
    expect(
      previewOverlayMove({ start: 2, duration: 3, deltaSec: 1.5, targets: [], threshold: 0 }),
    ).toEqual({
      start: 3.5,
      duration: 3,
      snappedTo: null,
    });
  });

  it("never goes before zero", () => {
    expect(
      previewOverlayMove({ start: 1, duration: 3, deltaSec: -5, targets: [], threshold: 0 }).start,
    ).toBe(0);
  });

  it("snaps its start edge or its end edge to a target", () => {
    const start = previewOverlayMove({
      start: 2,
      duration: 3,
      deltaSec: 1.95,
      targets: [4],
      threshold: 0.1,
    });
    expect(start).toMatchObject({ start: 4, snappedTo: 4 });
    const end = previewOverlayMove({
      start: 2,
      duration: 3,
      deltaSec: 0.97,
      targets: [6],
      threshold: 0.1,
    });
    expect(end.snappedTo).toBe(6);
    expect(end.start).toBeCloseTo(3);
  });

  it("keeps the duration when snapping", () => {
    expect(
      previewOverlayMove({ start: 2, duration: 3, deltaSec: 1.95, targets: [4], threshold: 0.1 })
        .duration,
    ).toBe(3);
  });
});

describe("previewOverlayResize", () => {
  const base = { start: 2, duration: 3, targets: [] as number[], threshold: 0 };

  it("changes only the duration from the right edge", () => {
    expect(previewOverlayResize({ ...base, edge: "end", deltaSec: 1 })).toEqual({
      start: 2,
      duration: 4,
      snappedTo: null,
    });
  });

  it("changes start and duration from the left edge, keeping the end fixed", () => {
    const r = previewOverlayResize({ ...base, edge: "start", deltaSec: 0.5 });
    expect(r.start).toBe(2.5);
    expect(r.start + r.duration).toBe(5);
  });

  it("never shrinks below the minimum duration from either edge", () => {
    expect(previewOverlayResize({ ...base, edge: "end", deltaSec: -99 }).duration).toBe(
      MIN_OVERLAY_DURATION,
    );
    const left = previewOverlayResize({ ...base, edge: "start", deltaSec: 99 });
    expect(left.duration).toBeCloseTo(MIN_OVERLAY_DURATION, 9);
    expect(left.start + left.duration).toBeCloseTo(5, 9);
  });

  it("never moves the start below zero", () => {
    const r = previewOverlayResize({ ...base, edge: "start", deltaSec: -99 });
    expect(r.start).toBe(0);
    expect(r.duration).toBe(5);
  });

  it("snaps the dragged edge", () => {
    const r = previewOverlayResize({
      ...base,
      edge: "end",
      deltaSec: 1.97,
      targets: [7],
      threshold: 0.1,
    });
    expect(r).toMatchObject({ snappedTo: 7, duration: 5 });
  });
});
