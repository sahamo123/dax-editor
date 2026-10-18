// Runs FFmpeg for the media pipeline with cancellation, progress parsing and a registry so shutdown can kill every child.
// core's own runner is not exported and cannot be cancelled, so the server keeps this small one. Arguments are always an array (never a shell string).

import { type ChildProcess, spawn } from "node:child_process";
import { ffmpegBin } from "@dax/core";

/** Remembers running child processes so graceful shutdown can terminate them. */
export class ProcessRegistry {
  private readonly children = new Set<ChildProcess>();

  /** Track a child until it exits. */
  add(child: ChildProcess): void {
    this.children.add(child);
    child.once("close", () => this.children.delete(child));
  }

  /** Send SIGKILL to every tracked child. Used on shutdown; FFmpeg output files are written to temp names, so partial files are never served. */
  killAll(): void {
    for (const c of this.children) c.kill("SIGKILL");
  }
}

/** Options for {@link runFfmpegProcess}. */
export interface FfmpegRunOptions {
  /** FFmpeg arguments, without the binary name. `-hide_banner -nostdin` are added. */
  args: string[];
  /** Kill the process when aborted; the promise then rejects with an `AbortError`-named error. */
  signal?: AbortSignal;
  /** Tracks the child for shutdown. */
  registry: ProcessRegistry;
  /** Receives raw stdout bytes (for example PCM audio). When omitted, stdout is parsed for `-progress pipe:1` lines. */
  onStdout?: (chunk: Buffer) => void;
  /** Called with seconds of output produced, parsed from `-progress pipe:1` (requires that flag in `args` and no `onStdout`). */
  onOutSeconds?: (seconds: number) => void;
}

/** Run FFmpeg to completion. Rejects with the last lines of stderr on a non-zero exit. */
export function runFfmpegProcess(opts: FfmpegRunOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(abortError());
    const child = spawn(ffmpegBin(), ["-hide_banner", "-nostdin", ...opts.args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    opts.registry.add(child);
    let stderr = "";
    let aborted = false;
    const onAbort = () => {
      aborted = true;
      child.kill("SIGKILL");
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    let pending = "";
    child.stdout.on("data", (buf: Buffer) => {
      if (opts.onStdout) return opts.onStdout(buf);
      pending += buf.toString();
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const m = /^out_time_us=(\d+)/.exec(line.trim());
        if (m) opts.onOutSeconds?.(Number(m[1]) / 1e6);
      }
    });
    child.stderr.on("data", (buf: Buffer) => {
      stderr = (stderr + buf.toString()).slice(-4000);
    });
    child.on("error", (err) => {
      opts.signal?.removeEventListener("abort", onAbort);
      reject(err);
    });
    child.on("close", (code) => {
      opts.signal?.removeEventListener("abort", onAbort);
      if (aborted) return reject(abortError());
      if (code === 0) return resolve();
      reject(
        new Error(`ffmpeg exited with ${code}: ${stderr.trim().split("\n").slice(-4).join(" | ")}`),
      );
    });
  });
}

function abortError(): Error {
  const e = new Error("Cancelled");
  e.name = "AbortError";
  return e;
}

/** True for the error {@link runFfmpegProcess} raises when cancelled. */
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}
