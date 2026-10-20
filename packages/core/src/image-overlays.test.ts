import { describe, expect, it } from "vitest";
import {
  addImageOverlay,
  getImagePreset,
  IMAGE_PRESETS,
  imageInputArgs,
  imageOverlayFilters,
  imageOverlayFromPreset,
  imagesOf,
  removeImageOverlay,
  updateImageOverlay,
} from "./image-overlays.js";
import { IMAGE_ANIMATIONS } from "./schema.js";
import { addAsset, appendClip, deleteRange, emptyProject } from "./timeline.js";

const base = appendClip(
  addAsset(
    addAsset(emptyProject("t"), {
      id: "v",
      path: "/x/a.mp4",
      kind: "video",
      duration: 30,
      hasAudio: true,
    }),
    { id: "logo", path: "/x/logo.png", kind: "image", duration: 0, hasAudio: false },
  ),
  "v",
);

describe("image presets", () => {
  it("have unique ids, valid animations and sensible sizes", () => {
    const ids = IMAGE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of IMAGE_PRESETS) {
      expect(IMAGE_ANIMATIONS).toContain(p.animation);
      expect(p.width).toBeGreaterThan(0.02);
      expect(p.width).toBeLessThanOrEqual(0.5);
      expect(p.description.length).toBeGreaterThan(20);
    }
    expect(getImagePreset("nope")).toBeUndefined();
  });

  it("build validated overlays; whole-video presets last to the end of the video", () => {
    const o = imageOverlayFromPreset("watermark", { assetId: "logo", start: 2, total: 30 });
    expect(o).toMatchObject({
      kind: "image",
      start: 2,
      duration: 28,
      opacity: 0.5,
      animation: "none",
    });
    const s = imageOverlayFromPreset("sticker-pop", { assetId: "logo", start: 2, total: 30 });
    expect(s.duration).toBe(2.5);
    expect(
      imageOverlayFromPreset("watermark", { assetId: "logo", start: 2, duration: 5 }).duration,
    ).toBe(5);
    expect(() => imageOverlayFromPreset("nope", { assetId: "logo", start: 0 })).toThrow(
      /Unknown image preset/,
    );
  });
});

describe("image overlay edit operations", () => {
  const logo = () =>
    imageOverlayFromPreset("logo-corner", { assetId: "logo", start: 1, duration: 4 });

  it("adds, updates and removes, never mutating the input", () => {
    const frozen = structuredClone(base);
    const o = logo();
    const p = addImageOverlay(base, o);
    expect(base).toEqual(frozen);
    const q = updateImageOverlay(p, o.id, { opacity: 0.3, position: "bottom-left" });
    expect(imagesOf(q)[0]).toMatchObject({ opacity: 0.3, position: "bottom-left", duration: 4 });
    expect(imagesOf(removeImageOverlay(q, o.id))).toHaveLength(0);
    expect(() => removeImageOverlay(q, "nope")).toThrow(/Unknown image overlay/);
    expect(() => updateImageOverlay(q, "nope", { opacity: 1 })).toThrow(/Unknown image overlay/);
  });

  it("rejects an asset that is not a picture, an unknown asset, a repeated id and bad values", () => {
    const o = logo();
    expect(() => addImageOverlay(base, { ...o, assetId: "v" })).toThrow(/not a picture/);
    expect(() => addImageOverlay(base, { ...o, assetId: "nope" })).toThrow(/Unknown asset/);
    expect(() => addImageOverlay(addImageOverlay(base, o), o)).toThrow(/already exists/);
    expect(() => addImageOverlay(base, { ...o, opacity: 2 })).toThrow();
    expect(() => addImageOverlay(base, { ...o, width: 0 })).toThrow();
  });

  it("moves with the footage on a ripple delete, like a text overlay", () => {
    let p = addImageOverlay(
      base,
      imageOverlayFromPreset("logo-corner", { assetId: "logo", start: 12, duration: 4 }),
    );
    p = addImageOverlay(
      p,
      imageOverlayFromPreset("sticker-pop", { assetId: "logo", start: 2, duration: 1 }),
    );
    const cut = deleteRange(p, 5, 10);
    expect(imagesOf(cut).map((o) => o.start)).toEqual([2, 7]);
  });
});

describe("image overlay filters", () => {
  const o = (over = {}) => ({
    ...imageOverlayFromPreset("logo-corner", { assetId: "logo", start: 1, duration: 3 }),
    animation: "none" as const,
    ...over,
  });

  it("loops the still for its duration at the project frame rate", () => {
    expect(imageInputArgs(o(), 30)).toEqual(["-loop", "1", "-framerate", "30", "-t", "3"]);
  });

  it("shifts the picture to its start and overlays it with pass-through at the end", () => {
    const f = imageOverlayFilters(o(), "[3:v]", "[base]", "[out]", 1280, 720);
    expect(f[0]).toContain("setpts=PTS-STARTPTS+1/TB");
    expect(f[0]).toContain("scale=w=178:h=-2"); // 14 % of 1280, even
    expect(f[1]).toContain("overlay=x='W-w-45':y='45':eof_action=pass[out]");
  });

  it("adds fades for animated images and a fixed opacity only below 1", () => {
    const plain = imageOverlayFilters(o({ opacity: 1 }), "[3:v]", "[a]", "[b]", 1280, 720)[0];
    expect(plain).not.toContain("colorchannelmixer");
    expect(plain).not.toContain("fade=");
    const faint = imageOverlayFilters(
      o({ opacity: 0.5, animation: "fade" }),
      "[3:v]",
      "[a]",
      "[b]",
      1280,
      720,
    )[0];
    expect(faint).toContain("colorchannelmixer=aa=0.5");
    expect(faint).toContain("fade=t=in:st=1:d=0.4:alpha=1");
    expect(faint).toContain("fade=t=out:st=3.6:d=0.4:alpha=1");
  });

  it("pop scales per frame; slides move the overlay position", () => {
    expect(
      imageOverlayFilters(o({ animation: "pop" }), "[3:v]", "[a]", "[b]", 1280, 720)[0],
    ).toContain("eval=frame");
    expect(
      imageOverlayFilters(o({ animation: "slide-up" }), "[3:v]", "[a]", "[b]", 1280, 720)[1],
    ).toContain("pow(1-");
    expect(
      imageOverlayFilters(o({ animation: "slide-left" }), "[3:v]", "[a]", "[b]", 1280, 720)[1],
    ).toContain("-384");
  });

  it("covers every position", () => {
    for (const position of [
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
      "top",
      "bottom",
      "center",
    ] as const) {
      const f = imageOverlayFilters(o({ position }), "[3:v]", "[a]", "[b]", 1280, 720);
      expect(f[1], position).toMatch(/overlay=x='[^']+':y='[^']+'/);
    }
  });
});
