// Provider diagnostics use mocked HTTP only; no remote API or editor command is executed.
import type { Settings } from "@dax/protocol";
import type { RunnerEnv } from "@dax/server";
import { describe, expect, it, vi } from "vitest";
import { discoverModels, testProvider } from "./provider-diagnostics.js";

const settings: Settings = {
  activeProvider: "openai",
  providers: { openai: { model: "test-model", baseUrl: "https://untrusted.invalid/v1" } },
};
const env: RunnerEnv = {
  settings,
  getApiKey: async (kind) => (kind === "openai" ? "test-openai-key" : undefined),
};
const success = () =>
  new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            tool_calls: [
              { function: { name: "connection_probe", arguments: '{"value":"dax-probe"}' } },
            ],
          },
        },
      ],
    }),
    { status: 200 },
  );

describe("explicit provider diagnostics", () => {
  it("uses fixed OpenAI endpoint and separate credentials with a synthetic tool only", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, request) => {
      const body = JSON.parse(String(request?.body));
      expect(body.tools).toHaveLength(1);
      expect(body.tools[0].function.name).toBe("connection_probe");
      expect(body.messages).toHaveLength(1);
      expect(request?.redirect).toBe("error");
      expect(request?.headers).toMatchObject({ Authorization: "Bearer test-openai-key" });
      return success();
    });
    expect(await testProvider(env, "openai", { fetch })).toMatchObject({
      status: "connected",
      toolsSupported: true,
    });
    expect(fetch.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/chat/completions");
  });
  it("does not call a missing-key provider or leak provider error response bodies", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response("sensitive provider body", { status: 401 }),
    );
    const missing = await testProvider({ ...env, getApiKey: async () => undefined }, "openai", {
      fetch,
    });
    expect(missing.status).toBe("error");
    expect(fetch).not.toHaveBeenCalled();
    const rejected = await testProvider(env, "openai", { fetch });
    expect(rejected.detail).toContain("Authentication failed");
    expect(rejected.detail).not.toContain("sensitive");
  });
  it("a plain text answer is not accepted as tool support", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify({ choices: [{ message: { content: "hello" } }] })),
    );
    expect(await testProvider(env, "openai", { fetch })).toMatchObject({
      status: "error",
      toolsSupported: false,
      detail: expect.stringContaining("valid tool call"),
    });
  });
  it("refuses cleartext remote credentials and discovers model IDs without changing selection", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ id: "model-b" }, { id: "model-a" }, { id: "model-b" }, { nope: 1 }],
          }),
        ),
    );
    const bad: RunnerEnv = {
      settings: {
        activeProvider: "openai-compatible",
        providers: { "openai-compatible": { model: "test", baseUrl: "http://remote.invalid/v1" } },
      },
      getApiKey: async () => "test-key",
    };
    expect((await testProvider(bad, "openai-compatible", { fetch })).status).toBe("error");
    expect(fetch).not.toHaveBeenCalled();
    expect(await discoverModels(env, "openai", { fetch })).toEqual(["model-a", "model-b"]);
    expect(env.settings.providers.openai?.model).toBe("test-model");
  });
});
