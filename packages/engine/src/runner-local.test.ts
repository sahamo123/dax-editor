// Tests that the `local` provider talks to the running built-in model: its address, its key, its model name and its window.

import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { emptyProject, Session } from "@dax/core";
import type { AgentEvent, Settings } from "@dax/protocol";
import type { RunnerEnv } from "@dax/server";
import { afterEach, describe, expect, it } from "vitest";
import type { LocalConnection } from "./local-model.js";
import { createRunnerFactory, localProviderSettings } from "./runner.js";

let open: Server | undefined;
afterEach(() => {
  open?.close();
  open = undefined;
});

/** An OpenAI-compatible server that records each request's headers and body, then answers with plain text. */
async function mockModel(): Promise<{
  url: string;
  requests: { headers: IncomingHttpHeaders; body: string }[];
}> {
  const requests: { headers: IncomingHttpHeaders; body: string }[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      requests.push({ headers: req.headers, body });
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "Done." }, finish_reason: "stop" }],
        }),
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  open = server;
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, requests };
}

/** Settings that select the built-in model and leave its own Settings entry empty. */
const localSettings = (): Settings => ({ activeProvider: "local", providers: {} });
const env = (s: Settings): RunnerEnv => ({ settings: s, getApiKey: async () => undefined });

describe("localProviderSettings", () => {
  const connection: LocalConnection = {
    baseUrl: "http://127.0.0.1:5000/v1",
    apiKey: "key-from-the-engine",
    modelId: "gemma-4-e2b-qat-q4_0",
    contextTokens: 16_384,
  };

  it("uses the running model's address, key, name and window when Settings says nothing", () => {
    expect(localProviderSettings({}, connection)).toEqual({
      baseUrl: "http://127.0.0.1:5000/v1",
      apiKey: "key-from-the-engine",
      model: "gemma-4-e2b-qat-q4_0",
      contextTokens: 16_384,
    });
  });

  it("lets Settings override the model name and the window", () => {
    expect(
      localProviderSettings({ model: "custom", contextTokens: 4096 }, connection),
    ).toMatchObject({
      model: "custom",
      contextTokens: 4096,
    });
  });

  it("falls back to a neutral name and the built-in window when the connection knows neither", () => {
    const bare = localProviderSettings({}, { baseUrl: "http://127.0.0.1:1/v1" });
    expect(bare).toEqual({ baseUrl: "http://127.0.0.1:1/v1", model: "local", contextTokens: 8192 });
    expect(bare).not.toHaveProperty("apiKey");
  });
});

describe("createRunnerFactory with the built-in model", () => {
  it("sends the request to the running model with its bearer key and model name", async () => {
    const model = await mockModel();
    const factory = createRunnerFactory({
      localEndpoint: async () => ({
        baseUrl: model.url,
        apiKey: "local-test-key",
        modelId: "gemma-4-e2b-qat-q4_0",
        contextTokens: 16_384,
      }),
    });
    const events: AgentEvent[] = [];
    await (await factory(env(localSettings()))).run("make it brighter", {
      session: new Session(emptyProject("local")),
      onEvent: (e) => events.push(e),
      signal: new AbortController().signal,
      allowedRoots: [],
    });
    expect(events.some((e) => e.type === "done")).toBe(true);
    expect(model.requests).toHaveLength(1);
    expect(model.requests[0]?.headers.authorization).toBe("Bearer local-test-key");
    expect(model.requests[0]?.body).toContain('"model":"gemma-4-e2b-qat-q4_0"');
  });

  it("says the built-in model is not running, and sends nothing, when there is no endpoint", async () => {
    const model = await mockModel();
    const factory = createRunnerFactory({ localEndpoint: async () => undefined });
    const events: AgentEvent[] = [];
    await (await factory(env(localSettings()))).run("hello", {
      session: new Session(emptyProject("local")),
      onEvent: (e) => events.push(e),
      signal: new AbortController().signal,
      allowedRoots: [],
    });
    expect(events).toEqual([{ type: "error", message: expect.stringContaining("not running") }]);
    expect(model.requests).toHaveLength(0);
  });
});
