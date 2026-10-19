// Small process helpers shared by detection and the runners: run a short command and capture its output, and
// signal a whole process group so helper processes the CLI started (its own MCP servers) die with it.

import { type ChildProcess, spawn } from "node:child_process";

/** Outcome of {@link runProbe}. */
export interface ProbeResult {
  /** Exit code, or null when the process was killed by a signal or never started. */
  exitCode: number | null;
  /** Everything written to stdout, cut at the byte limit. */
  stdout: string;
  /** Everything written to stderr, cut at the byte limit. */
  stderr: string;
  /** True when the time limit expired and the process was killed. */
  timedOut: boolean;
  /** Set when the process could not be started (for example the file vanished). */
  spawnError?: string;
}

/** Options for {@link runProbe}. */
export interface ProbeOptions {
  /** Environment for the child. Build it with `buildChildEnv`. */
  env: Record<string, string>;
  /** Working folder. Default: the current one. */
  cwd?: string;
  /** Kill the process after this many milliseconds. */
  timeoutMs: number;
  /** Stop collecting each stream after this many bytes. Default 64 KiB. */
  maxBytes?: number;
}

/**
 * Run `file args...` to completion and capture its output. No shell is involved and stdin is closed, so the command
 * cannot wait for input. Never throws: failures are reported in the result.
 */
export function runProbe(
  file: string,
  args: readonly string[],
  options: ProbeOptions,
): Promise<ProbeResult> {
  const limit = options.maxBytes ?? 64 * 1024;
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let child: ChildProcess;
    const finish = (result: Omit<ProbeResult, "stdout" | "stderr" | "timedOut">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, stdout, stderr, timedOut });
    };
    try {
      child = spawn(file, [...args], {
        env: options.env,
        ...(options.cwd ? { cwd: options.cwd } : {}),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (err) {
      resolve({
        exitCode: null,
        stdout,
        stderr,
        timedOut,
        spawnError: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      if (stdout.length < limit) stdout += chunk.slice(0, limit - stdout.length);
    });
    child.stderr?.on("data", (chunk: string) => {
      if (stderr.length < limit) stderr += chunk.slice(0, limit - stderr.length);
    });
    child.once("error", (err) => finish({ exitCode: null, spawnError: err.message }));
    child.once("close", (code) => finish({ exitCode: code }));
  });
}

/**
 * Send `signal` to the child's whole process group (POSIX) so the CLI's own helper processes are included.
 * On Windows, where process groups work differently, the child and its descendants are ended with `taskkill`.
 * Silent when the process is already gone.
 */
export function signalProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  const pid = child.pid;
  if (pid === undefined) return;
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      }).on("error", () => undefined);
    } catch {
      // Nothing more to do: the process is probably gone.
    }
    return;
  }
  try {
    // A negative pid addresses the group; the child was started `detached`, so it leads its own group.
    process.kill(-pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // Already exited.
    }
  }
}
