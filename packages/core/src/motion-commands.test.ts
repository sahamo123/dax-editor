// Real generated video verifies motion imports/regeneration/undo without requiring Blender or network in tests.
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { tryRunCommand } from "./commands.js";
import type { MotionRenderer } from "./motion.js";
import { MotionRequestSchema } from "./motion.js";
import { Session } from "./session.js";
import { ff, hasFfmpeg, makeTempDir, removeTempDir } from "./test-utils.js";
import { emptyProject } from "./timeline.js";

describe.skipIf(!hasFfmpeg())("bounded motion templates", () => {
  let dir: string;
  beforeAll(() => {
    dir = makeTempDir("dax-motion-");
    ff([
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=160x128:r=12:d=1",
      "-c:v",
      "mpeg4",
      join(dir, "output.mp4"),
    ]);
  });
  afterAll(() => removeTempDir(dir));
  it("imports a rendered asset with a recipe, regenerates in place and undoes it", async () => {
    const render = vi.fn(async () => join(dir, "output.mp4"));
    const motion: MotionRenderer = {
      async status() {
        return { available: true, detail: "Test renderer" };
      },
      render,
    };
    const session = new Session(emptyProject("Motion"));
    const context = { session, motion, allowedRoots: [dir] };
    const request = {
      template: "title-card",
      text: "Hello",
      duration: 1,
      width: 160,
      height: 128,
      fps: 12,
    };
    expect((await tryRunCommand(context, "render_motion_template", request)).ok).toBe(true);
    const asset = Object.values(session.project.assets)[0];
    expect(asset?.generation?.parameters.text).toBe("Hello");
    expect(asset).toBeDefined();
    expect(
      (
        await tryRunCommand(context, "render_motion_template", {
          ...request,
          text: "Updated",
          replaceAssetId: asset?.id,
        })
      ).ok,
    ).toBe(true);
    expect(Object.values(session.project.assets)).toHaveLength(1);
    await session.undo();
    expect(Object.values(session.project.assets)[0]?.generation?.parameters.text).toBe("Hello");
    await session.undo();
    expect(Object.values(session.project.assets)).toHaveLength(0);
    const invalid = await tryRunCommand(context, "render_motion_template", {
      ...request,
      template: "arbitrary-python",
      script: "bad",
    });
    expect(invalid.ok).toBe(false);
    expect(render).toHaveBeenCalledTimes(2);
  });
  it("rejects resource overflows, unsupported templates and missing logo inputs", async () => {
    expect(
      MotionRequestSchema.safeParse({ template: "title-card", text: "x", width: 100000 }).success,
    ).toBe(false);
    const session = new Session(emptyProject("Logo"));
    const render = vi.fn(async () => join(dir, "output.mp4"));
    const out = await tryRunCommand(
      { session, motion: { status: async () => ({ available: true, detail: "Test" }), render } },
      "render_motion_template",
      { template: "logo-intro", text: "Logo" },
    );
    expect(out.ok).toBe(false);
    expect(render).not.toHaveBeenCalled();
  });
});
