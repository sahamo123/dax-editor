// Makes the test video the e2e specs import. Generated with FFmpeg's lavfi sources, so no media is ever committed.

import { spawn } from "node:child_process";
import { ffmpegBin } from "@dax/core";

/** Run FFmpeg to completion; rejects with the tail of stderr on failure. */
function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBin(), ["-hide_banner", "-loglevel", "error", "-y", ...args]);
    let err = "";
    child.stderr.on("data", (d) => {
      err += d;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${err.slice(-400)}`)),
    );
  });
}

/**
 * Make a small test video with FFmpeg's lavfi sources (no media is ever committed).
 * The audio alternates 1.5 s of tone and 1.5 s of silence, so `remove_silences` has something to cut.
 * Resolves to `path`.
 */
export async function makeFixtureVideo(path, { seconds = 6, width = 1280, height = 720 } = {}) {
  await ffmpeg([
    "-f",
    "lavfi",
    "-i",
    `testsrc2=size=${width}x${height}:rate=30:duration=${seconds}`,
    "-f",
    "lavfi",
    "-i",
    `aevalsrc=if(lt(mod(t\\,3)\\,1.5)\\,0.3*sin(2*PI*440*t)\\,0):s=44100:d=${seconds}`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "ultrafast",
    "-c:a",
    "aac",
    "-shortest",
    path,
  ]);
  return path;
}
