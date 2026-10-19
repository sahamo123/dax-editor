/**
 * Helpers that make sure a child process never outlives the app: killing a whole process tree,
 * a shell watchdog that kills the child if the parent disappears (even on SIGKILL), a registry
 * that kills everything on normal exit, and a pid file that lets the next launch reap leftovers
 * (the only protection on Windows, where Node cannot create a kill-on-close job object).
 * Knows nothing about llama.cpp.
 */
import { execFile, spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { basename, dirname } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Ask the OS for a TCP port on 127.0.0.1 that is free right now. */
export async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Could not determine a free port"));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

/** True if a process with this pid exists (signal 0 only checks, it sends nothing). */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means it exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Send `signal` to a process and everything it started. On POSIX the child must have been
 * spawned `detached` so it leads its own process group; on Windows `taskkill /T` walks the tree.
 * Never throws (the process may already be gone).
 */
export function killTree(pid: number, signal: NodeJS.Signals = "SIGTERM"): void {
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(pid), "/T", ...(signal === "SIGKILL" ? ["/F"] : [])], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      process.kill(-pid, signal);
    }
  } catch {
    // Already exited, or not a group leader: fall back to the single process.
    try {
      process.kill(pid, signal);
    } catch {
      // gone
    }
  }
}

const watchdogScript = [
  'parent="$1"; shift',
  '"$@" &',
  "child=$!",
  // Tell the parent which process is the real server (the shell's own pid is not it).
  'echo "dax-watchdog child-pid=$child" >&2',
  "trap 'kill -TERM \"$child\" 2>/dev/null' TERM INT HUP",
  'while kill -0 "$child" 2>/dev/null; do',
  '  if ! kill -0 "$parent" 2>/dev/null; then',
  // The shell leads its own process group (the child was spawned detached), so signalling
  // the group also reaches anything the server started. Ignore TERM ourselves so we live to
  // send the final KILL, which takes the shell down with the rest.
  '    trap \'\' TERM; kill -TERM "-$$" 2>/dev/null; sleep 1; kill -KILL "-$$" 2>/dev/null; break',
  "  fi",
  "  sleep 1",
  "done",
  'wait "$child"',
  "exit $?",
].join("\n");

/**
 * Wrap a command so that it is killed within about a second if the process `parentPid` dies,
 * even by SIGKILL. Uses POSIX `sh` (present on macOS and Linux); arguments are passed as
 * separate argv entries, never concatenated into a shell string. Not available on Windows.
 */
export function withParentWatchdog(
  parentPid: number,
  command: string,
  args: string[],
): { command: string; args: string[] } {
  return {
    command: "/bin/sh",
    args: ["-c", watchdogScript, "dax-watchdog", String(parentPid), command, ...args],
  };
}

/** Anything with a synchronous kill, so the exit hook can be tested without real processes. */
export interface Killable {
  /** Terminate the process tree right now. */
  killNow(): void;
}

const live = new Set<Killable>();
let hooked = false;

/**
 * Register a process so that it is killed when this Node process exits normally (including
 * `process.exit()` and uncaught exceptions). Returns a function that removes it again.
 * Signals are not intercepted: the host app decides what SIGINT/SIGTERM mean.
 */
export function registerForExitCleanup(item: Killable): () => void {
  live.add(item);
  if (!hooked) {
    hooked = true;
    process.on("exit", killAllRegistered);
  }
  return () => {
    live.delete(item);
  };
}

/** Kill every process registered with `registerForExitCleanup`. Safe to call repeatedly. */
export function killAllRegistered(): void {
  for (const item of live) {
    try {
      item.killNow();
    } catch {
      // keep going so one failure does not leave the rest running
    }
  }
  live.clear();
}

/** What is stored in the pid file. */
export interface PidRecord {
  /** Pid of the spawned process (the process-group leader on POSIX). */
  pid: number;
  /** Pid of the Node process that started it. */
  parentPid: number;
  /** Executable name used to confirm that the pid still belongs to us. */
  executable: string;
  /** ISO time of the start. */
  startedAt: string;
}

/** Write `record` to `file` (parent directory is created). */
export async function writePidFile(file: string, record: PidRecord): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(record));
}

/** Delete the pid file; missing files are fine. */
export async function removePidFile(file: string): Promise<void> {
  await rm(file, { force: true });
}

/** Best-effort command line (or image name) of a process, to detect pid reuse. */
async function processCommandLine(pid: number): Promise<string | undefined> {
  try {
    if (process.platform === "linux") {
      return (await readFile(`/proc/${pid}/cmdline`, "utf8")).replace(/\0/g, " ");
    }
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync(
        "tasklist",
        ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
        { windowsHide: true, timeout: 5000 },
      );
      return stdout;
    }
    const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "command="], {
      timeout: 5000,
    });
    return stdout;
  } catch {
    return undefined;
  }
}

/**
 * Kill a server left behind by an earlier run of the app that died without cleaning up.
 *
 * Reads the pid file; if the recorded process is alive, its starting app is gone, and its
 * command line still mentions the recorded executable (so a reused pid is not hit), the tree is
 * killed. A server whose starting app is still alive is left alone (another app window may own it).
 * @returns True if a leftover process was killed.
 */
export async function reapStaleProcess(pidFile: string): Promise<boolean> {
  let record: PidRecord;
  try {
    record = JSON.parse(await readFile(pidFile, "utf8")) as PidRecord;
  } catch {
    return false;
  }
  await removePidFile(pidFile);
  // The owner may still be running (another app window); do not touch its server.
  if (record.parentPid !== process.pid && isProcessAlive(record.parentPid)) return false;
  if (!isProcessAlive(record.pid)) return false;
  const command = await processCommandLine(record.pid);
  if (
    command === undefined ||
    !command.toLowerCase().includes(basename(record.executable).toLowerCase())
  ) {
    return false;
  }
  killTree(record.pid, "SIGTERM");
  await new Promise((r) => setTimeout(r, 300));
  if (isProcessAlive(record.pid)) killTree(record.pid, "SIGKILL");
  return true;
}
