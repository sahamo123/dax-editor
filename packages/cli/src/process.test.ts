// Process-level tests of the compiled `dax` executable: exit codes, `dax serve` with a stand-in server, and `dax mcp`.
// They run dist/cli.js, so they are skipped until `pnpm --filter @dax/cli build` has been run.

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeTempDir, removeTempDir } from "./test/harness.js";

const BIN = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const built = existsSync(BIN);

let dir: string;
beforeAll(() => {
  dir = makeTempDir();
});
afterAll(() => removeTempDir(dir));

/** The current environment as plain strings (so ffmpeg is found), plus overrides. */
function env(extra: Record<string, string> = {}): Record<string, string> {
  const base = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === "string"),
  );
  delete base.DAX_PROJECT;
  delete base.DAX_SERVER_BIN;
  return { ...base, ...extra };
}

/** Wait until `child` has printed a full line on stdout; resolves with it. */
function firstLine(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = "";
    child.stdout?.on("data", (c: Buffer) => {
      buf += c.toString();
      const nl = buf.indexOf("\n");
      if (nl >= 0) resolve(buf.slice(0, nl));
    });
    child.on("exit", () => reject(new Error(`exited before printing a line; got: ${buf}`)));
  });
}

/** True while a process with this pid exists. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!built)("the dax executable (needs a build)", () => {
  it("prints its version and uses the documented exit codes", () => {
    const run = (args: string[]) =>
      spawnSync(process.execPath, [BIN, ...args], { cwd: dir, env: env(), encoding: "utf8" });
    const version = run(["--version"]);
    expect(version.status).toBe(0);
    expect(version.stdout).toMatch(/^\d+\.\d+\.\d+/);
    expect(run(["bogus"]).status).toBe(2);
    expect(run(["project", "show", "missing.dax.json"]).status).toBe(3);
    const list = run(["commands", "--json"]);
    expect(list.status).toBe(0);
    expect(JSON.parse(list.stdout).commands.length).toBeGreaterThan(30);
  });
});

describe.skipIf(!built)("dax serve (needs a build)", () => {
  /** A stand-in for dax-server: echoes its arguments, exits 7 on request, and exits when stdin closes. */
  const fake = () => {
    const file = join(dir, "fake-server.mjs");
    writeFileSync(
      file,
      [
        "const mode = process.argv.includes('--exit7') ? 'exit7' : 'wait';",
        // Handlers first: the test signals as soon as it reads the line below, and must not beat them.
        "process.on('SIGTERM', () => process.exit(0));",
        "process.stdin.on('end', () => process.exit(0));",
        "process.stdin.resume();",
        "process.stdout.write(JSON.stringify({ pid: process.pid, args: process.argv.slice(2) }) + '\\n');",
        "if (mode === 'exit7') process.exit(7);",
        "setInterval(() => {}, 1000);",
      ].join("\n"),
    );
    return file;
  };

  it("passes arguments through and returns the server's exit code", () => {
    const r = spawnSync(process.execPath, [BIN, "serve", "--exit7", "--port", "0"], {
      cwd: dir,
      env: env({ DAX_SERVER_BIN: fake() }),
      encoding: "utf8",
    });
    expect(r.status).toBe(7);
    expect(JSON.parse(r.stdout).args).toEqual(["--exit7", "--port", "0"]);
  });

  it("forwards SIGTERM to the server and exits cleanly", async () => {
    const child = spawn(process.execPath, [BIN, "serve"], {
      cwd: dir,
      env: env({ DAX_SERVER_BIN: fake() }),
    });
    const exited = new Promise<number | null>((resolve) => child.on("exit", (c) => resolve(c)));
    await firstLine(child);
    child.kill("SIGTERM");
    expect(await exited).toBe(0);
  });

  it("leaves no orphan server when the CLI is killed (the server exits when its stdin closes)", async () => {
    const child = spawn(process.execPath, [BIN, "serve"], {
      cwd: dir,
      env: env({ DAX_SERVER_BIN: fake() }),
    });
    const { pid } = JSON.parse(await firstLine(child)) as { pid: number };
    expect(alive(pid)).toBe(true);
    child.kill("SIGKILL");
    const deadline = Date.now() + 10_000;
    while (alive(pid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    expect(alive(pid)).toBe(false);
  });

  it("explains how to fix a missing server", () => {
    const r = spawnSync(process.execPath, [BIN, "serve"], {
      cwd: dir,
      env: env({ PATH: join(dir, "no-such-bin-folder") }),
      encoding: "utf8",
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("dax-server was not found");
    const wrong = spawnSync(process.execPath, [BIN, "serve"], {
      cwd: dir,
      env: env({ DAX_SERVER_BIN: join(dir, "nope.mjs") }),
      encoding: "utf8",
    });
    expect(wrong.status).toBe(1);
    expect(wrong.stderr).toContain("DAX_SERVER_BIN");
  });
});

describe.skipIf(!built)("dax mcp (needs a build)", () => {
  it("serves the MCP tools over stdio on the project file it was given", async () => {
    const project = join(dir, "mcp.dax.json");
    const client = new Client({ name: "dax-cli-test", version: "0.0.1" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [BIN, "mcp", "--project", project, "--allow-root", dir],
        env: env(),
      }),
    );
    try {
      const names = (await client.listTools()).tools.map((t) => t.name);
      expect(names).toContain("smart_cut");
      const r = await client.callTool({ name: "save_checkpoint", arguments: { name: "via-mcp" } });
      expect(r.isError).toBeFalsy();
    } finally {
      await client.close();
    }
    // The CLI sees what MCP did: same project file, same history.
    const hist = spawnSync(process.execPath, [BIN, "run", "get_history", "-p", project, "--json"], {
      env: env(),
      encoding: "utf8",
    });
    expect(JSON.parse(hist.stdout).ok).toBe(true);
    expect(hist.stdout).toContain("via-mcp");
  }, 60_000);

  it("exits 2 on bad flags and prints the MCP help", () => {
    const bad = spawnSync(process.execPath, [BIN, "mcp", "--nope"], {
      env: env(),
      encoding: "utf8",
    });
    expect(bad.status).toBe(2);
    const help = spawnSync(process.execPath, [BIN, "mcp", "--help"], {
      env: env(),
      encoding: "utf8",
    });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("dax-mcp");
  });
});
