// Renders image overlays with real FFmpeg. A solid red PNG on a flat grey video can be found by colour, so position,
// size, opacity, timing and animation are measured from pixels.

import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addImageOverlay, imageOverlayFromPreset } from "./image-overlays.js";
import { probe } from "./media.js";
import { exportProject } from "./render.js";
import type { Asset, ImageOverlay, Project } from "./schema.js";
import {
  ff,
  hasFfmpeg,
  makePng,
  makeSpeechVideo,
  makeTempDir,
  pixel,
  redBounds,
  removeTempDir,
  rgbFrameAt,
} from "./test-utils.js";
import { addAsset, appendClip, emptyProject } from "./timeline.js";
import { addZoom, zoomFromStyle } from "./zoom.js";

describe.skipIf(!hasFfmpeg())("image overlay rendering (needs ffmpeg)", () => {
  let dir: string;
  let video: Asset;
  let png: Asset;
  let jpg: Asset;
  let n = 0;

  beforeAll(async () => {
    dir = makeTempDir("dax-img-");
    const v = join(dir, "bg.mp4");
    makeSpeechVideo(v, 5, 0.1); // flat grey picture
    makePng(join(dir, "logo.png"), "red", 200, 100);
    ff(["-f", "lavfi", "-i", "color=c=red:s=200x100", "-frames:v", "1", join(dir, "logo.jpg")]);
    video = await probe(v);
    png = await probe(join(dir, "logo.png"));
    jpg = await probe(join(dir, "logo.jpg"));
  }, 60_000);
  afterAll(() => removeTempDir(dir));

  const base = (): Project =>
    appendClip(
      addAsset(
        addAsset(addAsset(emptyProject("i", { width: 640, height: 360, fps: 30 }), video), png),
        jpg,
      ),
      video.id,
    );

  async function render(p: Project): Promise<string> {
    const out = join(dir, `out-${n++}.mp4`);
    await exportProject(p, out);
    return out;
  }

  const logo = (opts: Partial<ImageOverlay> & { preset?: string } = {}): ImageOverlay => {
    const { preset = "logo-corner", ...rest } = opts;
    return {
      ...imageOverlayFromPreset(preset, { assetId: png.id, start: 1, duration: 2, total: 5 }),
      animation: "none",
      opacity: 1,
      ...rest,
    };
  };

  it("draws a PNG in the corner only while it is on screen, at the right place and size", async () => {
    const out = await render(addImageOverlay(base(), logo({ width: 0.15 })));
    expect(redBounds(rgbFrameAt(out, 0.5))).toBeNull(); // before
    const during = redBounds(rgbFrameAt(out, 2));
    expect(during).not.toBeNull();
    // 15 % of 640 = 96 px wide, 48 px tall, 22 px from the top and right edges.
    expect(Math.abs((during?.right ?? 0) - (640 - 22 - 1))).toBeLessThanOrEqual(2);
    expect(Math.abs((during?.left ?? 0) - (640 - 22 - 96))).toBeLessThanOrEqual(2);
    expect(Math.abs((during?.top ?? 0) - 22)).toBeLessThanOrEqual(2);
    expect(Math.abs((during?.bottom ?? 0) - (22 + 48 - 1))).toBeLessThanOrEqual(2);
    expect(redBounds(rgbFrameAt(out, 3.6))).toBeNull(); // after
  }, 60_000);

  it("keeps the picture's colour and works with JPG as well", async () => {
    let p = addImageOverlay(base(), logo({ position: "center", width: 0.3 }));
    p = addImageOverlay(
      p,
      logo({ id: "jpg", assetId: jpg.id, position: "bottom-left", start: 1.1, width: 0.2 }),
    );
    const out = await render(p);
    const frame = rgbFrameAt(out, 2);
    const [r, g, b] = pixel(frame, 320, 180);
    expect(r).toBeGreaterThan(220);
    expect(g).toBeLessThan(40);
    expect(b).toBeLessThan(40);
    const [jr, jg] = pixel(frame, 60, 300);
    expect(jr).toBeGreaterThan(200);
    expect(jg).toBeLessThan(60);
  }, 60_000);

  it("blends at the requested opacity", async () => {
    const out = await render(addImageOverlay(base(), logo({ position: "center", opacity: 0.5 })));
    const [r, g] = pixel(rgbFrameAt(out, 2), 320, 180);
    // Half red (255, 0) over grey (48): about 151 and 24.
    expect(Math.abs(r - 151)).toBeLessThan(20);
    expect(Math.abs(g - 24)).toBeLessThan(20);
  }, 60_000);

  it("fades in, and pops in from small", async () => {
    const fade = await render(
      addImageOverlay(base(), logo({ position: "center", animation: "fade", duration: 3 })),
    );
    const early = pixel(rgbFrameAt(fade, 1.1), 320, 180)[0];
    const full = pixel(rgbFrameAt(fade, 2), 320, 180)[0];
    expect(early).toBeLessThan(full - 40);

    const pop = await render(
      addImageOverlay(
        base(),
        logo({ position: "center", animation: "pop", width: 0.3, duration: 3 }),
      ),
    );
    const small = redBounds(rgbFrameAt(pop, 1.05));
    const grown = redBounds(rgbFrameAt(pop, 2));
    expect((small?.right ?? 0) - (small?.left ?? 0)).toBeLessThan(
      ((grown?.right ?? 0) - (grown?.left ?? 0)) * 0.85,
    );
    expect(Math.abs((grown?.right ?? 0) - (grown?.left ?? 0) + 1 - 192)).toBeLessThanOrEqual(3);
  }, 90_000);

  it("slides in from the side", async () => {
    const out = await render(
      addImageOverlay(
        base(),
        logo({ position: "center", animation: "slide-left", duration: 3, opacity: 1 }),
      ),
    );
    // At 1.2 s the move is a third done: still translucent and well to the left of its resting place.
    const early = redBounds(rgbFrameAt(out, 1.2), 640, 360, 90);
    const settled = redBounds(rgbFrameAt(out, 2));
    expect(early).not.toBeNull();
    expect(settled).not.toBeNull();
    expect((early?.left ?? 999) + 20).toBeLessThan(settled?.left ?? 0);
  }, 60_000);

  it("does not zoom with the picture", async () => {
    let p = addImageOverlay(base(), logo({ position: "top-right", width: 0.15, duration: 3 }));
    p = addZoom(
      p,
      zoomFromStyle({ id: "z", start: 1.5, duration: 1, scale: 1.5, style: "punch-in" }),
    );
    const out = await render(p);
    const zoomed = redBounds(rgbFrameAt(out, 2));
    const plain = redBounds(rgbFrameAt(out, 1.2));
    expect(zoomed?.left).toBe(plain?.left);
    expect(zoomed?.right).toBe(plain?.right);
  }, 60_000);

  it("the whole-video watermark preset stays for the rest of the video", async () => {
    const o = imageOverlayFromPreset("watermark", { assetId: png.id, start: 0.5, total: 5 });
    expect(o.duration).toBeCloseTo(4.5, 6);
    const out = await render(addImageOverlay(base(), o));
    // Faint (50 %), bottom-right, and still there near the end: the pixel is neither grey (48) nor solid red.
    const [r] = pixel(rgbFrameAt(out, 4.8), 580, 319);
    expect(r).toBeGreaterThan(100);
    expect(r).toBeLessThan(200);
  }, 60_000);
});
