// Generates the synthetic footage that eval tasks run against, using FFmpeg so no media is committed.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { ffmpegBin } from "@dax/core";
import type { FixtureName } from "./task.js";

const execFileAsync = promisify(execFile);

/**
 * Create (or reuse) a synthetic test video in `dir` and return its path.
 * Fixtures are generated with FFmpeg so the repo stores no media files and
 * every machine gets byte-identical inputs.
 *
 * `tone-silence-tone`: 6 s, 320x240 @ 30 fps. Audio is a tone for 0-2 s,
 * silence for 2-4 s, and a tone again for 4-6 s.
 */
export async function generateFixture(name: FixtureName, dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const out = join(dir, `${name}.mp4`);
  if (existsSync(out)) return out;

  switch (name) {
    case "tone-silence-tone":
      await execFileAsync(ffmpegBin(), [
        ...["-y", "-hide_banner", "-loglevel", "error"],
        ...["-f", "lavfi", "-i", "testsrc=d=6:s=320x240:r=30"],
        ...["-f", "lavfi", "-i", "sine=f=440:d=2"],
        ...["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=2"],
        ...["-f", "lavfi", "-i", "sine=f=440:d=2"],
        ...["-filter_complex", "[1:a][2:a][3:a]concat=n=3:v=0:a=1[a]"],
        ...["-map", "0:v", "-map", "[a]", "-c:v", "mpeg4", "-c:a", "aac", "-shortest"],
        out,
      ]);
      return out;
  }
}
