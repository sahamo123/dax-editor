// Test helpers: run the CLI in-process with captured output, and generate media with FFmpeg's lavfi sources.
// Nothing is committed and nothing touches the network.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type CliIo, runCli } from "../index.js";

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
  return mkdtempSync(join(tmpdir(), "dax-cli-test-"));
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

/** What one in-process CLI run produced. */
export interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
}

/** Options for {@link cli}. */
export interface CliRunOptions {
  /** Folder the command runs in. */
  cwd: string;
  /** Environment variables; defaults to a PATH-only environment so a developer's DAX_* variables never leak in. */
  env?: NodeJS.ProcessEnv;
  /** Text returned when the command reads standard input. */
  stdin?: string;
  /** Pretend standard error is a terminal. */
  tty?: boolean;
}

/** Run `dax <args>` in-process and capture its output and exit code. */
export async function cli(args: string[], opts: CliRunOptions): Promise<CliRun> {
  let stdout = "";
  let stderr = "";
  const io: CliIo = {
    stdout: (t) => {
      stdout += t;
    },
    stderr: (t) => {
      stderr += t;
    },
    readStdin: async () => opts.stdin ?? "",
    cwd: opts.cwd,
    env: opts.env ?? { PATH: process.env.PATH },
    stderrIsTTY: opts.tty ?? false,
  };
  const code = await runCli(args, io);
  return { code, stdout, stderr };
}
