// Tests that the launcher wires the CLI bridges and the embedded local model into the server, and closes them with it.

import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CliBridges } from "@dax/bridges";
import { API, type LocalModelStatus, type ProviderStatus } from "@dax/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { launch } from "./launch.js";
import type { EmbeddedModelController } from "./local-model.js";

let dataDir: string | undefined;
let running: { close(): Promise<void> } | undefined;
let mock: Server | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
  mock?.close();
  mock = undefined;
  // Remove exactly the folder this file created.
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  dataDir = undefined;
});

/** An OpenAI-compatible model double that records the `Authorization` header of each request, then answers "Done.". */
async function mockModel(): Promise<{ url: string; authorizations: (string | undefined)[] }> {
  const authorizations: (string | undefined)[] = [];
  const server = createServer((req, res) => {
    authorizations.push(req.headers.authorization);
    req.resume();
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "Done." }, finish_reason: "stop" }],
        }),
      );
    });
  });
  mock = server;
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, authorizations };
}

/** A bridge double that reports one fixed status and counts how often it was closed. */
function fakeBridges(status: ProviderStatus): CliBridges & { closed: number } {
  const bridges = {
    closed: 0,
    async extraProviders() {
      return undefined;
    },
    async statuses() {
      return [status];
    },
    async close() {
      bridges.closed += 1;
    },
  };
  return bridges;
}

/** Fetch the provider list from a started engine, with its token. */
async function providers(info: { url: string; token: string }): Promise<ProviderStatus[]> {
  const res = await fetch(`${info.url}${API.providers}`, {
    headers: { Authorization: `Bearer ${info.token}` },
  });
  return (await res.json()) as ProviderStatus[];
}

/** Run a registry command on a started engine and return its reply, the way the desktop app does. */
async function runCommand(
  info: { url: string; token: string },
  name: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${info.url}${API.command}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${info.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, args }),
  });
  return (await res.json()) as { ok: boolean; error?: string };
}

/** Headers for a JSON call to a started engine, with its token. */
function authed(info: { token: string }): Record<string, string> {
  return { Authorization: `Bearer ${info.token}`, "Content-Type": "application/json" };
}

describe("launch and the CLI bridges", () => {
  it("shows the injected bridge's status for cli-claude and closes the bridge with the server", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "dax-launch-"));
    const bridges = fakeBridges({
      kind: "cli-claude",
      available: true,
      detail: "Ready. Claude Code 2.1.302 will use your Claude subscription.",
      signedIn: true,
    });
    const server = await launch({ dataDir, port: 0, cliBridges: bridges });
    running = server;
    const claude = (await providers(server.info)).find((p) => p.kind === "cli-claude");
    expect(claude).toMatchObject({ available: true, signedIn: true });
    expect(bridges.closed).toBe(0);

    await server.close();
    running = undefined;
    expect(bridges.closed).toBe(1);
  });

  it("reports the cli providers as not installed in this build when bridges are turned off", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "dax-launch-"));
    const server = await launch({
      dataDir,
      port: 0,
      cliBridges: false,
      localModelController: false,
    });
    running = server;
    const claude = (await providers(server.info)).find((p) => p.kind === "cli-claude");
    expect(claude).toMatchObject({
      available: false,
      detail: "Sign-in bridge not installed in this build",
    });
  });
});

describe("launch and speech-to-text", () => {
  it("hands the default speech engine to the server, so transcribe gets past the 'not set up' check", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "dax-launch-"));
    const server = await launch({
      dataDir,
      port: 0,
      cliBridges: false,
      localModelController: false,
    });
    running = server;
    // With no such asset the command stops at the asset lookup, which is only reached when a transcriber is wired in.
    const reply = await runCommand(server.info, "transcribe", { assetId: "no-such-asset" });
    expect(reply.ok).toBe(false);
    expect(reply.error).not.toContain("not set up");
  });

  it("has no speech-to-text when it is turned off", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "dax-launch-"));
    const server = await launch({
      dataDir,
      port: 0,
      cliBridges: false,
      localModelController: false,
      transcriber: false,
    });
    running = server;
    const reply = await runCommand(server.info, "transcribe", { assetId: "no-such-asset" });
    expect(reply).toMatchObject({ ok: false, error: expect.stringContaining("not set up") });
  });
});

describe("launch and the embedded local model", () => {
  it("starts with the default model controller and reports nothing installed, without downloading", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "dax-launch-"));
    // Defaults everywhere: the real manager reads the empty data folder and never touches the network.
    const server = await launch({ dataDir, port: 0, cliBridges: false });
    running = server;
    const res = await fetch(`${server.info.url}${API.localModel}`, {
      headers: { Authorization: `Bearer ${server.info.token}` },
    });
    const status = (await res.json()) as LocalModelStatus;
    expect(status).toMatchObject({ installed: false, running: false });
    expect(status.detail).toMatch(/^Not downloaded/);
    const local = (await providers(server.info)).find((p) => p.kind === "local");
    expect(local).toMatchObject({ available: false });
  });

  it("sends the local provider's chat to the injected model's endpoint, with its key", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "dax-launch-"));
    const model = await mockModel();
    const controller: EmbeddedModelController = {
      async status() {
        return {
          installed: true,
          running: true,
          detail: "Running",
          baseUrl: model.url,
          modelId: "gemma-4-e2b-qat-q4_0",
        };
      },
      async install() {},
      async start() {},
      async stop() {},
      async connection() {
        return { baseUrl: model.url, apiKey: "engine-test-key", modelId: "gemma-4-e2b-qat-q4_0" };
      },
    };
    const server = await launch({
      dataDir,
      port: 0,
      cliBridges: false,
      localModelController: controller,
    });
    running = server;
    const put = await fetch(`${server.info.url}${API.settings}`, {
      method: "PUT",
      headers: authed(server.info),
      body: JSON.stringify({ activeProvider: "local", providers: {} }),
    });
    expect(put.status).toBe(200);
    const chat = await fetch(`${server.info.url}${API.chat}`, {
      method: "POST",
      headers: authed(server.info),
      body: JSON.stringify({ message: "hello" }),
    });
    expect(chat.status).toBe(202);
    // The run is asynchronous: wait until the model double has received the request.
    for (let i = 0; i < 100 && model.authorizations.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(model.authorizations[0]).toBe("Bearer engine-test-key");
  });
});
