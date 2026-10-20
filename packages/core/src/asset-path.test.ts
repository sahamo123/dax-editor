// Tests for asset paths: a path reaches FFmpeg as an input name, so only absolute local paths are
// allowed, and every FFmpeg input is opened with a protocol whitelist that allows plain files only.

import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyzeAudio } from "./cuts.js";
import { detectScenes, detectSilence } from "./media.js";
import { buildRenderPlan } from "./render.js";
import { type Asset, AssetSchema } from "./schema.js";
import { addAsset, appendClip, emptyProject } from "./timeline.js";

const posix = process.platform !== "win32";

const video: Asset = {
  id: "a1",
  path: "/media/a.mp4",
  kind: "video",
  duration: 10,
  hasAudio: true,
};

describe("asset paths", () => {
  it.each([
    "https://example.com/a.mp4",
    "file:///etc/passwd",
    "concat:/x/a.mp4|/x/b.mp4",
    "rtmp://host/live",
    "pipe:0",
    "data:video/mp4;base64,AAAA",
    "a.mp4",
    "./a.mp4",
    "../a.mp4",
    "videos/a.mp4",
    "-i",
    "C:foo.mp4",
    "",
  ])("refuses %j", (path) => {
    expect(AssetSchema.safeParse({ ...video, path }).success).toBe(false);
  });

  it.each([
    "/home/me/a.mp4",
    "C:\\Users\\me\\a.mp4",
    "c:/videos/a.mp4",
    "\\\\server\\share\\a.mp4",
  ])("accepts the absolute local path %j", (path) => {
    expect(AssetSchema.safeParse({ ...video, path }).success).toBe(true);
  });
});

/** Every `-i` must be directly preceded by `-protocol_whitelist file`. */
function expectWhitelistedInputs(args: string[]): void {
  const inputs = args.flatMap((a, i) => (a === "-i" ? [i] : []));
  expect(inputs.length).toBeGreaterThan(0);
  for (const i of inputs) {
    expect(args.slice(i - 2, i)).toEqual(["-protocol_whitelist", "file"]);
  }
}

describe("render inputs", () => {
  it("opens every timeline input with the file-only protocol whitelist", () => {
    let p = addAsset(emptyProject("t"), video);
    p = addAsset(p, {
      id: "a2",
      path: "/media/b.mp4",
      kind: "video",
      duration: 5,
      hasAudio: false,
    });
    p = appendClip(p, "a1");
    p = appendClip(p, "a2");
    const plan = buildRenderPlan(p, "/out/x.mp4", "mpeg4");
    expectWhitelistedInputs(plan.args);
  });
});

describe.skipIf(!posix)("analysis inputs", () => {
  let dir: string;
  const oldBin = process.env.DAX_FFMPEG;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "dax-ffin-"));
  });
  afterEach(() => {
    if (oldBin === undefined) delete process.env.DAX_FFMPEG;
    else process.env.DAX_FFMPEG = oldBin;
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * Point DAX_FFMPEG at a stand-in that records its arguments and exits 0 without doing any work,
   * so the test checks the argument list alone and needs no FFmpeg.
   */
  function recordArgs(): () => string[] {
    const record = join(dir, "args.txt");
    const bin = join(dir, "fake-ffmpeg");
    writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' "$@" > '${record}'\nexit 0\n`);
    chmodSync(bin, 0o755);
    process.env.DAX_FFMPEG = bin;
    return () =>
      readFileSync(record, "utf8")
        .split("\n")
        .filter((l) => l !== "");
  }

  // A real file, so nothing fails before FFmpeg is called.
  const source = (): string => {
    mkdirSync(join(dir, "media"), { recursive: true });
    const file = join(dir, "media", "a.mp4");
    writeFileSync(file, "not really video");
    return file;
  };

  it("detectSilence opens its input with the file-only whitelist", async () => {
    const args = recordArgs();
    await detectSilence(source()).catch(() => undefined);
    expectWhitelistedInputs(args());
  });

  it("detectScenes opens its input with the file-only whitelist", async () => {
    const args = recordArgs();
    await detectScenes(source()).catch(() => undefined);
    expectWhitelistedInputs(args());
  });

  it("analyzeAudio opens its input with the file-only whitelist", async () => {
    const args = recordArgs();
    await analyzeAudio(source()).catch(() => undefined);
    expectWhitelistedInputs(args());
  });
});
