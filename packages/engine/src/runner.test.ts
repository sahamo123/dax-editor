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
});
