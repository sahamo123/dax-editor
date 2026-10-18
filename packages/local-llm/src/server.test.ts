import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ServerError } from "./errors.js";
import {
  getFreePort,
  isProcessAlive,
  killAllRegistered,
  reapStaleProcess,
  registerForExitCleanup,
  withParentWatchdog,
} from "./process-guard.js";
import {
  type CrashInfo,
  LlamaServer,
  type LlamaServerOptions,
  type ServerState,
} from "./server.js";

const fake = join(import.meta.dirname, "test-helpers", "fake-llama-server.mjs");
const posix = process.platform !== "win32";

let dir: string;
const running: LlamaServer[] = [];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "dax-srv-"));
});
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.stop(500)));
  rmSync(dir, { recursive: true, force: true });
});

function make(options: Partial<LlamaServerOptions> = {}, env: Record<string, string> = {}) {
  const server = new LlamaServer({
    binaryPath: fake,
    modelPath: join(dir, "model.gguf"),
    launcher: { command: process.execPath, args: [fake] },
    healthPollMs: 25,
    env: { FAKE_LOAD_MS: "150", ...env },
    ...options,
  });
  running.push(server);
  return server;
}

async function waitDead(pid: number, timeoutMs = 8000): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (!isProcessAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return !isProcessAlive(pid);
}

describe("LlamaServer", () => {
  it("starts, waits for health, exposes an OpenAI-compatible baseUrl and answers", async () => {
    const server = make();
    const states: ServerState[] = [];
    server.on("state", (s) => states.push(s));
    await server.start();
    expect(server.state).toBe("running");
    expect(server.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/);
    expect(server.loadTimeMs).toBeGreaterThanOrEqual(100);
    expect(states).toEqual(["starting", "running"]);

    const response = await fetch(`${server.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${server.apiKey}` },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hi" }],
        tools: [{ type: "function", function: { name: "remove_silences", parameters: {} } }],
      }),
    });
    const json = (await response.json()) as {
      choices: { message: { tool_calls: { function: { name: string } }[] } }[];
    };
    expect(json.choices[0]?.message.tool_calls[0]?.function.name).toBe("remove_silences");
  });

  it("passes the expected flags: loopback host, free port, jinja, context, api key, no web UI", async () => {
    const server = make({ contextSize: 4096, threads: 3, gpuLayers: 7, reasoning: "off" });
    await server.start();
    const line = server.logs().find((l) => l.startsWith("fake-llama-server args:")) as string;
    const args = JSON.parse(line.slice("fake-llama-server args:".length)) as string[];
    const at = (flag: string) => args[args.indexOf(flag) + 1];
    expect(at("--host")).toBe("127.0.0.1");
    expect(Number(at("--port"))).toBe(server.port);
    expect(at("-c")).toBe("4096");
    expect(at("-t")).toBe("3");
    expect(at("-ngl")).toBe("7");
    expect(at("--reasoning")).toBe("off");
    expect(at("-np")).toBe("1");
    expect(args).toContain("--jinja");
    expect(args).toContain("--no-webui");
    expect(at("--api-key")).toBe(server.apiKey);
    expect(server.apiKey).toMatch(/^[0-9a-f]{48}$/);
  });

  it("requires the generated API key on /v1 but not on /health", async () => {
    const server = make();
    await server.start();
    const origin = server.baseUrl?.replace("/v1", "");
    expect((await fetch(`${origin}/health`)).status).toBe(200);
    const body = JSON.stringify({ messages: [] });
    const headers = { "content-type": "application/json" };
    expect(
      (await fetch(`${server.baseUrl}/chat/completions`, { method: "POST", body, headers })).status,
    ).toBe(401);
  });

  it("can disable authentication", async () => {
    const server = make({ apiKey: false });
    await server.start();
    expect(server.apiKey).toBeUndefined();
    const r = await fetch(`${server.baseUrl}/chat/completions`, {
      method: "POST",
      body: JSON.stringify({ messages: [] }),
      headers: { "content-type": "application/json" },
    });
    expect(r.status).toBe(200);
  });

  it("stops cleanly and the process is gone", async () => {
    const server = make();
    await server.start();
    const pid = server.serverPid as number;
    await server.stop();
    expect(server.state).toBe("stopped");
    expect(await waitDead(pid)).toBe(true);
    await server.stop(); // idempotent
  });

  it.skipIf(!posix)("escalates to SIGKILL when the process ignores SIGTERM", async () => {
    const server = make({ watchdog: false }, { FAKE_IGNORE_SIGTERM: "1" });
    await server.start();
    const pid = server.serverPid as number;
    const started = Date.now();
    await server.stop(400);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(await waitDead(pid)).toBe(true);
  });

  it.skipIf(!posix)("kills the whole process tree, including grandchildren", async () => {
    const server = make({}, { FAKE_SPAWN_GRANDCHILD: "1" });
    await server.start();
    const grandchild = Number(
      server
        .logs()
        .find((l) => l.startsWith("grandchild-pid="))
        ?.split("=")[1],
    );
    expect(isProcessAlive(grandchild)).toBe(true);
    await server.stop();
    expect(await waitDead(grandchild)).toBe(true);
  });

  it("detects a crash after start and reports exit code and the last log lines", async () => {
    const server = make({}, { FAKE_EXIT_AFTER_MS: "700", FAKE_EXIT_CODE: "139" });
    const crash = new Promise<CrashInfo>((resolve) => server.on("crash", resolve));
    await server.start();
    const info = await crash;
    expect(info.code).toBe(139);
    expect(info.logTail.join("\n")).toContain("simulated crash");
    expect(server.state).toBe("crashed");
    await server.stop(); // acknowledging a crash moves to stopped
    expect(server.state).toBe("stopped");
  });

  it("does not report a deliberate stop as a crash", async () => {
    const server = make();
    let crashed = false;
    server.on("crash", () => {
      crashed = true;
    });
    await server.start();
    await server.stop();
    expect(crashed).toBe(false);
  });

  it("fails with the log tail when the process exits during start-up", async () => {
    const server = make({}, { FAKE_FAIL_STARTUP: "1" });
    const error = await server.start().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServerError);
    expect((error as ServerError).logTail.join("\n")).toContain("failed to load model");
    expect((error as ServerError).message).toContain("exited during start-up");
    expect(server.state).toBe("stopped");
  });

  it("fails when the executable does not exist", async () => {
    const server = make({
      launcher: { command: join(dir, "no-such-binary"), args: [] },
      watchdog: false,
    });
    await expect(server.start()).rejects.toBeInstanceOf(ServerError);
    expect(server.state).toBe("stopped");
  });

  it("times out when the model never becomes ready and kills the process", async () => {
    const server = make({ healthTimeoutMs: 400 }, { FAKE_LOAD_MS: "60000" });
    const error = await server.start().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServerError);
    expect((error as Error).message).toContain("not healthy");
    const pid = server.serverPid;
    expect(server.state).toBe("stopped");
    if (pid !== undefined) expect(await waitDead(pid)).toBe(true);
  });

  it("can be cancelled while loading", async () => {
    const server = make({}, { FAKE_LOAD_MS: "60000" });
    const controller = new AbortController();
    const started = server.start(controller.signal);
    setTimeout(() => controller.abort(), 200);
    await expect(started).rejects.toThrow(/cancelled/);
    expect(server.state).toBe("stopped");
  });

  it("retries with a new port when the first port was taken", async () => {
    const server = make({}, { FAKE_PORT_IN_USE_ONCE_FILE: join(dir, "marker") });
    await server.start();
    expect(server.state).toBe("running");
  });

  it("keeps a bounded log ring buffer", async () => {
    const server = make({ logLines: 3 });
    await server.start();
    expect(server.logs().length).toBeLessThanOrEqual(3);
    expect(server.logs(1)).toHaveLength(1);
  });

  it("emits log lines as they arrive", async () => {
    const server = make();
    const lines: string[] = [];
    server.on("log", (l) => lines.push(l));
    await server.start();
    expect(lines.some((l) => l.startsWith("listening on"))).toBe(true);
  });

  it("refuses to start twice", async () => {
    const server = make();
    await server.start();
    await expect(server.start()).rejects.toThrow(/running/);
  });

  it.skipIf(process.platform === "win32")(
    "reports resident memory of the server process",
    async () => {
      const server = make();
      await server.start();
      const bytes = await server.memoryBytes();
      expect(bytes).toBeGreaterThan(5_000_000);
    },
  );
});

describe("getFreePort", () => {
  it("returns distinct usable ports", async () => {
    const [a, b] = await Promise.all([getFreePort(), getFreePort()]);
    expect(a).toBeGreaterThan(1023);
    expect(b).toBeGreaterThan(1023);
  });
});

describe("exit cleanup registry", () => {
  it("kills registered processes when asked and can be unregistered", () => {
    const calls: string[] = [];
    const unregisterA = registerForExitCleanup({ killNow: () => calls.push("a") });
    registerForExitCleanup({ killNow: () => calls.push("b") });
    registerForExitCleanup({
      killNow: () => {
        throw new Error("boom");
      },
    });
    unregisterA();
    killAllRegistered();
    expect(calls).toEqual(["b"]);
    killAllRegistered(); // second call is a no-op
    expect(calls).toEqual(["b"]);
  });
});

describe("orphan protection", () => {
  const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
  const pkgDir = join(import.meta.dirname, "..");
  const outDir = join(pkgDir, ".test-dist");

  it.skipIf(!posix)(
    "kills the server and its children within seconds when the parent is SIGKILLed",
    async () => {
      // The parent must be a separate Node process running the real compiled code.
      execFileSync(
        process.execPath,
        [tsc, "-p", join(pkgDir, "tsconfig.json"), "--outDir", outDir],
        {
          stdio: "pipe",
        },
      );
      const parent = spawn(
        process.execPath,
        [
          join(import.meta.dirname, "test-helpers", "orphan-parent.mjs"),
          join(outDir, "index.js"),
          fake,
        ],
        { stdio: ["ignore", "pipe", "inherit"] },
      );
      const info = await new Promise<{ pid: number; serverPid: number; grandchildPid: number }>(
        (resolve, reject) => {
          let out = "";
          parent.stdout.on("data", (d: Buffer) => {
            out += d.toString();
            if (out.includes("\n")) resolve(JSON.parse(out.trim()));
          });
          parent.once("exit", () => reject(new Error(`parent exited early: ${out}`)));
        },
      );
      expect(isProcessAlive(info.serverPid)).toBe(true);
      expect(isProcessAlive(info.grandchildPid)).toBe(true);

      parent.kill("SIGKILL"); // no chance to run any cleanup code
      expect(await waitDead(info.serverPid, 10_000)).toBe(true);
      expect(await waitDead(info.pid, 10_000)).toBe(true);
      expect(await waitDead(info.grandchildPid, 10_000)).toBe(true);
    },
    60_000,
  );

  it.skipIf(!posix)("withParentWatchdog builds a safe argv (no shell string concatenation)", () => {
    const w = withParentWatchdog(42, "/bin/echo", ["a b", "$(rm -rf /)", ";"]);
    expect(w.command).toBe("/bin/sh");
    expect(w.args.slice(-5)).toEqual(["42", "/bin/echo", "a b", "$(rm -rf /)", ";"]);
  });

  it("reaps a server left behind by a dead app on the next start", async () => {
    // A long-running stand-in for an orphaned llama-server whose "app" no longer exists.
    const leftover = spawn(process.execPath, [fake, "--port", String(await getFreePort())], {
      detached: posix,
      stdio: "ignore",
      env: { ...process.env, FAKE_LOAD_MS: "10" },
    });
    leftover.unref();
    const deadParent = spawn(process.execPath, ["-e", "0"]);
    await new Promise((r) => deadParent.once("exit", r));
    const pidFile = join(dir, "run", "llama-server.pid.json");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(dir, "run"));
    writeFileSync(
      pidFile,
      JSON.stringify({
        pid: leftover.pid,
        parentPid: deadParent.pid,
        executable: "fake-llama-server.mjs",
        startedAt: new Date().toISOString(),
      }),
    );
    expect(isProcessAlive(leftover.pid as number)).toBe(true);
    expect(await reapStaleProcess(pidFile)).toBe(true);
    expect(await waitDead(leftover.pid as number)).toBe(true);
  });

  it("does not reap a process whose command line does not match (pid reuse) or whose app is alive", async () => {
    const bystander = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
    });
    try {
      const pidFile = join(dir, "pid.json");
      const record = {
        pid: bystander.pid,
        parentPid: 2 ** 22 - 3, // surely not alive
        executable: "llama-server",
        startedAt: "now",
      };
      writeFileSync(pidFile, JSON.stringify(record));
      expect(await reapStaleProcess(pidFile)).toBe(false); // wrong command line
      expect(isProcessAlive(bystander.pid as number)).toBe(true);

      writeFileSync(
        pidFile,
        JSON.stringify({ ...record, parentPid: process.ppid, executable: "node" }),
      );
      expect(await reapStaleProcess(pidFile)).toBe(false); // owner still alive
      expect(isProcessAlive(bystander.pid as number)).toBe(true);
    } finally {
      bystander.kill("SIGKILL");
    }
  });

  it("ignores a missing or corrupt pid file", async () => {
    expect(await reapStaleProcess(join(dir, "none.json"))).toBe(false);
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{not json");
    expect(await reapStaleProcess(bad)).toBe(false);
  });
});
