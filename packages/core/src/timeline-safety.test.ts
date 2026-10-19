// Timeline edits that must not lose or misplace material: out-of-range keeps, overlapping deletes, and overlays
// following trimmed or moved clips.

import { describe, expect, it } from "vitest";
import { overlayFromPreset } from "./presets.js";
import type { Asset, Project } from "./schema.js";
import {
  addAsset,
  appendClip,
  deleteRanges,
  emptyProject,
  keepRanges,
  mainClips,
  moveClip,
  timelineDuration,
  trimClip,
} from "./timeline.js";

const asset: Asset = { id: "a1", path: "/x/a.mp4", kind: "video", duration: 10, hasAudio: true };

/** One 10-second clip from a 10-second asset. */
const oneClip = (): Project => appendClip(addAsset(emptyProject("t"), asset), "a1");

/** Put a text overlay at `start` (timeline seconds) on `p`. */
function withOverlay(p: Project, id: string, start: number, duration: number): Project {
  const next = structuredClone(p);
  next.timeline.overlays = [
    { ...overlayFromPreset("title-fade", { start, duration, text: id }), id },
  ];
  return next;
}

describe("keepRanges", () => {
  it("refuses to remove the whole timeline when no kept range is inside it", () => {
    // Before the fix a range past the end removed everything and left an empty timeline.
    expect(() => keepRanges(oneClip(), [{ start: 50, end: 60 }])).toThrow(/inside the timeline/);
  });

  it("clamps a kept range that runs past the end", () => {
    const p = keepRanges(oneClip(), [{ start: 2, end: 100 }]);
    expect(timelineDuration(p)).toBeCloseTo(8, 6);
  });
});

describe("deleteRanges", () => {
  it("removes overlapping ranges once, as their union", () => {
    // [1,4] and [3,6] together cover [1,6]: five seconds must remain. Cutting them one after another on a
    // shrinking timeline removed four seconds of the wrong footage.
    const p = deleteRanges(oneClip(), [
      { start: 1, end: 4 },
      { start: 3, end: 6 },
    ]);
    expect(timelineDuration(p)).toBeCloseTo(5, 6);
  });
});

describe("overlays follow the footage they sit on", () => {
  it("moves an overlay left when the clip before it is trimmed", () => {
    const base = withOverlay(oneClip(), "title", 5, 1);
    const clipId = mainClips(base)[0]?.id ?? "";
    // Trim 2 seconds off the start: everything after the cut moves 2 seconds earlier.
    const p = trimClip(base, clipId, { in: 2 });
    expect(timelineDuration(p)).toBeCloseTo(8, 6);
    // Before the fix the overlay stayed at 5 s, two seconds too late.
    expect(p.timeline.overlays[0]?.start).toBeCloseTo(3, 6);
    expect(p.timeline.overlays[0]?.duration).toBeCloseTo(1, 6);
  });

  it("moves an overlay with its clip when clips are reordered", () => {
    let p = appendClip(oneClip(), "a1"); // second clip starts at 10 s
    const second = mainClips(p)[1];
    if (!second) throw new Error("expected two clips");
    p = withOverlay(p, "callout", 12, 1);
    p = moveClip(p, second.id, 0);
    // The second clip now plays first; its overlay must still sit over the same footage (2 s into it).
    expect(p.timeline.overlays[0]?.start).toBeCloseTo(2, 6);
  });
});
