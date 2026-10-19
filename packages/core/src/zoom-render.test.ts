// Renders zooms with real FFmpeg and measures the result from pixels: a white box on a flat background has a known
// size and position, so its edges say exactly how far the picture was zoomed and where it was anchored.

import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { probe } from "./media.js";
import { exportProject } from "./render.js";
import type { Project } from "./schema.js";
import {
  BOX,
  boxEdges,
  grayFrameAt,
  grayFrames,
  hasFfmpeg,
  makeBoxVideo,
  makeTempDir,
  removeTempDir,
} from "./test-utils.js";
import { addAsset, appendClip, emptyProject, splitAt } from "./timeline.js";
import { addZoom, zoomFromStyle, zoomScaleAt } from "./zoom.js";

describe.skipIf(!hasFfmpeg())("zoom rendering (needs ffmpeg)", () => {
  let dir: string;
  let src: string;
  let n = 0;

  beforeAll(() => {
    dir = makeTempDir("dax-zoom-");
    src = join(dir, "box.mp4");
    makeBoxVideo(src, 6);
  }, 30_000);
  afterAll(() => removeTempDir(dir));

  async function baseProject(): Promise<Project> {
    const asset = await probe(src);
    return appendClip(
      addAsset(emptyProject("zoom", { width: 640, height: 360, fps: 30 }), asset),
      asset.id,
    );
  }

  async function render(p: Project): Promise<string> {
    const out = join(dir, `out-${n++}.mp4`);
    await exportProject(p, out);
    return out;
  }

  it("holds a hard punch-in for its range and leaves the rest alone", async () => {
    const z = zoomFromStyle({ id: "z1", start: 2, duration: 1.5, scale: 1.5, style: "punch-in" });
    const out = await render(addZoom(await baseProject(), z));

    const before = boxEdges(grayFrameAt(out, 1.5));
    expect(before.left).toBeCloseTo(BOX.x, -1);
    expect(before.right - before.left + 1).toBeCloseTo(BOX.w, -1);

    // Inside: 1.5x about the centre. The box is 120 px wide and its left edge is 320 - 60.
    for (const t of [2.2, 2.8, 3.3]) {
      const e = boxEdges(grayFrameAt(out, t));
      expect(Math.abs(e.left - 260), `left edge at ${t}s`).toBeLessThanOrEqual(2);
      expect(Math.abs(e.right - e.left + 1 - 120), `width at ${t}s`).toBeLessThanOrEqual(3);
      expect(Math.abs(e.bottom - e.top + 1 - 120), `height at ${t}s`).toBeLessThanOrEqual(3);
    }

    const after = boxEdges(grayFrameAt(out, 4.5));
    expect(after.left).toBeCloseTo(BOX.x, -1);
    expect(after.right - after.left + 1).toBeCloseTo(BOX.w, -1);
  }, 60_000);

  it("keeps the output size, frame count and duration", async () => {
    const z = zoomFromStyle({ id: "z1", start: 1, duration: 2, scale: 1.3, style: "push-in" });
    const out = await render(addZoom(await baseProject(), z));
    const info = await probe(out);
    expect(info.width).toBe(640);
    expect(info.height).toBe(360);
    expect(info.duration).toBeCloseTo(6, 1);
    expect(grayFrames(out, 64, 36)).toHaveLength(180);
  }, 60_000);

  it("pushes in smoothly: the box grows frame by frame, following the zoom curve", async () => {
    const z = zoomFromStyle({
      id: "z1",
      start: 1,
      duration: 3,
      scale: 1.5,
      style: "push-in",
      ease: "ease-in-out",
    });
    const out = await render(addZoom(await baseProject(), z));
    const frames = grayFrames(out, 640, 360, 0, 5);
    const widths = frames.map((f) => {
      const e = boxEdges(f);
      return e.right - e.left + 1;
    });
    // Never shrinks while pushing in (a half-pixel wobble is tolerated; the sizes are whole pixels).
    for (let i = 31; i < 119; i++) {
      expect(widths[i], `frame ${i}`).toBeGreaterThanOrEqual((widths[i - 1] ?? 0) - 1);
    }
    // And it tracks the curve: width = 80 x zoom at that frame's time.
    for (let i = 0; i < frames.length; i += 7) {
      const t = i / 30;
      // Outside [1, 4) the picture is not zoomed at all (the curve's end value only applies inside the range).
      const expected = BOX.w * (t >= 1 && t < 4 ? zoomScaleAt(z, t) : 1);
      expect(Math.abs((widths[i] ?? 0) - expected), `frame ${i}`).toBeLessThanOrEqual(3);
    }
    // Gentle start: in the first quarter second the box has barely grown.
    expect((widths[38] ?? 0) - BOX.w).toBeLessThan(6);
    // It reaches the end scale and then drops back to normal after the range.
    expect(Math.abs((widths[118] ?? 0) - 120)).toBeLessThanOrEqual(3);
    expect(Math.abs((widths[140] ?? 0) - BOX.w)).toBeLessThanOrEqual(2);
  }, 60_000);

  it("keeps the focus point in view: x=0 anchors the left edge, x=1 the right", async () => {
    const mk = (x: number) =>
      zoomFromStyle({ id: "z1", start: 1, duration: 3, scale: 2, style: "punch-in", x, y: 0.5 });
    const left = boxEdges(grayFrameAt(await render(addZoom(await baseProject(), mk(0))), 2));
    // Anchored at the left edge: a point at x=280 lands at 560 and the box is 160 wide.
    expect(Math.abs(left.left - 560)).toBeLessThanOrEqual(3);
    const right = boxEdges(grayFrameAt(await render(addZoom(await baseProject(), mk(1))), 2));
    // Anchored at the right edge: x=280 lands at 560 - 640 = -80 and the box spans -80 to 80.
    expect(right.left).toBe(0);
    expect(Math.abs(right.right - 79)).toBeLessThanOrEqual(3);
  }, 90_000);

  it("zooms across a clip boundary without a glitch", async () => {
    let p = await baseProject();
    p = splitAt(p, 3);
    const z = zoomFromStyle({ id: "z1", start: 2, duration: 2, scale: 1.4, style: "punch-in" });
    const out = await render(addZoom(p, z));
    const widths = grayFrames(out, 640, 360, 2.1, 1.7).map((f) => {
      const e = boxEdges(f);
      return e.right - e.left + 1;
    });
    expect(widths.length).toBeGreaterThan(40);
    for (const w of widths) expect(Math.abs(w - 112)).toBeLessThanOrEqual(3);
  }, 60_000);

  it("renders several zooms in one pass, each in its own range", async () => {
    let p = await baseProject();
    for (const [id, start, scale] of [
      ["a", 0.5, 1.2],
      ["b", 2, 1.4],
      ["c", 4, 1.6],
    ] as const) {
      p = addZoom(p, zoomFromStyle({ id, start, duration: 1, scale, style: "punch-in" }));
    }
    const out = await render(p);
    const width = (t: number) => {
      const e = boxEdges(grayFrameAt(out, t));
      return e.right - e.left + 1;
    };
    expect(Math.abs(width(1) - 96)).toBeLessThanOrEqual(3);
    expect(Math.abs(width(2.5) - 112)).toBeLessThanOrEqual(3);
    expect(Math.abs(width(4.5) - 128)).toBeLessThanOrEqual(3);
    expect(Math.abs(width(1.7) - BOX.w)).toBeLessThanOrEqual(2);
    expect(Math.abs(width(3.5) - BOX.w)).toBeLessThanOrEqual(2);
    expect(Math.abs(width(5.5) - BOX.w)).toBeLessThanOrEqual(2);
  }, 60_000);

  it("clips a zoom that runs past the end of the video", async () => {
    const z = zoomFromStyle({ id: "z1", start: 5, duration: 4, scale: 1.5, style: "punch-in" });
    const out = await render(addZoom(await baseProject(), z));
    expect((await probe(out)).duration).toBeCloseTo(6, 1);
    const e = boxEdges(grayFrameAt(out, 5.7));
    expect(Math.abs(e.right - e.left + 1 - 120)).toBeLessThanOrEqual(3);
  }, 60_000);
});
