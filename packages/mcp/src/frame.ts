// Frame previews: find which clip is on screen at a timeline time and grab one still from its source file with FFmpeg.
// Stills show the main-track video only (no text overlays or captions); they are for an agent to look at, not for export.

import { execFile } from "node:child_process";
import { clipEnd, ffmpegBin, mainClips, type Project } from "@dax/core";

/** Where a timeline time lands in the source media. */
export interface FrameLocation {
  clipId: string;
  assetId: string;
  /** Absolute or project-relative path of the source file, as stored in the asset. */
  path: string;
  /** The requested time, clamped into the timeline, in seconds of timeline time. */
  timelineTime: number;
  /** Matching position inside the source file, in seconds of source time. */
  sourceTime: number;
}

/** Smallest and largest preview width in pixels. Small keeps the image cheap for a model to read. */
export const FRAME_WIDTH_RANGE = { min: 64, max: 1280, default: 480 } as const;

/** How far inside a clip's end the last frame is sampled, so a time equal to the duration still finds a frame. */
const END_EPSILON = 0.001;

/**
 * Map a timeline time (seconds) to the clip on the main track and the source time inside its asset.
 * Times past the end are clamped to the last frame and negative times to 0.
 * @throws Error when the timeline has no clips or the clip's asset is missing from the project.
 */
export function locateFrame(project: Project, timelineSeconds: number): FrameLocation {
  const clips = mainClips(project);
  const last = clips[clips.length - 1];
  if (!last) throw new Error("The timeline is empty. Import a video first.");
  const duration = clipEnd(last);
  const t = Math.min(Math.max(timelineSeconds, 0), Math.max(duration - END_EPSILON, 0));
  const clip = clips.find((c) => t >= c.start && t < clipEnd(c)) ?? last;
  const asset = project.assets[clip.assetId];
  if (!asset) throw new Error(`Clip ${clip.id} refers to a missing asset "${clip.assetId}".`);
  // Source time = where the clip starts inside the file + how far into the clip we are.
  const sourceTime = Math.min(clip.in + (t - clip.start), clip.out - END_EPSILON);
  return {
    clipId: clip.id,
    assetId: asset.id,
    path: asset.path,
    timelineTime: t,
    sourceTime: Math.max(sourceTime, 0),
  };
}

/**
 * Decode one frame of `path` at `sourceSeconds` and return it as a JPEG, scaled to `width` pixels wide
 * (height follows the aspect ratio). Arguments are passed as an array, never through a shell.
 * @throws Error when FFmpeg is missing, fails, or produces no image.
 */
export function extractFrame(path: string, sourceSeconds: number, width: number): Promise<Buffer> {
  const args = [
    ...["-hide_banner", "-loglevel", "error", "-nostdin"],
    // Seeking before -i is fast and accurate enough for a preview.
    ...["-ss", sourceSeconds.toFixed(3), "-i", path],
    ...["-frames:v", "1", "-vf", `scale=${Math.round(width)}:-2`],
    ...["-f", "image2pipe", "-c:v", "mjpeg", "-q:v", "5", "pipe:1"],
  ];
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegBin(),
      args,
      { encoding: "buffer", maxBuffer: 16 * 1024 * 1024, timeout: 30_000 },
      (err, stdout, stderr) => {
        if (err) {
          reject(
            new Error(`ffmpeg could not read a frame: ${stderr.toString().trim() || err.message}`),
          );
        } else if (stdout.length === 0) {
          reject(new Error("ffmpeg produced no image at that time."));
        } else {
          resolve(stdout);
        }
      },
    );
  });
}
