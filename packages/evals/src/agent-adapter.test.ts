// The agent-based adapters scored on the real eval tasks and the real engine (needs ffmpeg), with scripted
// local HTTP servers standing in for the model APIs. No network.

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ScriptedProvider } from "@dax/agent";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { makeAdapter } from "./adapters.js";
import { AgentAdapter } from "./agent-adapter.js";
import { formatSummary, summarize } from "./metrics.js";
import { runSuite, runTask } from "./runner.js";
import { type EvalTask, EvalTaskSchema } from "./task.js";

const taskDir = join(import.meta.dirname, "..", "tasks");
/** The scripted model below only knows these starter tasks. The newer tasks are solved by the oracle and checked there. */
const STARTER_IDS = ["delete-middle-2s", "keep-first-3-seconds", "remove-silences"];
const tasks: EvalTask[] = readdirSync(taskDir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => EvalTaskSchema.parse(JSON.parse(readFileSync(join(taskDir, f), "utf8"))))
  .filter((t) => STARTER_IDS.includes(t.id));

const fixtureDir = mkdtempSync(join(tmpdir(), "dax-evals-agent-"));
afterAll(() => rmSync(fixtureDir, { recursive: true, force: true }));

/** What the scripted "model" decides to do next. */
type Move = { call: { name: string; args: unknown } } | { text: string };

/**
 * A model that behaves well: look at the project, make the right edit for the request, report. `quirk`
 * lets a test make it misbehave in one place.
 */
function goodMove(
  prompt: string,
  results: number,
  quirk?: (prompt: string, results: number) => Move | undefined,
): Move {
  const odd = quirk?.(prompt, results);
  if (odd) return odd;
  if (results === 0) return { call: { name: "get_project", args: {} } };
  if (results === 1) {
    const first = /first (\d+) seconds/i.exec(prompt);
    const range = /from (\d+) seconds to (\d+) seconds/i.exec(prompt);
    if (/silent/i.test(prompt)) return { call: { name: "remove_silences", args: {} } };
    if (first) {
      return {
        call: { name: "keep_only", args: { ranges: [{ start: 0, end: Number(first[1]) }] } },
      };
    }
    if (range) {
      return {
        call: { name: "delete_range", args: { from: Number(range[1]), to: Number(range[2]) } },
      };
    }
  }
  return { text: "Done." };
}

interface Seen {
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
}

interface FakeApi {
  url: string;
  seen: Seen[];
  close(): Promise<void>;
}

type Quirk = (prompt: string, results: number) => Move | undefined;

/** A fake model API in either wire format; `usage` can be switched off or made patchy. */
async function fakeApi(
  format: "openai" | "anthropic",
  opts: {
    quirk?: Quirk;
    usage?: (n: number) => { in: number; out: number } | undefined;
    asText?: boolean;
  } = {},
): Promise<FakeApi> {
  const seen: Seen[] = [];
  const usageFor = opts.usage ?? (() => ({ in: 100, out: 10 }));
  let n = 0;
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      seen.push({ headers: req.headers, body });
      const messages = body.messages as { role: string; content: unknown }[];
      let prompt = "";
      let results = 0;
      if (format === "openai") {
        prompt = String(messages.find((m) => m.role === "user")?.content ?? "");
        results = messages.filter((m) => m.role === "tool").length;
      } else {
        const first = messages[0]?.content as { text: string }[] | undefined;
        prompt = first?.[0]?.text ?? "";
        results = messages
          .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
          .filter((b: { type?: string }) => b.type === "tool_result").length;
      }
      const move = goodMove(prompt, results, opts.quirk);
      const u = usageFor(n++);
      res.setHeader("content-type", "application/json");
      if (format === "openai") {
        const message =
          "call" in move
            ? opts.asText
              ? {
                  content: `<tool_call>${JSON.stringify({ name: move.call.name, arguments: move.call.args })}</tool_call>`,
                }
              : {
                  content: null,
                  tool_calls: [
                    {
                      id: `call_${results + 1}`,
                      type: "function",
                      function: { name: move.call.name, arguments: JSON.stringify(move.call.args) },
                    },
                  ],
                }
            : { content: move.text };
        res.end(
          JSON.stringify({
            choices: [{ message, finish_reason: "call" in move ? "tool_calls" : "stop" }],
            ...(u ? { usage: { prompt_tokens: u.in, completion_tokens: u.out } } : {}),
          }),
        );
      } else {
        res.end(
          JSON.stringify({
            content:
              "call" in move
                ? [
                    {
                      type: "tool_use",
                      id: `toolu_${results + 1}`,
                      name: move.call.name,
                      input: move.call.args,
                    },
                  ]
                : [{ type: "text", text: move.text }],
            stop_reason: "call" in move ? "tool_use" : "end_turn",
            ...(u ? { usage: { input_tokens: u.in, output_tokens: u.out } } : {}),
          }),
        );
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    seen,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

let api: FakeApi | undefined;
afterEach(async () => {
  await api?.close();
  api = undefined;
});

describe("openai adapter on the eval tasks", () => {
  it("passes all three starter tasks and records tokens and tool calls honestly", async () => {
    api = await fakeApi("openai");
    const adapter = makeAdapter({ adapter: "openai", baseUrl: `${api.url}/v1`, model: "fake-7b" });
    expect(adapter.id).toBe("openai:fake-7b");

    const records = await runSuite(adapter, tasks, { fixtureDir });
    expect(records.map((r) => [r.taskId, r.pass])).toEqual(tasks.map((t) => [t.id, true]));
    for (const r of records) {
      expect(r).toMatchObject({
        adapter: "openai:fake-7b",
        turns: 3,
        toolCalls: { total: 2, invalid: 0, failed: 0, repaired: 0, fromText: 0 },
        inputTokens: 300,
        outputTokens: 30,
      });
    }
    const [s] = summarize(records);
    expect(s).toMatchObject({
      passed: 3,
      toolCalls: 6,
      invalidToolCalls: 0,
      inputTokens: 900,
      outputTokens: 90,
    });
    expect(formatSummary([s as NonNullable<typeof s>])).toContain("900/90");

    // The task prompt reached the server unchanged, with the system prompt and compact tools.
    const first = api.seen[0];
    const msgs = first?.body.messages as { role: string; content: string }[];
    expect(msgs[1]?.content).toBe(tasks[0]?.prompt);
    expect(msgs[0]?.content).toMatch(/Call get_project first/);
    expect(first?.body).toMatchObject({ model: "fake-7b", temperature: 0 });
    expect(first?.headers.authorization).toBeUndefined();
  }, 180_000);

  it("counts a badly formed call as invalid, still lets the model recover, and passes", async () => {
    api = await fakeApi("openai", {
      quirk: (prompt, results) => {
        if (!/from \d+ seconds to/.test(prompt)) return undefined;
        if (results === 1) return { call: { name: "delete_range", args: { from: 2 } } }; // forgot `to`
        if (results === 2) return { call: { name: "delete_range", args: { from: 2, to: 4 } } }; // reads the error, fixes it
        return undefined;
      },
    });
    const adapter = makeAdapter({ adapter: "openai", baseUrl: api.url, model: "m" });
    const task = tasks.find((t) => t.id === "delete-middle-2s") as EvalTask;
    const r = await runTask(adapter, task, { fixtureDir });
    expect(r.pass).toBe(true);
    expect(r.toolCalls).toMatchObject({ total: 3, invalid: 1 });
  }, 60_000);

  it("records calls the model wrote as text", async () => {
    api = await fakeApi("openai", { asText: true });
    const adapter = makeAdapter({ adapter: "openai", baseUrl: api.url, model: "m" });
    const task = tasks.find((t) => t.id === "keep-first-3-seconds") as EvalTask;
    const r = await runTask(adapter, task, { fixtureDir });
    expect(r.pass).toBe(true);
    expect(r.toolCalls).toMatchObject({ total: 2, fromText: 2, invalid: 0 });
  }, 60_000);

  it("records no token counts when the server reports none", async () => {
    api = await fakeApi("openai", { usage: () => undefined });
    const adapter = makeAdapter({ adapter: "openai", baseUrl: api.url, model: "m" });
    const task = tasks.find((t) => t.id === "keep-first-3-seconds") as EvalTask;
    const r = await runTask(adapter, task, { fixtureDir });
    expect(r.pass).toBe(true);
    expect(r.inputTokens).toBeUndefined();
    expect(r.outputTokens).toBeUndefined();
    expect(formatSummary(summarize([r]))).toContain("n/a");
  }, 60_000);

  it("records no token counts when only some replies carried usage (an undercount would flatter the model)", async () => {
    api = await fakeApi("openai", { usage: (n) => (n === 0 ? { in: 100, out: 10 } : undefined) });
    const adapter = makeAdapter({ adapter: "openai", baseUrl: api.url, model: "m" });
    const task = tasks.find((t) => t.id === "keep-first-3-seconds") as EvalTask;
    const r = await runTask(adapter, task, { fixtureDir });
    expect(r.inputTokens).toBeUndefined();
  }, 60_000);

  it("sends the api key from the named environment variable and never puts it in the id", async () => {
    api = await fakeApi("openai");
    const adapter = makeAdapter({
      adapter: "openai",
      baseUrl: api.url,
      model: "m",
      apiKeyEnv: "MY_TEST_KEY",
      env: { MY_TEST_KEY: "sk-test-123" },
    });
    const task = tasks.find((t) => t.id === "keep-first-3-seconds") as EvalTask;
    await runTask(adapter, task, { fixtureDir });
    expect(api.seen[0]?.headers.authorization).toBe("Bearer sk-test-123");
    expect(adapter.id).not.toContain("sk-test");
  }, 60_000);

  it("fails the task with a clear error when the server is unreachable", async () => {
    const dead = await fakeApi("openai");
    const url = dead.url;
    await dead.close();
    const adapter = makeAdapter({ adapter: "openai", baseUrl: url, model: "m" });
    const task = tasks.find((t) => t.id === "keep-first-3-seconds") as EvalTask;
    const r = await runTask(adapter, task, { fixtureDir });
    expect(r.pass).toBe(false);
    expect(r.error).toMatch(/Could not reach OpenAI-compatible server/);
  }, 60_000);

  it("fails (rather than passes) a model that never edits", async () => {
    api = await fakeApi("openai", { quirk: () => ({ text: "Sure, it looks great already." }) });
    const adapter = makeAdapter({ adapter: "openai", baseUrl: api.url, model: "m" });
    const task = tasks.find((t) => t.id === "delete-middle-2s") as EvalTask;
    const r = await runTask(adapter, task, { fixtureDir });
    expect(r.pass).toBe(false);
    expect(r.failures.length).toBeGreaterThan(0);
    expect(r.toolCalls.total).toBe(0);
  }, 60_000);
});

describe("anthropic adapter on the eval tasks", () => {
  it("passes all three starter tasks with the key from the environment", async () => {
    api = await fakeApi("anthropic");
    const adapter = makeAdapter({
      adapter: "anthropic",
      model: "claude-fake",
      baseUrl: api.url,
      env: { ANTHROPIC_API_KEY: "k-test" },
    });
    expect(adapter.id).toBe("anthropic:claude-fake");
    const records = await runSuite(adapter, tasks, { fixtureDir });
    expect(records.every((r) => r.pass)).toBe(true);
    expect(records[0]).toMatchObject({ turns: 3, inputTokens: 300, outputTokens: 30 });
    expect(api.seen[0]?.headers["x-api-key"]).toBe("k-test");
    expect(api.seen[0]?.body).toMatchObject({ model: "claude-fake", temperature: 0 });
  }, 180_000);
});

describe("AgentAdapter", () => {
  it("throws on a provider failure so the runner records an error", async () => {
    const adapter = new AgentAdapter({
      id: "scripted",
      provider: new ScriptedProvider([new Error("boom")]),
    });
    const task = tasks.find((t) => t.id === "keep-first-3-seconds") as EvalTask;
    const r = await runTask(adapter, task, { fixtureDir });
    expect(r.error).toBe("boom");
    expect(r.pass).toBe(false);
  }, 60_000);

  it("uses the task's turn limit", async () => {
    const calls = Array.from({ length: 10 }, (_, i) => ({
      toolCalls: [{ id: `c${i}`, name: "get_project", arguments: {} }],
    }));
    const adapter = new AgentAdapter({ id: "loopy", provider: new ScriptedProvider(calls) });
    const task = { ...(tasks[0] as EvalTask), maxTurns: 2 };
    const r = await runTask(adapter, task, { fixtureDir });
    expect(r.turns).toBe(2);
    expect(r.pass).toBe(false);
  }, 60_000);
});

describe("makeAdapter", () => {
  it("builds the oracle without options", () => {
    expect(makeAdapter({ adapter: "oracle" }).id).toBe("oracle");
  });

  it("explains missing options", () => {
    expect(() => makeAdapter({ adapter: "openai", model: "m" })).toThrow(/--base-url/);
    expect(() => makeAdapter({ adapter: "openai", baseUrl: "http://x/v1" })).toThrow(/--model/);
    expect(() => makeAdapter({ adapter: "anthropic" })).toThrow(/--model/);
    expect(() => makeAdapter({ adapter: "anthropic", model: "m", env: {} })).toThrow(
      /ANTHROPIC_API_KEY is not set/,
    );
    expect(() =>
      makeAdapter({
        adapter: "openai",
        baseUrl: "http://x",
        model: "m",
        apiKeyEnv: "NOPE",
        env: {},
      }),
    ).toThrow(/NOPE is not set/);
    expect(() => makeAdapter({ adapter: "gpt" })).toThrow(
      /Unknown adapter "gpt"\. Available: oracle, openai, anthropic/,
    );
  });

  it("validates temperature and tool style", () => {
    const base = { adapter: "openai", baseUrl: "http://x", model: "m" };
    expect(() => makeAdapter({ ...base, temperature: "hot" })).toThrow(/--temperature/);
    expect(() => makeAdapter({ ...base, toolStyle: "tiny" })).toThrow(/--tool-style/);
    expect(() => makeAdapter({ ...base, temperature: "default" })).not.toThrow();
  });

  it("puts non-default settings in the id so reports are not confused", () => {
    const base = { adapter: "openai", baseUrl: "http://x", model: "m" };
    expect(makeAdapter({ ...base, toolStyle: "full" }).id).toBe("openai:m+full");
    expect(
      makeAdapter({
        adapter: "anthropic",
        model: "c",
        toolStyle: "compact",
        env: { ANTHROPIC_API_KEY: "k" },
      }).id,
    ).toBe("anthropic:c+compact");
  });
});
