import { describe, expect, it } from "vitest";
import type { Zoom } from "./schema.js";
import { addAsset, appendClip, deleteRange, emptyProject } from "./timeline.js";
import {
  addZoom,
  removeZoom,
  updateZoom,
  zoomFilters,
  zoomFromStyle,
  zoomScaleAt,
  zoomsOf,
} from "./zoom.js";

const base = appendClip(
  addAsset(emptyProject("t"), {
    id: "a1",
    path: "/x/a.mp4",
    kind: "video",
    duration: 30,
    hasAudio: true,
  }),
  "a1",
);

const hold = (id: string, start: number, duration: number, scale = 1.2): Zoom =>
  zoomFromStyle({ id, start, duration, scale, style: "punch-in" });

describe("zoom edit operations", () => {
  it("adds zooms in time order and never mutates the input", () => {
    const frozen = structuredClone(base);
    const a = addZoom(addZoom(base, hold("z2", 8, 2)), hold("z1", 2, 2));
    expect(base).toEqual(frozen);
    expect(zoomsOf(a).map((z) => z.id)).toEqual(["z1", "z2"]);
  });

  it("rejects overlapping zooms but allows touching ones", () => {
    const a = addZoom(base, hold("z1", 2, 3));
    expect(() => addZoom(a, hold("z2", 4, 2))).toThrow(/overlaps zoom "z1"/);
    expect(zoomsOf(addZoom(a, hold("z2", 5, 2)))).toHaveLength(2);
  });

  it("rejects duplicate ids and out-of-range scales", () => {
    const a = addZoom(base, hold("z1", 2, 3));
    expect(() => addZoom(a, hold("z1", 10, 1))).toThrow(/already exists/);
    expect(() => addZoom(base, { ...hold("zx", 0, 1), toScale: 5 })).toThrow();
    expect(() => addZoom(base, { ...hold("zx", 0, 1), fromScale: 0.8 })).toThrow();
  });

  it("updates only the fields given, and rechecks overlaps", () => {
    const a = addZoom(addZoom(base, hold("z1", 2, 2)), hold("z2", 6, 2));
    const b = updateZoom(a, "z1", { toScale: 1.5, fromScale: 1.5 });
    expect(zoomsOf(b)[0]).toMatchObject({ id: "z1", start: 2, duration: 2, toScale: 1.5 });
    expect(() => updateZoom(a, "z1", { duration: 5 })).toThrow(/overlaps zoom "z2"/);
    expect(() => updateZoom(a, "nope", { duration: 1 })).toThrow(/Unknown zoom/);
  });

  it("removes a zoom and complains about a missing one", () => {
    const a = addZoom(base, hold("z1", 2, 2));
    expect(zoomsOf(removeZoom(a, "z1"))).toHaveLength(0);
    expect(() => removeZoom(a, "zz")).toThrow(/Unknown zoom/);
  });

  it("a push-in starts at 1, a punch-in holds its scale", () => {
    expect(
      zoomFromStyle({ id: "a", start: 0, duration: 2, scale: 1.3, style: "push-in" }),
    ).toMatchObject({
      fromScale: 1,
      toScale: 1.3,
    });
    expect(
      zoomFromStyle({ id: "a", start: 0, duration: 2, scale: 1.3, style: "punch-in" }),
    ).toMatchObject({
      fromScale: 1.3,
      toScale: 1.3,
    });
  });
});

describe("zoom value over time", () => {
  const z = zoomFromStyle({
    id: "z",
    start: 10,
    duration: 4,
    scale: 1.5,
    style: "push-in",
    ease: "linear",
  });

  it("is the start scale before, the end scale after, and interpolates inside", () => {
    expect(zoomScaleAt(z, 0)).toBe(1);
    expect(zoomScaleAt(z, 12)).toBeCloseTo(1.25, 6);
    expect(zoomScaleAt(z, 99)).toBe(1.5);
  });

  it("eases: in starts slow, out starts fast, in-out is symmetric", () => {
    const at = (ease: Zoom["ease"]) => zoomScaleAt({ ...z, ease }, 11); // a quarter of the way
    expect(at("ease-in")).toBeLessThan(at("linear"));
    expect(at("ease-out")).toBeGreaterThan(at("linear"));
    expect(zoomScaleAt({ ...z, ease: "ease-in-out" }, 12)).toBeCloseTo(1.25, 6);
  });
});

describe("zoom and ripple deletes", () => {
  it("moves later zooms earlier, shortens crossing ones and drops the ones inside", () => {
    let p = addZoom(base, hold("early", 1, 1));
    p = addZoom(p, hold("inside", 6, 1));
    p = addZoom(p, hold("cross", 9, 3)); // 9..12
    p = addZoom(p, hold("late", 20, 2));
    const cut = deleteRange(p, 5, 10);
    const byId = Object.fromEntries(zoomsOf(cut).map((z) => [z.id, z]));
    expect(byId.early).toMatchObject({ start: 1, duration: 1 });
    expect(byId.inside).toBeUndefined();
    expect(byId.cross).toMatchObject({ start: 5, duration: 2 });
    expect(byId.late).toMatchObject({ start: 15, duration: 2 });
  });
});

describe("zoom filter graph", () => {
  it("is empty without zooms and for zooms past the end", () => {
    expect(zoomFilters([], "[outv]", "[o]", 640, 360, 10)).toEqual([]);
    expect(zoomFilters([hold("z", 12, 2)], "[outv]", "[o]", 640, 360, 10)).toEqual([]);
  });

  it("splits once, cuts each zoom out, and ends on the requested label", () => {
    const g = zoomFilters([hold("a", 1, 1), hold("b", 3, 1)], "[outv]", "[done]", 640, 360, 10);
    expect(g[0]).toBe("[outv]split=3[zbase][zs0][zs1]");
    expect(g.join(";")).toContain("trim=start=1:end=2");
    expect(g.join(";")).toContain("trim=start=3:end=4");
    expect(g.at(-1)).toMatch(/\[zo0\]\[zc1\]overlay=eof_action=pass\[done\]$/);
  });

  it("clips a zoom that runs past the end of the video", () => {
    const g = zoomFilters([hold("a", 8, 5)], "[outv]", "[done]", 640, 360, 10);
    expect(g.join(";")).toContain("trim=start=8:end=10");
  });

  it("uses constants for a hold and a per-frame expression for a move", () => {
    const held = zoomFilters([hold("a", 1, 1, 1.5)], "[i]", "[o]", 640, 360, 10).join(";");
    expect(held).toContain("scale=w=960:h=540,crop=w=640:h=360:x=160:y=90");
    expect(held).not.toContain("eval=frame");
    const move = zoomFilters(
      [zoomFromStyle({ id: "m", start: 1, duration: 2, scale: 1.5, style: "push-in" })],
      "[i]",
      "[o]",
      640,
      360,
      10,
    ).join(";");
    expect(move).toContain("eval=frame");
    expect(move).toContain("crop=w=640:h=360:x='");
  });

  it("keeps scaled sizes even", () => {
    const g = zoomFilters([hold("a", 0, 1, 1.15)], "[i]", "[o]", 640, 360, 10).join(";");
    const m = /scale=w=(\d+):h=(\d+)/.exec(g);
    expect(Number(m?.[1]) % 2).toBe(0);
    expect(Number(m?.[2]) % 2).toBe(0);
  });
});
