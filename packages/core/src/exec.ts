// Thin wrappers for running FFmpeg and ffprobe. The only place in core that starts processes.

import { type ChildProcess, execFile, spawn } from "node:child_process";

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

/** Options for {@link run}. */
export interface RunOptions {
  /** Kill the process and reject with an `AbortError`-named error when aborted. */
  signal?: AbortSignal;
  /** Kill the process and reject if it runs longer than this many milliseconds. */
  timeoutMs?: number;
}

/** An error named `AbortError`, the shape every cancellable runner in this repo rejects with. */
export function abortError(): Error {
  const e = new Error("Cancelled");
  e.name = "AbortError";
  return e;
}

/** True for an error raised because a {@link RunOptions.signal} fired. */
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/** Run a binary to completion. FFmpeg prints most diagnostics to stderr, so both are returned. */
export function run(bin: string, args: string[], opts: RunOptions = {}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(abortError());
    execFile(
      bin,
      args,
      {
        maxBuffer: 64 * 1024 * 1024,
        ...(opts.signal ? { signal: opts.signal } : {}),
        ...(opts.timeoutMs ? { timeout: opts.timeoutMs, killSignal: "SIGKILL" as const } : {}),
      },
      (err, stdout, stderr) => {
        if (err) {
          if (opts.signal?.aborted) return reject(abortError());
          const tail = stderr.trim().split("\n").slice(-5).join("\n");
          reject(new Error(`${bin} failed: ${err.message}\n${tail}`));
        } else {
          resolve({ stdout, stderr });
        }
      },
    );
  });
}

/** Options for {@link runFfmpeg}. */
export interface RunFfmpegOptions {
  /** Kills FFmpeg (SIGKILL) when aborted; the promise then rejects with an `AbortError`-named error. */
  signal?: AbortSignal;
  /** Called with the child process right after it starts, so a host (the server) can track it and kill it on shutdown. */
  onSpawn?: (child: ChildProcess) => void;
}

/** Run FFmpeg, reporting progress as seconds of output produced. Cancellable through `opts.signal`. */
export function runFfmpeg(
  args: string[],
  onProgress?: (outSeconds: number) => void,
  opts: RunFfmpegOptions = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(abortError());
    const child = spawn(ffmpegBin(), ["-hide_banner", "-nostdin", "-progress", "pipe:1", ...args]);
    opts.onSpawn?.(child);
    const onAbort = () => child.kill("SIGKILL");
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    let stderr = "";
    child.stdout.on("data", (buf: Buffer) => {
      for (const line of buf.toString().split("\n")) {
        const m = /^out_time_us=(\d+)/.exec(line.trim());
        if (m) onProgress?.(Number(m[1]) / 1e6);
      }
    });
    child.stderr.on("data", (buf: Buffer) => (stderr += buf.toString()));
    child.on("error", (err) => {
      opts.signal?.removeEventListener("abort", onAbort);
      reject(err);
    });
    child.on("close", (code) => {
      opts.signal?.removeEventListener("abort", onAbort);
      if (opts.signal?.aborted) reject(abortError());
      else if (code === 0) resolve();
      else
        reject(
          new Error(
            `ffmpeg exited with ${code}\n${stderr.trim().split("\n").slice(-8).join("\n")}`,
          ),
        );
    });
  });
}
