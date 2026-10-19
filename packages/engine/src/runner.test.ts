import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Session } from "@dax/core";
import type { AgentEvent, Settings } from "@dax/protocol";
import type { RunnerEnv } from "@dax/server";
import { afterEach, describe, expect, it } from "vitest";
import { createProviderRegistry } from "./providers.js";
import { createRunnerFactory } from "./runner.js";

/** A tiny OpenAI-compatible server that records request bodies and always answers with plain text. */
async function mockModel(): Promise<{ url: string; bodies: string[]; server: Server }> {
  const bodies: string[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      bodies.push(body);
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "Done." }, finish_reason: "stop" }],
        }),
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, bodies, server };
}

const settings = (over: Partial<Settings> = {}): Settings => ({
  activeProvider: "openai-compatible",
  providers: {},
  ...over,
});
const env = (s: Settings, key?: string): RunnerEnv => ({ settings: s, getApiKey: async () => key });

let open: Server | undefined;
afterEach(() => {
  open?.close();
  open = undefined;
});

describe("createRunnerFactory", () => {
  it("explains what is missing instead of failing", async () => {
    const events: AgentEvent[] = [];
    const runner = await createRunnerFactory()(env(settings({ activeProvider: "anthropic" })));
    await runner.run("hi", {
      session: new Session(),
      onEvent: (e) => events.push(e),
      signal: new AbortController().signal,
      allowedRoots: [],
    });
    expect(events).toEqual([{ type: "error", message: expect.stringContaining("API key") }]);
  });

  it("runs a message through a model and keeps the conversation for the same project", async () => {
    const m = await mockModel();
    open = m.server;
    const s = settings({ providers: { "openai-compatible": { baseUrl: m.url, model: "m" } } });
    const factory = createRunnerFactory();
    const session = new Session();
    const events: AgentEvent[] = [];
    const ctx = {
      session,
      onEvent: (e: AgentEvent) => events.push(e),
      signal: new AbortController().signal,
      allowedRoots: [],
    };
    await (await factory(env(s))).run("first message", ctx);
    await (await factory(env(s))).run("second message", ctx);
    expect(events.some((e) => e.type === "done")).toBe(true);
    expect(m.bodies[1]).toContain("first message");
    // A different project starts a fresh conversation.
    await (await factory(env(s))).run("third", { ...ctx, session: new Session() });
    expect(m.bodies[2]).not.toContain("first message");
  });
});

describe("createRunnerFactory conversation history", () => {
  it("lets only the newest run store the conversation, so a late old run cannot overwrite it", async () => {
    // A model that answers the message containing "SLOW" only after a delay, like a provider that ignores cancel.
    const bodies: string[] = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => {
        body += c;
      });
      req.on("end", () => {
        bodies.push(body);
        setTimeout(
          () => {
            res.setHeader("content-type", "application/json");
            res.end(
              JSON.stringify({
                choices: [
                  { message: { role: "assistant", content: "Done." }, finish_reason: "stop" },
                ],
              }),
            );
          },
          body.includes("SLOW") ? 400 : 0,
        );
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    open = server;
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
    const runner = await createRunnerFactory()(
      env(settings({ providers: { "openai-compatible": { baseUrl: url, model: "m" } } })),
    );
    const session = new Session();
    const quiet = (message: string) =>
      runner.run(message, {
        session,
        onEvent: () => undefined,
        signal: new AbortController().signal,
        allowedRoots: [],
      });

    const slow = quiet("SLOW first request");
    await quiet("fast second request");
    await slow;
    await quiet("third request");

    // Before the fix the slow run finished last and replaced the conversation, so "third" did not see "second".
    const last = bodies.at(-1) ?? "";
    expect(last).toContain("fast second request");
    expect(last).not.toContain("SLOW first request");
  });
});

describe("createRunnerFactory context size", () => {
  it("offers a small model only the everyday tools, and the full list to a large one", async () => {
    const m = await mockModel();
    open = m.server;
    const session = new Session();
    const ctx = {
      session,
      onEvent: () => undefined,
      signal: new AbortController().signal,
      allowedRoots: [],
    };
    const small = settings({
      providers: { "openai-compatible": { baseUrl: m.url, model: "m", contextTokens: 8192 } },
    });
    await (await createRunnerFactory()(env(small))).run("first", ctx);
    const large = settings({
      providers: { "openai-compatible": { baseUrl: m.url, model: "m", contextTokens: 131072 } },
    });
    await (await createRunnerFactory()(env(large))).run("second", {
      ...ctx,
      session: new Session(),
    });
    const toolNames = (body: string) =>
      (JSON.parse(body) as { tools?: Array<{ function: { name: string } }> }).tools?.map(
        (t) => t.function.name,
      ) ?? [];
    const smallTools = toolNames(m.bodies[0] ?? "");
    const largeTools = toolNames(m.bodies[1] ?? "");
    expect(smallTools).toEqual(expect.arrayContaining(["get_project", "split"]));
    expect(smallTools.length).toBeLessThan(largeTools.length);
    expect(largeTools).toContain("get_history");
  });
});

describe("createProviderRegistry", () => {
  it("lists every provider with a hint for what is missing", async () => {
    const list = await createProviderRegistry().list(env(settings()));
    expect(list.map((p) => p.kind)).toContain("local");
    expect(list.every((p) => p.available === false)).toBe(true);
    const withKey = await createProviderRegistry({ localReady: async () => true }).list(
      env(settings(), "k"),
    );
    expect(withKey.find((p) => p.kind === "anthropic")?.available).toBe(true);
    expect(withKey.find((p) => p.kind === "local")?.available).toBe(true);
  });

  it("does not claim the user is signed out of a CLI it cannot drive", async () => {
    const list = await createProviderRegistry().list(env(settings()));
    for (const p of list.filter((x) => x.kind.startsWith("cli-"))) {
      // `signedIn: false` would make the UI say "run <tool> once to sign in"; absent means "not installed".
      expect(p).not.toHaveProperty("signedIn");
    }
  });

  it("reports the real state of the cli-* providers when a bridge supplies it", async () => {
    const statuses = [
      { kind: "cli-claude" as const, available: true, detail: "Ready.", signedIn: true },
      { kind: "cli-codex" as const, available: false, detail: "Not supported yet." },
    ];
    const list = await createProviderRegistry({ cliStatuses: async () => statuses }).list(
      env(settings()),
    );
    expect(list.find((p) => p.kind === "cli-claude")).toEqual(statuses[0]);
    expect(list.find((p) => p.kind === "cli-codex")).toEqual(statuses[1]);
    // Gemini is not in the bridge's answer, so it falls back to the generic message.
    expect(list.find((p) => p.kind === "cli-gemini")?.detail).toMatch(
      /not installed in this build/,
    );
  });

  it("says it could not check the cli-* providers when the bridge fails, and never throws", async () => {
    const list = await createProviderRegistry({
      cliStatuses: async () => {
        throw new Error("boom");
      },
    }).list(env(settings()));
    const claude = list.find((p) => p.kind === "cli-claude");
    expect(claude).toMatchObject({ available: false, detail: "Could not check this provider" });
  });
});
