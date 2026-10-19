// Helpers shared by the rendering tests: make small synthetic media with FFmpeg, and measure what a render produced
// (pixel positions, audio levels). Test-only: it is not exported from the package and is excluded from the build.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** True when an `ffmpeg` binary is on the path. Rendering tests skip themselves otherwise. */
export function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** A private temp folder. Remove it with {@link removeTempDir}, which deletes exactly this folder. */
export function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Delete a folder made by {@link makeTempDir} and everything inside it. */
export function removeTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/** Run FFmpeg quietly with the given arguments; throws with FFmpeg's message on failure. */
function ff(args: string[]): void {
  execFileSync("ffmpeg", ["-y", "-v", "error", ...args], { maxBuffer: 64 * 1024 * 1024 });
}

/** Where the white box in {@link makeBoxVideo} sits in a 640x360 frame (centred on the frame). */
export const BOX = { x: 280, y: 140, w: 80, h: 80 } as const;

/**
 * Make a 640x360 video (grey background, white box at {@link BOX}) with a 300 Hz tone, `seconds` long at 30 fps.
 * A known shape on a flat background makes zoom factors measurable from pixels.
 */
export function makeBoxVideo(path: string, seconds: number): void {
  ff([
    ...["-f", "lavfi", "-i", `color=c=0x303030:s=640x360:r=30:d=${seconds}`],
    ...["-f", "lavfi", "-i", `sine=f=300:d=${seconds}`],
    ...["-vf", `drawbox=x=${BOX.x}:y=${BOX.y}:w=${BOX.w}:h=${BOX.h}:color=white:t=fill`],
    ...["-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "12", "-c:a", "aac", "-shortest", path],
  ]);
}

/** Grey (luma) bytes of every frame of `file`, scaled to `w`x`h`, from `startSec` for `seconds`. */
export function grayFrames(
  file: string,
  w: number,
  h: number,
  startSec = 0,
  seconds?: number,
): Buffer[] {
  const args = ["-v", "error", "-ss", String(startSec), "-i", file];
  if (seconds !== undefined) args.push("-t", String(seconds));
  args.push("-vf", `scale=${w}:${h},format=gray`, "-f", "rawvideo", "-");
  const all = execFileSync("ffmpeg", args, { maxBuffer: 512 * 1024 * 1024 });
  const frames: Buffer[] = [];
  for (let i = 0; i + w * h <= all.length; i += w * h) frames.push(all.subarray(i, i + w * h));
  return frames;
}

/** One grey frame at `t` seconds (640x360 unless told otherwise). */
export function grayFrameAt(file: string, t: number, w = 640, h = 360): Buffer {
  const frame = grayFrames(file, w, h, t, 0.05)[0];
  if (!frame) throw new Error(`No frame at ${t}s in ${file}`);
  return frame;
}

/** The white box's outline in a grey frame: first and last bright column on the middle row, and rows on the middle column. */
export function boxEdges(
  frame: Buffer,
  w = 640,
  h = 360,
): { left: number; right: number; top: number; bottom: number } {
  const bright = (v: number | undefined) => (v ?? 0) > 180;
  const row = Math.floor(h / 2);
  const col = Math.floor(w / 2);
  let left = -1;
  let right = -1;
  for (let x = 0; x < w; x++) {
    if (bright(frame[row * w + x])) {
      if (left < 0) left = x;
      right = x;
    }
  }
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < h; y++) {
    if (bright(frame[y * w + col])) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  return { left, right, top, bottom };
}
