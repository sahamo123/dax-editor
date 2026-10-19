// Tests for project-file validation: ids that reach file names, duplicate overlays, and frame-size bounds.

import { describe, expect, it } from "vitest";
import { overlayFromPreset } from "./presets.js";
import { buildRenderPlan } from "./render.js";
import { type Asset, OverlaySchema, type Project, ProjectSchema } from "./schema.js";
import { addAsset, appendClip, emptyProject } from "./timeline.js";

const asset: Asset = { id: "a1", path: "/x/a.mp4", kind: "video", duration: 10, hasAudio: true };

function withOverlays(...ids: string[]): Project {
  let p = appendClip(addAsset(emptyProject("t"), asset), "a1");
  p = structuredClone(p);
  p.timeline.overlays = ids.map((id) => ({
    ...overlayFromPreset("title-fade", { start: 1, duration: 2, text: id.slice(0, 20) || "x" }),
    id,
  }));
  return p;
}

describe("ids from project files", () => {
  it("rejects overlay ids that could climb out of a folder or be a path", () => {
    for (const id of ["../../evil", "a/b", "a\\b", "", "x".repeat(65), "a b", "a\0b"]) {
      const o = { ...overlayFromPreset("title-fade", { start: 0, text: "hi" }), id };
      expect(OverlaySchema.safeParse(o).success, JSON.stringify(id)).toBe(false);
    }
    const ok = { ...overlayFromPreset("title-fade", { start: 0, text: "hi" }), id: "ovl_ab-12" };
    expect(OverlaySchema.safeParse(ok).success).toBe(true);
  });

  it("rejects a project with two overlays that share an id", () => {
    const r = ProjectSchema.safeParse(withOverlays("dup", "dup"));
    expect(r.success).toBe(false);
    expect(ProjectSchema.safeParse(withOverlays("one", "two")).success).toBe(true);
  });

  it("rejects hostile asset, clip and track ids too", () => {
    const p = withOverlays("one");
    const bad = structuredClone(p);
    const clip = bad.timeline.tracks[0]?.clips[0];
    if (clip) clip.id = "../clip";
    expect(ProjectSchema.safeParse(bad).success).toBe(false);
    const badAsset = structuredClone(p);
    badAsset.assets = { "../a": { ...asset, id: "../a" } };
    expect(ProjectSchema.safeParse(badAsset).success).toBe(false);
  });
});

describe("overlay text files", () => {
  it("are named by position, so an id can neither escape the work folder nor collide with another overlay", () => {
    // Built by hand: this is what a plan would see if validation were bypassed.
    const p = withOverlays("../../../escape", "../../../escape");
    const plan = buildRenderPlan(p, "/out/o.mp4", "libx264", { workDir: "/work/dir" });
    const paths = plan.files.map((f) => f.path);
    expect(paths.length).toBeGreaterThanOrEqual(2);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) {
      expect(path.startsWith("/work/dir/ov")).toBe(true);
      expect(path).not.toContain("..");
    }
  });
});

describe("frame bounds", () => {
  const base = () => structuredClone(emptyProject("t"));
  const parse = (patch: Partial<Project["timeline"]>) => {
    const p = base();
    Object.assign(p.timeline, patch);
    return ProjectSchema.safeParse(p).success;
  };

  it("accepts sensible formats and refuses absurd ones", () => {
    expect(parse({ width: 1920, height: 1080, fps: 30 })).toBe(true);
    expect(parse({ width: 1_000_000, height: 1080 })).toBe(false);
    expect(parse({ height: 100_000 })).toBe(false);
    expect(parse({ width: 2 })).toBe(false);
    expect(parse({ fps: 0 })).toBe(false);
    expect(parse({ fps: 100_000 })).toBe(false);
  });
});
