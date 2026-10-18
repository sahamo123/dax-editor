import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { detectSilence, invertRanges, padSilences, probe } from "./media.js";
import { exportProject } from "./render.js";
import { Session } from "./session.js";
import { addAsset, appendClip, emptyProject, removeAssetRanges, timelineDuration } from "./timeline.js";

function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// 6s clip: tone (0-2s), silence (2-4s), tone (4-6s), with a moving test picture.
describe.skipIf(!hasFfmpeg())("engine end to end (needs ffmpeg)", () => {
  let dir: string;
  let src: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "dax-test-"));
    src = join(dir, "src.mp4");
    execFileSync(
      "ffmpeg",
      [
        "-y", "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", "testsrc=d=6:s=320x240:r=30",
        "-f", "lavfi", "-i", "sine=f=440:d=2",
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=2",
        "-f", "lavfi", "-i", "sine=f=440:d=2",
        "-filter_complex", "[1:a][2:a][3:a]concat=n=3:v=0:a=1[a]",
        "-map", "0:v", "-map", "[a]",
        "-c:v", "mpeg4", "-c:a", "aac", "-shortest",
        src,
      ],
      { stdio: "inherit" },
    );
  }, 60_000);

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("probes the generated file", async () => {
    const a = await probe(src);
    expect(a.kind).toBe("video");
    expect(a.hasAudio).toBe(true);
    expect(a.width).toBe(320);
    expect(a.duration).toBeGreaterThan(5.8);
    expect(a.duration).toBeLessThan(6.3);
  });

  it("finds the silent middle", async () => {
    const a = await probe(src);
    const silences = await detectSilence(src, a.duration);
    expect(silences).toHaveLength(1);
    expect(silences[0]!.start).toBeGreaterThan(1.8);
    expect(silences[0]!.start).toBeLessThan(2.3);
    expect(silences[0]!.end).toBeGreaterThan(3.7);
    expect(silences[0]!.end).toBeLessThan(4.3);
  }, 30_000);

  it("removes the silence and exports a shorter video", async () => {
    const asset = await probe(src);
    let p = appendClip(addAsset(emptyProject("e2e", { width: 320, height: 240, fps: 30 }), asset), asset.id);
    const silences = padSilences(await detectSilence(src, asset.duration), 0.1);
    p = removeAssetRanges(p, asset.id, silences);
    const expected = timelineDuration(p);
    expect(expected).toBeLessThan(asset.duration - 1.5);

    const out = join(dir, "out.mp4");
    await exportProject(p, out);
    expect(existsSync(out)).toBe(true);
    const result = await probe(out);
    expect(Math.abs(result.duration - expected)).toBeLessThan(0.25);
    expect(result.hasAudio).toBe(true);
    expect(invertRanges([], 1)).toEqual([{ start: 0, end: 1 }]);
  }, 60_000);

  it("persists a session and supports undo/redo", async () => {
    const file = join(dir, "p.dax.json");
    const s = await Session.open(file, "persist");
    const asset = await probe(src);
    await s.apply((p) => appendClip(addAsset(p, asset), asset.id));
    expect(timelineDuration(s.project)).toBeGreaterThan(5.8);
    await s.undo();
    expect(timelineDuration(s.project)).toBe(0);
    await s.redo();
    expect(timelineDuration(s.project)).toBeGreaterThan(5.8);

    const reopened = await Session.open(file);
    expect(timelineDuration(reopened.project)).toBeGreaterThan(5.8);
  }, 30_000);
});
