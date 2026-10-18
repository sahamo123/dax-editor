import { describe, expect, it } from "vitest";
import {
  addOverlay,
  moveOverlay,
  removeOverlay,
  shiftOverlaysForDelete,
  updateOverlay,
} from "./overlays.js";
import { getPreset, OVERLAY_PRESETS, overlayFromPreset } from "./presets.js";
import { type Asset, type Overlay, ProjectSchema } from "./schema.js";
import {
  addAsset,
  appendClip,
  deleteRange,
  emptyProject,
  mainClips,
  removeClip,
  setClipFades,
  splitAt,
} from "./timeline.js";

const asset: Asset = { id: "a1", path: "/x/a.mp4", kind: "video", duration: 10, hasAudio: true };
const base = () => appendClip(addAsset(emptyProject("t"), asset), "a1");

function ovl(start: number, duration: number): Overlay {
  return overlayFromPreset("title-fade", { start, duration, text: "Hi" });
}

describe("presets", () => {
  it("has unique ids and every preset builds a valid overlay", () => {
    const ids = OVERLAY_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of OVERLAY_PRESETS) {
      const o = overlayFromPreset(p.id, { start: 1 });
      expect(o.animation).toBe(p.animation);
      expect(o.duration).toBe(p.defaultDuration);
      expect(o.style.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("looks presets up and rejects unknown ones", () => {
    expect(getPreset("title-pop")?.animation).toBe("pop");
    expect(getPreset("nope")).toBeUndefined();
    expect(() => overlayFromPreset("nope", { start: 0 })).toThrow(/Unknown overlay preset/);
  });

  it("lets the caller override text, duration and style", () => {
    const o = overlayFromPreset("lower-third-slide", {
      start: 2,
      text: "Ada Lovelace",
      subtitle: "Mathematician",
      duration: 5,
      style: { fontSize: 40 },
    });
    expect(o).toMatchObject({ text: "Ada Lovelace", subtitle: "Mathematician", duration: 5 });
    expect(o.style.fontSize).toBe(40);
    expect(o.style.position).toBe("lower-third");
  });
});

describe("overlay operations", () => {
  it("adds, updates, moves and removes without mutating the input", () => {
    const p0 = base();
    const o = ovl(1, 3);
    const p1 = addOverlay(p0, o);
    expect(p0.timeline.overlays).toHaveLength(0);
    expect(p1.timeline.overlays).toHaveLength(1);

    const p2 = updateOverlay(p1, o.id, { text: "New", style: { color: "#ff0000" } });
    expect(p2.timeline.overlays[0]?.text).toBe("New");
    expect(p2.timeline.overlays[0]?.style.color).toBe("#ff0000");
    expect(p2.timeline.overlays[0]?.style.bold).toBe(true); // untouched style fields survive
    expect(p1.timeline.overlays[0]?.text).toBe("Hi");

    const p3 = moveOverlay(p2, o.id, { start: 4, lane: 1 });
    expect(p3.timeline.overlays[0]).toMatchObject({ start: 4, lane: 1 });

    expect(removeOverlay(p3, o.id).timeline.overlays).toHaveLength(0);
  });

  it("rejects bad input", () => {
    const p = addOverlay(base(), ovl(0, 2));
    expect(() => updateOverlay(p, "missing", { text: "x" })).toThrow(/Unknown overlay/);
    const id = p.timeline.overlays[0]?.id ?? "";
    expect(() => updateOverlay(p, id, { style: { color: "red" } })).toThrow();
    expect(() => updateOverlay(p, id, { duration: -1 })).toThrow();
    expect(() => addOverlay(p, p.timeline.overlays[0] as Overlay)).toThrow(/already exists/);
  });

  it("removes the subtitle with null", () => {
    const o = overlayFromPreset("lower-third-slide", { start: 0 });
    const p = addOverlay(base(), o);
    expect(p.timeline.overlays[0]?.subtitle).toBeDefined();
    expect(
      updateOverlay(p, o.id, { subtitle: null }).timeline.overlays[0]?.subtitle,
    ).toBeUndefined();
  });
});

describe("overlays follow ripple deletes", () => {
  const at = (overlays: Overlay[]) => overlays.map((o) => [o.start, o.duration]);

  it("slides later overlays left and leaves earlier ones alone", () => {
    const out = shiftOverlaysForDelete([ovl(0, 1), ovl(6, 2)], 2, 4);
    expect(at(out)).toEqual([
      [0, 1],
      [4, 2],
    ]);
  });

  it("trims overlays that cross the deleted range and drops those inside it", () => {
    const out = shiftOverlaysForDelete([ovl(1, 3), ovl(3, 3), ovl(2.5, 1), ovl(0, 9)], 2, 4);
    expect(at(out)).toEqual([
      [1, 1], // 1-4 loses 2-4
      [2, 2], // 3-6 loses 3-4 and slides to start at 2
      [0, 7], // 0-9 spans the cut: 9 - 2
    ]);
  });

  it("is applied by deleteRange and removeClip", () => {
    const p = addOverlay(splitAt(base(), 5), ovl(7, 2));
    expect(deleteRange(p, 0, 2).timeline.overlays[0]?.start).toBe(5);
    const second = mainClips(p)[1];
    const after = removeClip(p, second?.id ?? "");
    expect(after.timeline.overlays).toHaveLength(0);
  });
});

describe("clip fades", () => {
  it("sets fades and rejects ones longer than the clip", () => {
    const p = base();
    const id = mainClips(p)[0]?.id ?? "";
    const q = setClipFades(p, id, { fadeIn: 1, fadeOut: 2 });
    expect(mainClips(q)[0]).toMatchObject({ fadeIn: 1, fadeOut: 2 });
    expect(() => setClipFades(p, id, { fadeIn: 6, fadeOut: 6 })).toThrow(/longer than the clip/);
  });

  it("keeps fades only on the outer edges when splitting or cutting", () => {
    let p = base();
    const id = mainClips(p)[0]?.id ?? "";
    p = setClipFades(p, id, { fadeIn: 1, fadeOut: 1 });
    const split = mainClips(splitAt(p, 5));
    expect(split[0]).toMatchObject({ fadeIn: 1, fadeOut: 0 });
    expect(split[1]).toMatchObject({ fadeIn: 0, fadeOut: 1 });
    const cut = mainClips(deleteRange(p, 4, 6));
    expect(cut[0]).toMatchObject({ fadeIn: 1, fadeOut: 0 });
    expect(cut[1]).toMatchObject({ fadeIn: 0, fadeOut: 1 });
  });
});

describe("project files", () => {
  it("loads a project saved before overlays and fades existed", () => {
    const old = {
      version: 1,
      name: "old",
      assets: { a1: asset },
      timeline: {
        width: 1280,
        height: 720,
        fps: 30,
        tracks: [
          {
            id: "v1",
            kind: "video",
            clips: [{ id: "c1", assetId: "a1", start: 0, in: 0, out: 5, volume: 1 }],
          },
        ],
      },
    };
    const parsed = ProjectSchema.parse(old);
    expect(parsed.timeline.overlays).toEqual([]);
    expect(parsed.timeline.tracks[0]?.clips[0]).toMatchObject({ fadeIn: 0, fadeOut: 0 });
  });
});
