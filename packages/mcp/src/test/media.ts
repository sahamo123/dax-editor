// Test helpers: detect FFmpeg, make a private temp folder, and generate a short clip with FFmpeg's lavfi sources.
// Nothing is committed and nothing touches the network.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** True when both ffmpeg and ffprobe run, so FFmpeg-backed tests can be skipped on machines without them. */
export function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Create a unique folder under the OS temp dir. Remove it with {@link removeTempDir}, never by deleting the parent. */
export function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "dax-mcp-test-"));
}

/** Remove exactly the folder {@link makeTempDir} returned. */
export function removeTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/**
 * Make a 6 s, 320x240 clip: tone for 2 s, silence for 2 s, tone for 2 s, over a moving test picture.
 * The silence gives the cut engine something to remove. Returns the file path.
 */
export function makeClip(dir: string, name = "clip.mp4"): string {
  const out = join(dir, name);
  execFileSync(
    "ffmpeg",
    [
      ...["-y", "-hide_banner", "-loglevel", "error"],
      ...["-f", "lavfi", "-i", "testsrc=d=6:s=320x240:r=30"],
      ...["-f", "lavfi", "-i", "sine=f=440:d=2"],
      ...["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=2"],
      ...["-f", "lavfi", "-i", "sine=f=440:d=2"],
      ...["-filter_complex", "[1:a][2:a][3:a]concat=n=3:v=0:a=1[a]"],
      ...["-map", "0:v", "-map", "[a]", "-c:v", "mpeg4", "-c:a", "aac", "-shortest", out],
    ],
    { stdio: "ignore" },
  );
  return out;
}
