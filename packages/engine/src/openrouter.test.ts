// Provider selection isolates keys and preserves routing settings without external requests.
import { emptyProject, Session } from "@dax/core";
import type { AgentEvent, Settings } from "@dax/protocol";
import { afterEach, expect, it, vi } from "vitest";
import { createProviderRegistry } from "./providers.js";
import { createRunnerFactory } from "./runner.js";

afterEach(() => vi.unstubAllGlobals());

it("uses the fixed OpenRouter endpoint, its own key, model and tool-compatible routing", async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "Ready." }, finish_reason: "stop" }] }),
      { headers: { "content-type": "application/json" } },
    );
  });
  const settings: Settings = {
    activeProvider: "openrouter",
    providers: {
      openrouter: {
        baseUrl: "https://untrusted.example/v1",
        model: "vendor/chosen-model",
        contextTokens: 8192,
        maxTokens: 123,
        temperature: 0,
      },
    },
  };
  const keys: string[] = [];
  const runner = await createRunnerFactory()({
    settings,
    getApiKey: async (kind) => {
      keys.push(kind);
      return "test-router-key";
    },
  });
  const events: AgentEvent[] = [];
  await runner.run("Hello", {
    session: new Session(emptyProject("Provider test")),
    signal: new AbortController().signal,
    allowedRoots: [],
    onEvent: (e) => events.push(e),
  });
  expect(keys).toEqual(["openrouter"]);
  expect(requests).toHaveLength(1);
  expect(requests[0]?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
  expect(requests[0]?.init.headers).toMatchObject({ authorization: "Bearer test-router-key" });
  const body = JSON.parse(String(requests[0]?.init.body));
  expect(body).toMatchObject({
    model: "vendor/chosen-model",
    max_tokens: 123,
    temperature: 0,
    provider: { require_parameters: true },
  });
  expect(body.tools.length).toBeGreaterThan(0);
  expect(JSON.stringify(events)).not.toContain("test-router-key");
});

it("requires both a key and model before calling OpenRouter", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  for (const model of [undefined, "vendor/model"]) {
    for (const key of [undefined, "test-key"]) {
      const settings: Settings = {
        activeProvider: "openrouter",
        providers: { openrouter: { ...(model ? { model } : {}) } },
      };
      const env = { settings, getApiKey: async () => key };
      const status = (await createProviderRegistry().list(env)).find(
        (p) => p.kind === "openrouter",
      );
      expect(status?.available).toBe(Boolean(model && key));
      if (model && key) continue;
      const events: AgentEvent[] = [];
      const runner = await createRunnerFactory()(env);
      await runner.run("Hello", {
        session: new Session(emptyProject("Missing configuration")),
        signal: new AbortController().signal,
        allowedRoots: [],
        onEvent: (e) => events.push(e),
      });
      expect(events[0]?.type).toBe("error");
    }
  }
  expect(fetcher).not.toHaveBeenCalled();
});
