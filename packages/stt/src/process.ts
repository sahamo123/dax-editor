// Runs one child process with cancellation, a timeout and line-by-line output callbacks.
// Never builds shell strings: the binary and its arguments are always passed separately.

import { type ChildProcess, spawn } from "node:child_process";
import { SttError } from "./errors.js";

/** Options for {@link runProcess}. */
export interface RunProcessOptions {
  /** Kill the child and reject with a `cancelled` error when this fires. */
  signal?: AbortSignal;
  /** Kill the child and reject with a `timeout` error after this many milliseconds. */
  timeoutMs?: number;
  /** Called for every complete line the child writes to stderr. */
  onStderrLine?: (line: string) => void;
  /** Called for every complete line the child writes to stdout. */
  onStdoutLine?: (line: string) => void;
  /** Extra environment variables merged over `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Working directory of the child. */
  cwd?: string;
}

/** What a finished child left behind. */
export interface RunProcessResult {
  /** Exit code, or `null` when the child was ended by a signal. */
  code: number | null;
  /** Name of the terminating signal such as `SIGILL`, if any. */
  signal: NodeJS.Signals | null;
  /** The last 40 lines of stderr, for error messages. */
  stderrTail: string;
}

const TAIL_LINES = 40;

// Children still running. If Node exits (crash, Ctrl+C in a CLI) they are killed rather than left
// decoding for minutes with nobody listening.
const running = new Set<ChildProcess>();
let exitHookInstalled = false;
function trackChild(child: ChildProcess): void {
  if (!exitHookInstalled) {
    exitHookInstalled = true;
    process.on("exit", () => {
      for (const c of running) c.kill("SIGKILL");
    });
  }
  running.add(child);
  child.once("close", () => running.delete(child));
}

/**
 * Run `bin` with `args` to completion and resolve with its exit status (a non-zero exit is a normal
 * result, not a rejection). Rejects with {@link SttError} when the binary cannot be started
 * (`binary-missing`), on abort (`cancelled`) and on timeout (`timeout`); in the last two cases the
 * child is killed first (SIGTERM, then SIGKILL after two seconds).
 */
export function runProcess(
  bin: string,
  args: string[],
  opts: RunProcessOptions = {},
): Promise<RunProcessResult> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new SttError("cancelled", "Transcription was cancelled."));
      return;
    }
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
      cwd: opts.cwd,
    });
    trackChild(child);
    const tail: string[] = [];
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      fn();
    };
    const kill = () => {
      child.kill("SIGTERM");
      // A busy decoder can ignore SIGTERM for a moment; make sure it goes away.
      killTimer = setTimeout(() => child.kill("SIGKILL"), 2000);
      killTimer.unref();
    };
    const onAbort = () => {
      kill();
      finish(() => reject(new SttError("cancelled", "Transcription was cancelled.")));
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    if (opts.timeoutMs !== undefined) {
      timer = setTimeout(() => {
        kill();
        finish(() =>
          reject(
            new SttError(
              "timeout",
              `${bin} did not finish within ${Math.round((opts.timeoutMs ?? 0) / 1000)} seconds and was stopped. Try a smaller model or raise timeoutMs.`,
            ),
          ),
        );
      }, opts.timeoutMs);
    }

    const lineSplitter = (cb: (line: string) => void, keepTail: boolean) => {
      let buf = "";
      return (chunk: Buffer) => {
        buf += chunk.toString("utf8");
        // whisper-cli updates progress with carriage returns on some platforms; split on both.
        const parts = buf.split(/\r\n|\n|\r/);
        buf = parts.pop() ?? "";
        for (const line of parts) {
          if (keepTail) {
            tail.push(line);
            if (tail.length > TAIL_LINES) tail.shift();
          }
          cb(line);
        }
      };
    };
    child.stdout.on(
      "data",
      lineSplitter((l) => opts.onStdoutLine?.(l), false),
    );
    child.stderr.on(
      "data",
      lineSplitter((l) => opts.onStderrLine?.(l), true),
    );
    child.on("error", (err: NodeJS.ErrnoException) => {
      finish(() =>
        reject(
          err.code === "ENOENT"
            ? new SttError("binary-missing", `Cannot start ${bin}: file not found.`, { cause: err })
            : new SttError("process-failed", `Cannot start ${bin}: ${err.message}`, { cause: err }),
        ),
      );
    });
    child.on("close", (code, signal) => {
      if (killTimer) clearTimeout(killTimer);
      finish(() => resolve({ code, signal, stderrTail: tail.filter((l) => l.trim()).join("\n") }));
    });
  });
}
