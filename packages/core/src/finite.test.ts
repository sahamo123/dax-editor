// Tests that numbers from project files and command arguments must be finite: z.number() alone
// accepts Infinity, which then reaches the timeline and FFmpeg.

import { describe, expect, it } from "vitest";
import { getCommand } from "./commands.js";
import { type Asset, ProjectSchema } from "./schema.js";
import { addAsset, appendClip, emptyProject } from "./timeline.js";

const asset: Asset = { id: "a1", path: "/x/a.mp4", kind: "video", duration: 10, hasAudio: true };

/** A small valid project with one clip on the main track. */
function project() {
  return appendClip(addAsset(emptyProject("t"), asset), "a1");
}

describe("finite numbers from project files", () => {
  it("refuses Infinity in a clip and in an asset duration", () => {
    const clipOut = structuredClone(project());
    // The clip is the first on the first track; the schema is what is under test, not the path.
    const clip = (clipOut.timeline.tracks[0] as { clips: { out: number }[] }).clips[0] as {
      out: number;
    };
    clip.out = Number.POSITIVE_INFINITY;
    expect(ProjectSchema.safeParse(clipOut).success).toBe(false);

    const durationInfinite = structuredClone(project());
    const first = durationInfinite.assets.a1 as { duration: number };
    first.duration = Number.POSITIVE_INFINITY;
    expect(ProjectSchema.safeParse(durationInfinite).success).toBe(false);
  });

  it("still saves and reloads a normal project unchanged", () => {
    const original = project();
    // The session writes JSON and reads it back through ProjectSchema.
    const reloaded = ProjectSchema.parse(JSON.parse(JSON.stringify(original)));
    expect(reloaded).toEqual(original);
  });
});

describe("finite numbers from command arguments", () => {
  it("refuses Infinity as a timeline time and accepts a normal one", () => {
    const split = getCommand("split");
    expect(split).toBeDefined();
    expect(split?.schema.safeParse({ at: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(split?.schema.safeParse({ at: Number.NEGATIVE_INFINITY }).success).toBe(false);
    expect(split?.schema.safeParse({ at: 3.5 }).success).toBe(true);
  });
});
