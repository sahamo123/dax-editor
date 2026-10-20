// Helpers shared by the rendering tests: make small synthetic media with FFmpeg, and measure what a render produced
// (pixel positions, audio levels). Test-only: it is not exported from the package and is excluded from the build.

import { execFileSync, spawnSync } from "node:child_process";
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
export function ff(args: string[]): void {
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

/** RGB bytes (3 per pixel, row by row) of the frame at `t` seconds, 640x360 unless told otherwise. */
export function rgbFrameAt(file: string, t: number, w = 640, h = 360): Buffer {
  const all = execFileSync(
    "ffmpeg",
    [
      ...["-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1"],
      ...["-vf", `scale=${w}:${h}`, "-pix_fmt", "rgb24", "-f", "rawvideo", "-"],
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  if (all.length < w * h * 3) throw new Error(`No frame at ${t}s in ${file}`);
  return all;
}

/** The pixel at (x, y) of an RGB frame made by {@link rgbFrameAt}. */
export function pixel(frame: Buffer, x: number, y: number, w = 640): [number, number, number] {
  const i = (y * w + x) * 3;
  return [frame[i] ?? 0, frame[i + 1] ?? 0, frame[i + 2] ?? 0];
}

/** Bounding box of the red pixels (a red logo on grey), or null when there are none. `minRed` lowers the bar for translucent logos. */
export function redBounds(
  frame: Buffer,
  w = 640,
  h = 360,
  minRed = 180,
): { left: number; right: number; top: number; bottom: number; count: number } | null {
  let left = w;
  let right = -1;
  let top = h;
  let bottom = -1;
  let count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(frame, x, y, w);
      if (r > minRed && g < 90 && b < 90) {
        count++;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return count === 0 ? null : { left, right, top, bottom, count };
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

/** Levels of a stretch of audio, in dBFS. `band` limits the measurement to a narrow band around that frequency in Hz. */
export function audioLevels(
  file: string,
  startSec: number,
  seconds: number,
  band?: number,
): { rmsDb: number; peakDb: number } {
  const filter = `${band ? `bandpass=f=${band}:width_type=h:w=30,` : ""}astats=metadata=0`;
  // astats reports on stderr, which spawnSync always returns.
  const run = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-ss",
      String(startSec),
      "-t",
      String(seconds),
      "-i",
      file,
      "-vn",
      "-af",
      filter,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return parseLevels(run.stderr);
}

/** Read the overall RMS and peak lines from `astats` output (the last occurrence is the overall block). */
function parseLevels(text: string): { rmsDb: number; peakDb: number } {
  const last = (label: string): number => {
    const all = [...text.matchAll(new RegExp(`${label} dB: (-?inf|-?[\\d.]+)`, "g"))];
    const raw = all.at(-1)?.[1];
    if (raw === undefined) throw new Error(`astats printed no "${label}"`);
    return raw.endsWith("inf") ? Number.NEGATIVE_INFINITY : Number(raw);
  };
  return { rmsDb: last("RMS level"), peakDb: last("Peak level") };
}

/** Speech stand-in: a 1500 Hz tone of amplitude `amp` that is on for 0.8 s and off for 0.6 s, repeating, with a flat grey picture. */
export function makeSpeechVideo(path: string, seconds: number, amp: number): void {
  ff([
    ...["-f", "lavfi", "-i", `color=c=0x303030:s=640x360:r=30:d=${seconds}`],
    ...[
      ...["-f", "lavfi", "-i"],
      `aevalsrc='${amp}*sin(2*PI*1500*t)*lt(mod(t,1.4),0.8)':s=48000:d=${seconds}:c=stereo`,
    ],
    ...["-pix_fmt", "yuv420p", "-c:v", "libx264", "-c:a", "aac", "-shortest", path],
  ]);
}

/** A steady sine tone file (WAV) of `freq` Hz and amplitude `amp`, `seconds` long. */
export function makeTone(path: string, freq: number, seconds: number, amp = 0.5): void {
  ff([
    ...["-f", "lavfi", "-i", `aevalsrc='${amp}*sin(2*PI*${freq}*t)':s=48000:d=${seconds}:c=stereo`],
    ...["-c:a", "pcm_s16le", path],
  ]);
}

/** A solid-colour PNG (with an alpha channel) of the given size, for image overlay tests. */
export function makePng(path: string, color: string, w: number, h: number): void {
  ff(["-f", "lavfi", "-i", `color=c=${color}:s=${w}x${h},format=rgba`, "-frames:v", "1", path]);
}

/** Duration of the audio stream of `file` in seconds, from ffprobe. */
export function audioDuration(file: string): number {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=duration",
      "-of",
      "csv=p=0",
      file,
    ],
    { encoding: "utf8" },
  );
  return Number(out.trim());
}
