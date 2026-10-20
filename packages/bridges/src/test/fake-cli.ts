// Test helpers: write a fake `claude` executable (a tiny node script, see test/fixtures/fake-claude.mjs), make private
// temp folders, and read back what the fake was asked to do. Nothing here touches the network or a real CLI.

import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Folder with the recorded stream-json fixtures and the fake CLI script. */
export const FIXTURE_DIR = fileURLToPath(new URL("../../test/fixtures/", import.meta.url));

/** What the fake CLI should do. Every field is optional; the defaults describe a healthy, signed-in Claude Code. */
export interface FakeScenario {
  /** Output of `--version`. */
  version?: string;
  /** Lines listed by `--help`; replaces the default full set. */
  helpFlags?: string[];
  /** `claude auth status` answer. */
  auth?: { exit?: number; stdout?: unknown };
  /** Delay before `auth status` answers, in ms. */
  authDelayMs?: number;
  /** Steps a print-mode run performs, in order (see fake-claude.mjs). */
  run?: Record<string, unknown>[];
  /** Exit code at the end of a run. Default 0. */
  exitCode?: number;
  /** Exit with this code before printing the init line. */
  exitBeforeInit?: number;
  /** Do not connect to the MCP endpoint. */
  connect?: boolean;
  /** Report this status for our MCP server regardless of whether the connection worked. */
  forceMcpStatus?: string;
  /** Value of `apiKeySource` in the init line. */
  apiKeySource?: string;
  /** Fail any run that passes `--resume`, like a CLI that lost the saved conversation. */
  resumeFails?: boolean;
  /** Ignore SIGTERM, so only SIGKILL stops the process. */
  ignoreSigterm?: boolean;
  /** File the fake writes when it receives SIGTERM, before exiting with 143. */
  sigtermMarker?: string;
  /** Output of `login status` (the Codex CLI check) and its exit code. */
  loginText?: string;
  loginExit?: number;
  /** Names of environment variables whose values are written to the calls file (never include secrets you do not own). */
  recordEnv?: string[];
}

/** One line of the calls file: what the fake saw when it was invoked. */
export interface FakeCall {
  mode: "version" | "help" | "auth" | "login" | "run" | "tools";
  /** For `tools`: the tool names the MCP endpoint offered the fake. */
  tools?: string[];
  args?: string[];
  prompt?: string;
  cwd?: string;
  envKeys: string[];
  env?: Record<string, string>;
  token?: string;
  pid?: number;
  configText?: string;
  systemPrompt?: string;
}

/** A fake CLI on disk. */
export interface FakeCli {
  /** Absolute path of the executable. */
  path: string;
  /** Folder that holds it, suitable as a `PATH` entry. */
  dir: string;
  /** Everything the fake has been asked so far, oldest first. */
  calls(): FakeCall[];
  /** Process ids of helper processes the fake started in its process group. */
  grandchildPids(): number[];
}

/** Create a unique folder under the OS temp dir. Remove it with {@link removeTempDir}, never by deleting the parent. */
export function makeTempDir(prefix = "dax-bridges-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Remove exactly the folder {@link makeTempDir} returned. */
export function removeTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/**
 * Write an executable named `name` into `dir` that behaves according to `scenario`.
 * The launcher is a node script with a shebang, so it also works when found through `PATH`.
 */
export function writeFakeCli(dir: string, scenario: FakeScenario = {}, name = "claude"): FakeCli {
  const callsFile = join(dir, `${name}.calls.jsonl`);
  const grandchildPidFile = join(dir, `${name}.grandchildren`);
  const full = { ...scenario, callsFile, grandchildPidFile, fixtureDir: FIXTURE_DIR };
  const script = pathToFileURL(join(FIXTURE_DIR, "fake-claude.mjs")).href;
  const path = join(dir, name);
  writeFileSync(
    path,
    `#!${process.execPath}\nglobalThis.__FAKE_SCENARIO__ = ${JSON.stringify(full)};\nimport(${JSON.stringify(script)});\n`,
  );
  chmodSync(path, 0o755);
  return {
    path,
    dir,
    calls: () =>
      existsSync(callsFile)
        ? readFileSync(callsFile, "utf8")
            .trim()
            .split("\n")
            .filter((l) => l !== "")
            .map((l) => JSON.parse(l) as FakeCall)
        : [],
    grandchildPids: () =>
      existsSync(grandchildPidFile)
        ? readFileSync(grandchildPidFile, "utf8")
            .trim()
            .split("\n")
            .filter((l) => l !== "")
            .map(Number)
        : [],
  };
}

/** True while a process with this id exists. */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Poll until `check` is true or `timeoutMs` passes. Returns whether it became true. */
export async function waitFor(check: () => boolean, timeoutMs = 5000): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return check();
}
