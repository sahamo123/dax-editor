// Tests the real `dax-server` executable as a child process: the single startup line, SIGTERM, stdin-close exit and flag errors.
// Needs `pnpm build` first (the suite is skipped if dist/cli.js does not exist, as in a fresh checkout before building).

import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ServerInfo } from "@dax/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rawRequest } from "./test/harness.js";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

interface Launched {
  child: ChildProcessWithoutNullStreams;
  info: ServerInfo;
  stdout: string[];
  stderr: () => string;
  exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

describe.skipIf(!existsSync(CLI))("dax-server executable", () => {
  let dir: string;
  const children: ChildProcessWithoutNullStreams[] = [];
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "dax-cli-test-"));
  });
  afterEach(async () => {
    for (const c of children) c.kill("SIGKILL");
    children.length = 0;
    await rm(dir, { recursive: true, force: true });
  });

  function launch(extraArgs: string[] = [], env: NodeJS.ProcessEnv = {}): Promise<Launched> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          CLI,
          "--port",
          "0",
          "--data-dir",
          join(dir, "data"),
          "--origin",
          "http://localhost:5173",
          "--allow-root",
          dir,
          ...extraArgs,
        ],
        { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] },
      );
      children.push(child);
      const stdout: string[] = [];
      let err = "";
      let buf = "";
      const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((res) =>
        child.on("exit", (code, signal) => res({ code, signal })),
      );
      child.stderr.on("data", (d: Buffer) => {
        err += d.toString();
      });
      child.stdout.on("data", (d: Buffer) => {
        buf += d.toString();
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) stdout.push(line);
        const first = stdout[0];
        if (first && !launched) {
          launched = true;
          resolve({
            child,
            info: JSON.parse(first) as ServerInfo,
            stdout,
            stderr: () => err,
            exit,
          });
        }
      });
      let launched = false;
      child.on("exit", () => {
        if (!launched) reject(new Error(`exited before the startup line: ${err}`));
      });
    });
  }

  it("prints exactly one JSON ServerInfo line and serves the API with that token", async () => {
    const l = await launch();
    expect(Object.keys(l.info).sort()).toEqual(["port", "token", "url", "version"]);
    expect(l.info.url).toBe(`http://127.0.0.1:${l.info.port}`);
    const ok = await rawRequest(l.info.port, "/api/health", {
      headers: { Authorization: `Bearer ${l.info.token}` },
    });
    expect(ok.status).toBe(200);
    expect((await rawRequest(l.info.port, "/api/health")).status).toBe(401);
    // Origin flags are honoured.
    const origin = await rawRequest(l.info.port, "/api/health", {
      headers: { Authorization: `Bearer ${l.info.token}`, Origin: "http://localhost:5173" },
    });
    expect(origin.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    // Give the process a moment to (not) print anything else.
    await new Promise((r) => setTimeout(r, 200));
    expect(l.stdout).toHaveLength(1);
    expect(l.stderr()).not.toContain(l.info.token);
    l.child.kill("SIGTERM");
    await l.exit;
  });

  it("exits cleanly (code 0) on SIGTERM and stops listening", async () => {
    const l = await launch();
    l.child.kill("SIGTERM");
    expect(await l.exit).toEqual({ code: 0, signal: null });
    await expect(rawRequest(l.info.port, "/api/health")).rejects.toThrow();
  });

  it("exits when stdin closes, so a dead parent leaves no orphan", async () => {
    const l = await launch();
    l.child.stdin.end();
    expect(await l.exit).toEqual({ code: 0, signal: null });
  });

  it("keeps running after stdin closes with --no-exit-on-stdin-close", async () => {
    const l = await launch(["--no-exit-on-stdin-close"]);
    l.child.stdin.end();
    await new Promise((r) => setTimeout(r, 400));
    expect(l.child.exitCode).toBeNull();
    l.child.kill("SIGTERM");
    await l.exit;
  });

  it("uses DAX_SERVER_TOKEN when given", async () => {
    const token = "env-supplied-token-0123456789";
    const l = await launch([], { DAX_SERVER_TOKEN: token });
    expect(l.info.token).toBe(token);
    l.child.kill("SIGTERM");
    await l.exit;
  });

  it("fails fast with a message and exit code 1 for bad flags", async () => {
    const child = spawn(process.execPath, [CLI, "--port", "99999"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    children.push(child);
    let err = "";
    child.stderr.on("data", (d: Buffer) => {
      err += d.toString();
    });
    const code = await new Promise<number | null>((res) => child.on("exit", (c) => res(c)));
    expect(code).toBe(1);
    expect(err).toContain("--port");
  });

  it("prints usage for --help", async () => {
    const child = spawn(process.execPath, [CLI, "--help"]);
    let out = "";
    child.stdout.on("data", (d: Buffer) => {
      out += d.toString();
    });
    await new Promise((res) => child.on("exit", res));
    expect(out).toContain("--allow-root");
  });
});
