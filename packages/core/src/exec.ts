// Thin wrappers for running FFmpeg and ffprobe. The only place in core that starts processes.

import { execFile, spawn } from "node:child_process";

/** Binaries can be overridden so the desktop app can point at bundled sidecars. */
export function ffmpegBin(): string {
  return process.env.DAX_FFMPEG ?? "ffmpeg";
}

/** Path to the ffprobe binary; override with `DAX_FFPROBE` (see {@link ffmpegBin}). */
export function ffprobeBin(): string {
  return process.env.DAX_FFPROBE ?? "ffprobe";
}

/** Captured output of a finished process. */
export interface ExecResult {
  stdout: string;
  stderr: string;
}

/** Run a binary to completion. FFmpeg prints most diagnostics to stderr, so both are returned. */
export function run(bin: string, args: string[]): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const tail = stderr.trim().split("\n").slice(-5).join("\n");
        reject(new Error(`${bin} failed: ${err.message}\n${tail}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

/** Run FFmpeg, reporting progress as seconds of output produced. */
export function runFfmpeg(
  args: string[],
  onProgress?: (outSeconds: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBin(), ["-hide_banner", "-nostdin", "-progress", "pipe:1", ...args]);
    let stderr = "";
    child.stdout.on("data", (buf: Buffer) => {
      for (const line of buf.toString().split("\n")) {
        const m = /^out_time_us=(\d+)/.exec(line.trim());
        if (m) onProgress?.(Number(m[1]) / 1e6);
      }
    });
    child.stderr.on("data", (buf: Buffer) => (stderr += buf.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `ffmpeg exited with ${code}\n${stderr.trim().split("\n").slice(-8).join("\n")}`,
          ),
        );
    });
  });
}
