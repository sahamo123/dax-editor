// Export safety: atomic output, cancellation, process hand-off and refusing to overwrite a source file.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  linkSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { probe } from "./media.js";
import { exportProject } from "./render.js";
import type { Project } from "./schema.js";
import { addAsset, appendClip, emptyProject } from "./timeline.js";

function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasFfmpeg())("export safety (needs ffmpeg)", () => {
  let dir: string;
  let src: string;
  let project: Project;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "dax-export-"));
    src = join(dir, "src.mp4");
    execFileSync(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=d=20:s=640x360:r=25"].concat([
        "-f",
        "lavfi",
        "-i",
        "sine=d=20",
        "-c:v",
        "mpeg4",
        "-c:a",
        "aac",
        "-shortest",
        src,
      ]),
    );
    const asset = await probe(src);
    project = appendClip(
      addAsset(emptyProject("exp", { width: 640, height: 360, fps: 25 }), asset),
      asset.id,
    );
  }, 60_000);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const partials = () => readdirSync(dir).filter((f) => f.includes("partial"));

  it("writes under a temporary name and only swaps the finished file in", async () => {
    const out = join(dir, "atomic.mp4");
    writeFileSync(out, "OLD CONTENT");
    let sawOldDuring: boolean | undefined;
    let sawPartial = false;
    await exportProject(project, out, {
      onProgress: (f) => {
        if (f > 0 && f < 1 && sawOldDuring === undefined) {
          // Mid-render the real path must still hold the previous file, never a half-written one.
          sawOldDuring = readFileSync(out, "utf8") === "OLD CONTENT";
          sawPartial = partials().length > 0;
        }
      },
    });
    expect(sawOldDuring).toBe(true);
    expect(sawPartial).toBe(true);
    expect((await probe(out)).duration).toBeGreaterThan(19);
    expect(partials()).toEqual([]);
  }, 120_000);

  it("can be cancelled: FFmpeg is killed and nothing is left behind", async () => {
    const out = join(dir, "cancelled.mp4");
    const ac = new AbortController();
    let spawned = 0;
    const run = exportProject(project, out, {
      signal: ac.signal,
      onSpawn: () => {
        spawned++;
      },
      onProgress: () => ac.abort(),
    });
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(spawned).toBeGreaterThanOrEqual(1);
    expect(existsSync(out)).toBe(false);
    expect(partials()).toEqual([]);
  }, 120_000);

  it("refuses to export over one of its own source files, however it is named", async () => {
    const before = readFileSync(src);
    // A Windows directory junction aliases the source without requiring file-symlink privileges.
    const soft =
      process.platform === "win32" ? join(dir, "alias", "src.mp4") : join(dir, "soft.mp4");
    const hard = join(dir, "hard.mp4");
    if (process.platform === "win32") symlinkSync(dir, join(dir, "alias"), "junction");
    else symlinkSync(src, soft);
    linkSync(src, hard);
    for (const target of [src, soft, hard]) {
      await expect(exportProject(project, target)).rejects.toThrow(/source file/);
    }
    expect(readFileSync(src).equals(before)).toBe(true);
  }, 60_000);
});
