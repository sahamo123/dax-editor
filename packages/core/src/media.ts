// Looking at media: ffprobe metadata, silence and scene detection, and the pure parsers for FFmpeg's text output.

import { basename, resolve } from "node:path";
import { ffmpegBin, ffprobeBin, run } from "./exec.js";
import { newId } from "./ids.js";
import type { Asset, Range } from "./schema.js";

/** Inspect a media file with ffprobe and describe it as an Asset. */
export async function probe(path: string): Promise<Asset> {
  const abs = resolve(path);
  const { stdout } = await run(ffprobeBin(), [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    abs,
  ]);
  return parseProbe(JSON.parse(stdout), abs);
}

/** The subset of an ffprobe stream entry that {@link parseProbe} reads. */
export interface ProbeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  duration?: string;
  disposition?: { attached_pic?: number };
}

/** Convert ffprobe's JSON into an {@link Asset}. Kept separate from {@link probe} so it can be tested without ffprobe installed. */
export function parseProbe(
  json: { streams?: ProbeStream[]; format?: { duration?: string; format_name?: string } },
  absPath: string,
): Asset {
  const streams = json.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");
  if (!video && !audio) throw new Error(`${basename(absPath)} has no audio or video streams`);

  const rawDuration = Number(json.format?.duration ?? video?.duration ?? audio?.duration ?? 0);
  const duration = Number.isFinite(rawDuration) ? rawDuration : 0;
  const isStill = video?.disposition?.attached_pic === 1;
  // A PNG or JPEG file shows up as a one-frame "video" stream; its container name (png_pipe, jpeg_pipe,
  // webp_pipe, image2, ...) is what tells it apart from a real video.
  const format = json.format?.format_name ?? "";
  const isPicture = !audio && (format === "image2" || /_pipe$/.test(format));
  const kind: Asset["kind"] = video && !isStill && !isPicture ? "video" : audio ? "audio" : "image";

  const asset: Asset = {
    id: newId("asset"),
    path: absPath,
    kind,
    duration,
    hasAudio: Boolean(audio),
  };
  if (video?.width && video.height) {
    asset.width = video.width;
    asset.height = video.height;
  }
  const fps = parseRate(video?.r_frame_rate);
  if (fps) asset.fps = fps;
  return asset;
}

function parseRate(rate?: string): number | undefined {
  if (!rate) return undefined;
  const [n, d] = rate.split("/").map(Number);
  if (!n || !d) return undefined;
  return n / d;
}

/** Tuning for {@link detectSilence}. */
export interface SilenceOptions {
  /** Anything quieter than this is silence. Default -30 dB. */
  noiseDb?: number;
  /** Silences shorter than this (seconds) are ignored. Default 0.5. */
  minDuration?: number;
}

/** Find silent stretches in a file's audio. */
export async function detectSilence(
  path: string,
  totalDuration: number,
  opts: SilenceOptions = {},
): Promise<Range[]> {
  const noise = opts.noiseDb ?? -30;
  const min = opts.minDuration ?? 0.5;
  const { stderr } = await run(ffmpegBin(), [
    "-hide_banner",
    "-nostdin",
    "-i",
    resolve(path),
    "-vn",
    "-af",
    `silencedetect=noise=${noise}dB:d=${min}`,
    "-f",
    "null",
    "-",
  ]);
  return parseSilenceDetect(stderr, totalDuration);
}

/** Parse `silencedetect` log output into ranges. A silence still open at end of file is closed at `totalDuration`. */
export function parseSilenceDetect(stderr: string, totalDuration: number): Range[] {
  const ranges: Range[] = [];
  let open: number | undefined;
  for (const line of stderr.split("\n")) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (s) {
      open = Math.max(0, Number(s[1]));
      continue;
    }
    const e = /silence_end:\s*(-?[\d.]+)/.exec(line);
    if (e && open !== undefined) {
      ranges.push({ start: open, end: Number(e[1]) });
      open = undefined;
    }
  }
  // A silence that runs to the end of the file never prints silence_end.
  if (open !== undefined && totalDuration > open) ranges.push({ start: open, end: totalDuration });
  return ranges;
}

/** Complement of `silences` within [0, total]: the stretches worth keeping. */
export function invertRanges(silences: Range[], total: number): Range[] {
  const sorted = [...silences].sort((a, b) => a.start - b.start);
  const speech: Range[] = [];
  let cursor = 0;
  for (const r of sorted) {
    if (r.start > cursor) speech.push({ start: cursor, end: r.start });
    cursor = Math.max(cursor, r.end);
  }
  if (cursor < total) speech.push({ start: cursor, end: total });
  return speech;
}

/**
 * Shrink each silence by `pad` seconds on both sides so cuts keep a little
 * breathing room around speech. Silences no longer than 2*pad vanish.
 */
export function padSilences(silences: Range[], pad: number): Range[] {
  return silences
    .map((r) => ({ start: r.start + pad, end: r.end - pad }))
    .filter((r) => r.end - r.start > 0.05);
}

/** Timestamps (seconds) where the picture changes sharply. */
export async function detectScenes(path: string, threshold = 0.4): Promise<number[]> {
  const { stderr } = await run(ffmpegBin(), [
    "-hide_banner",
    "-nostdin",
    "-i",
    resolve(path),
    "-an",
    "-vf",
    `select='gt(scene,${threshold})',showinfo`,
    "-f",
    "null",
    "-",
  ]);
  return parseSceneChanges(stderr);
}

/** Extract `pts_time` values, in seconds, from `showinfo` log lines. */
export function parseSceneChanges(stderr: string): number[] {
  const times: number[] = [];
  for (const line of stderr.split("\n")) {
    if (!line.includes("showinfo")) continue;
    const m = /pts_time:\s*([\d.]+)/.exec(line);
    if (m) times.push(Number(m[1]));
  }
  return times;
}
