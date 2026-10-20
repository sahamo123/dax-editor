// Process-level tests of the `dax-mcp` executable: a real child process over stdio and over HTTP.
// They run the compiled bin, so they are skipped until `pnpm --filter @dax/mcp build` has been run.

import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMcpFromArgs } from "./main.js";
import { hasFfmpeg, makeClip, makeTempDir, removeTempDir } from "./test/media.js";

const BIN = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const built = existsSync(BIN);

let dir: string;
beforeAll(() => {
  dir = makeTempDir();
});
afterAll(() => removeTempDir(dir));

/** Environment for children: the current one, so ffmpeg is found on PATH. */
function childEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === "string"),
  );
}

describe.skipIf(!built)("dax-mcp over stdio (needs a build)", () => {
  it("lists tools, keeps stdout clean, and edits a saved project file", async () => {
    const project = join(dir, "stdio.dax.json");
    const client = new Client({ name: "stdio-test", version: "0.0.1" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [BIN, "--project", project, "--allow-root", dir],
      env: childEnv(),
    });
    await client.connect(transport);
    try {
      const tools = (await client.listTools()).tools.map((t) => t.name);
      expect(tools).toContain("get_project");
      expect(tools).toContain("export_video");
      const r = await client.callTool({ name: "save_checkpoint", arguments: { name: "hello" } });
      expect(r.isError).toBeFalsy();
      // The project file was created on start and is a valid project.
      expect(JSON.parse(readFileSync(project, "utf8")).version).toBe(1);
    } finally {
      await client.close();
    }
  }, 60_000);

  it("hides export_video with --no-export and everything but inspection with --read-only", async () => {
    const run = async (flags: string[]) => {
      const client = new Client({ name: "flags", version: "0.0.1" });
      await client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: [BIN, ...flags],
          env: childEnv(),
        }),
      );
      try {
        return (await client.listTools()).tools.map((t) => t.name);
      } finally {
        await client.close();
      }
    };
    expect(await run(["--no-export"])).not.toContain("export_video");
    const ro = await run(["--read-only", "--no-preview"]);
    expect(ro).toContain("get_project");
    expect(ro).not.toContain("split");
  }, 60_000);

  it.skipIf(!hasFfmpeg())(
    "imports media through the real process",
    async () => {
      const clip = makeClip(dir, "proc.mp4");
      const client = new Client({ name: "stdio-media", version: "0.0.1" });
      await client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: [BIN, "--allow-root", dir],
          env: childEnv(),
        }),
      );
      try {
        const r = await client.callTool({ name: "import_media", arguments: { path: clip } });
        expect(r.isError).toBeFalsy();
      } finally {
        await client.close();
      }
    },
    60_000,
  );
});

describe.skipIf(!built)("dax-mcp --http (needs a build)", () => {
  it("prints a startup line without the secret and cleans up on POSIX SIGTERM", async () => {
    const tokenFile = join(dir, "mcp-token");
    const child = spawn(process.execPath, [BIN, "--http", "--token-file", tokenFile], {
      env: childEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const exited = new Promise<number | null>((resolve) =>
      child.on("exit", (code) => resolve(code)),
    );
    let line = "";
    try {
      line = await new Promise<string>((resolve, reject) => {
        let buf = "";
        child.stdout.on("data", (c: Buffer) => {
          buf += c.toString();
          const nl = buf.indexOf("\n");
          if (nl >= 0) resolve(buf.slice(0, nl));
        });
        child.on("error", reject);
        child.on("exit", () =>
          reject(new Error("dax-mcp exited before printing its startup line")),
        );
      });
      const info = JSON.parse(line) as { url: string; tokenFile: string; token?: string };
      const token = readFileSync(tokenFile, "utf8").trim();
      expect(line).not.toContain(token); // the secret is never on stdout unless --print-token
      expect(info.token).toBeUndefined();
      expect(token.length).toBeGreaterThanOrEqual(43);
      if (process.platform !== "win32") expect(statSync(tokenFile).mode & 0o777).toBe(0o600);

      const client = new Client({ name: "http-proc", version: "0.0.1" });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(info.url), {
          requestInit: { headers: { Authorization: `Bearer ${token}` } },
        }),
      );
      expect((await client.listTools()).tools.length).toBeGreaterThan(30);
      await client.close();
    } finally {
      child.kill("SIGTERM");
    }
    // Windows kill(SIGTERM) is forced termination, so JavaScript cleanup handlers cannot run.
    expect(await exited).toBe(process.platform === "win32" ? null : 0);
    if (process.platform !== "win32") expect(existsSync(tokenFile)).toBe(false);
  }, 60_000);

  it("removes its token file on controlled shutdown on every platform", async () => {
    const tokenFile = join(dir, "controlled-token");
    const running = await startMcpFromArgs(["--http", "--token-file", tokenFile], childEnv());
    try {
      expect(existsSync(tokenFile)).toBe(true);
    } finally {
      await running.close();
    }
    await running.closed;
    expect(existsSync(tokenFile)).toBe(false);
  });

  it("exits with a usage error when HTTP has no way to deliver the token", async () => {
    const child = spawn(process.execPath, [BIN, "--http"], { env: childEnv(), stdio: "ignore" });
    const code = await new Promise<number | null>((resolve) => child.on("exit", (c) => resolve(c)));
    expect(code).toBe(2);
  });
});
