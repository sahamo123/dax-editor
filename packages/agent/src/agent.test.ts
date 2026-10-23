import {
  type Asset,
  addAsset,
  appendClip,
  commandTools,
  emptyProject,
  mainClips,
  Session,
  timelineDuration,
} from "@dax/core";
import type { AgentEvent } from "@dax/protocol";
import { describe, expect, it } from "vitest";
import { type CreateAgentOptions, createAgent } from "./agent.js";
import { ScriptedProvider, type ScriptedStep } from "./scripted.js";
import type { ChatMessage, ToolCall } from "./types.js";

const asset: Asset = { id: "a1", path: "/x/a.mp4", kind: "video", duration: 10, hasAudio: true };

/** A project with one 10 s clip. Only timeline commands are used here, so no media file is needed. */
function newSession(): Session {
  return new Session(appendClip(addAsset(emptyProject("t"), asset), "a1"));
}

const call = (name: string, args: unknown = {}, id = `c_${name}`): ToolCall => ({
  id,
  name,
  arguments: args,
});

function setup(steps: ScriptedStep[], options: Partial<CreateAgentOptions> = {}) {
  const provider = new ScriptedProvider(steps);
  const session = newSession();
  const events: AgentEvent[] = [];
  const agent = createAgent({ provider, ...options });
  const run = (
    message: string,
    extra: { signal?: AbortSignal; history?: ChatMessage[]; maxTurns?: number } = {},
  ) => agent.run(message, { session, onEvent: (e) => events.push(e), ...extra });
  return { provider, session, events, run };
}

/** The tool messages the model was sent in its last request. */
function lastToolMessages(provider: ScriptedProvider) {
  const req = provider.requests[provider.requests.length - 1];
  return (req?.messages ?? []).filter((m) => m.role === "tool");
}

describe("the loop", () => {
  it("calls tools, feeds results back and stops when the model answers", async () => {
    const { run, session, events, provider } = setup([
      { toolCalls: [call("get_project")], usage: { inputTokens: 100, outputTokens: 10 } },
      {
        toolCalls: [call("delete_range", { from: 2, to: 4 })],
        usage: { inputTokens: 150, outputTokens: 12 },
      },
      { text: "Removed 2 seconds.", usage: { inputTokens: 180, outputTokens: 6 } },
    ]);
    const result = await run("Delete 2 to 4 seconds");

    expect(result.stopReason).toBe("done");
    expect(result.text).toBe("Removed 2 seconds.");
    expect(result.turns).toBe(3);
    expect(timelineDuration(session.project)).toBeCloseTo(8);
    expect(result.toolCalls).toMatchObject({ total: 2, invalid: 0, failed: 0 });
    expect(result).toMatchObject({ inputTokens: 430, outputTokens: 28, usageComplete: true });

    expect(events.map((e) => e.type)).toEqual([
      "status",
      "tool_call",
      "tool_result",
      "status",
      "tool_call",
      "tool_result",
      "status",
      "text",
      "done",
    ]);
    expect(events[1]).toEqual({
      type: "tool_call",
      id: "c_get_project",
      name: "get_project",
      args: {},
    });
    expect(events[5]).toMatchObject({ type: "tool_result", name: "delete_range", ok: true });
    expect(events[8]).toEqual({ type: "done", turns: 3, inputTokens: 430, outputTokens: 28 });

    // The model must see the real project, including clip ids.
    const second = provider.requests[1]?.messages.find((m) => m.role === "tool");
    expect(second?.role === "tool" && second.content).toContain('"id":"');
    expect(second?.role === "tool" && second.content).toContain("1 clip(s)");
  });

  it("records every edit in the history with source ai", async () => {
    const { run, session } = setup([
      { toolCalls: [call("split", { at: 5 })] },
      { toolCalls: [call("delete_range", { from: 0, to: 2 }, "c2")] },
      { text: "Done." },
    ]);
    await run("split and trim the start");
    expect(session.history().map((h) => h.source)).toEqual(["system", "ai", "ai"]);
    expect(session.history()[1]?.label).toBe("Split at 5s");
  });

  it("feeds a tool error back and lets the model recover", async () => {
    const { run, session, provider, events } = setup([
      { toolCalls: [call("remove_clip", { clipId: "clip_nope" })] },
      { toolCalls: [call("delete_range", { from: 2, to: 4 }, "c2")] },
      { text: "Done." },
    ]);
    const result = await run("delete part");

    const firstResult = provider.requests[1]?.messages.find((m) => m.role === "tool");
    expect(firstResult).toMatchObject({ role: "tool", isError: true });
    expect(timelineDuration(session.project)).toBeCloseTo(8);
    expect(result.stopReason).toBe("done");
    expect(result.toolCalls).toMatchObject({ total: 2, failed: 1, invalid: 0 });
    expect(
      events.filter((e) => e.type === "tool_result").map((e) => e.type === "tool_result" && e.ok),
    ).toEqual([false, true]);
  });

  it("tells the model what was wrong with invalid arguments and how to fix them", async () => {
    const { run, provider, session } = setup([
      { toolCalls: [call("delete_range", { from: 2 })] },
      { toolCalls: [call("delete_range", { from: 2, to: 4 }, "c2")] },
      { text: "Done." },
    ]);
    const result = await run("delete 2 to 4");
    const msg = provider.requests[1]?.messages.find((m) => m.role === "tool");
    const content = msg?.role === "tool" ? msg.content : "";
    expect(content).toContain("Invalid arguments for delete_range");
    expect(content).toContain("to: Required");
    expect(content).toContain("Usage: delete_range(from: number, to: number)");
    expect(result.toolCalls).toMatchObject({ total: 2, invalid: 1 });
    expect(timelineDuration(session.project)).toBeCloseTo(8);
  });

  it("refuses an unknown tool and lists the real ones", async () => {
    const { run, provider } = setup([{ toolCalls: [call("make_it_pretty")] }, { text: "Sorry." }]);
    const result = await run("do magic");
    const content = lastToolMessages(provider)[0];
    expect(content?.role === "tool" && content.content).toMatch(
      /Unknown tool "make_it_pretty"\. Available tools: get_project, /,
    );
    expect(result.toolCalls.invalid).toBe(1);
  });

  it("repairs malformed JSON arguments and wrongly typed values", async () => {
    const { run, session } = setup([
      { toolCalls: [call("delete_range", "```json\n{'from': '2', 'to': 4,}\n```")] },
      { text: "Done." },
    ]);
    const result = await run("delete 2 to 4");
    expect(timelineDuration(session.project)).toBeCloseTo(8);
    expect(result.toolCalls).toMatchObject({ total: 1, invalid: 0, repaired: 1 });
  });

  it("treats empty and null arguments as no arguments", async () => {
    const { run, events } = setup([
      { toolCalls: [call("get_project", ""), call("list_presets", "null", "c2")] },
      { text: "Done." },
    ]);
    await run("look");
    expect(events.filter((e) => e.type === "tool_result" && e.ok)).toHaveLength(2);
  });

  it("answers without tools when the model asks a question", async () => {
    const { run, session } = setup([{ text: "Which part do you want to remove?" }]);
    const result = await run("remove the boring part");
    expect(result).toMatchObject({
      stopReason: "done",
      text: "Which part do you want to remove?",
      turns: 1,
    });
    expect(session.history()).toHaveLength(1);
  });

  it("continues a conversation from the history of a previous run", async () => {
    const { run, provider } = setup([{ text: "It is 10 seconds long." }, { text: "Yes." }]);
    const first = await run("how long is it?");
    await run("really?", { history: first.messages });
    const seen = provider.requests[1]?.messages;
    expect(seen?.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(seen?.[1]).toMatchObject({ role: "assistant", text: "It is 10 seconds long." });
  });

  it("strips reasoning blocks from the reply", async () => {
    const { run, events } = setup([{ text: "<think>The user wants X.</think>Done." }]);
    const result = await run("hi");
    expect(result.text).toBe("Done.");
    expect(events.find((e) => e.type === "text")).toEqual({ type: "text", text: "Done." });
  });

  it("asks once for a summary when the model goes silent after its tool calls", async () => {
    const { run, provider } = setup([
      { toolCalls: [call("get_project")] },
      { text: "" },
      { text: "The video is 10 seconds." },
    ]);
    const result = await run("how long?");
    expect(result.text).toBe("The video is 10 seconds.");
    const last = provider.requests[2]?.messages;
    expect(last?.[last.length - 1]).toMatchObject({ role: "user" });
    expect(result.turns).toBe(3);
  });

  it("gives up on silence after one nudge", async () => {
    const { run } = setup([{ toolCalls: [call("get_project")] }, { text: "" }, { text: "" }]);
    const result = await run("how long?");
    expect(result).toMatchObject({ stopReason: "done", text: "" });
  });

  it("gives every call a unique id when the server sends none or repeats them", async () => {
    const { run } = setup([
      { toolCalls: [call("get_project", {}, ""), call("list_presets", {}, "")] },
      { toolCalls: [call("get_project", {}, "")] },
      { text: "ok" },
    ]);
    const result = await run("x");
    const ids = result.messages.flatMap((m) =>
      m.role === "assistant" ? m.toolCalls.map((c) => c.id) : [],
    );
    expect(new Set(ids).size).toBe(3);
    const resultIds = result.messages.flatMap((m) => (m.role === "tool" ? [m.toolCallId] : []));
    expect(resultIds).toEqual(ids);
  });
});

describe("text-embedded tool calls", () => {
  const formats: [string, string][] = [
    [
      "<tool_call> tags",
      'Cutting now.\n<tool_call>\n{"name": "delete_range", "arguments": {"from": 2, "to": 4}}\n</tool_call>',
    ],
    [
      "a fenced JSON block",
      '```json\n{"name": "delete_range", "arguments": {"from": 2, "to": 4}}\n```',
    ],
    ["bare JSON", '{"name": "delete_range", "parameters": {"from": 2, "to": 4}}'],
    [
      "JSON with single quotes",
      "<tool_call>{'name': 'delete_range', 'arguments': {'from': 2, 'to': 4,}}</tool_call>",
    ],
    ["Llama <function=...> tags", '<function=delete_range>{"from": 2, "to": 4}</function>'],
    [
      "Qwen parameter tags",
      "<tool_call><function=delete_range><parameter=from>2</parameter><parameter=to>4</parameter></function></tool_call>",
    ],
    ["a call-syntax line", "delete_range(from=2, to=4)"],
  ];

  it.each(formats)("runs a call written as %s", async (_label, text) => {
    const { run, session, events } = setup([{ text }, { text: "Done." }]);
    const result = await run("delete 2 to 4");
    expect(timelineDuration(session.project)).toBeCloseTo(8);
    expect(result.toolCalls).toMatchObject({ total: 1, fromText: 1, invalid: 0 });
    expect(result.stopReason).toBe("done");
    // The call text must not reach the chat transcript.
    const shown = events.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("|");
    expect(shown).not.toMatch(/tool_call|delete_range|function=/);
  });

  it("stores such a call as a native tool call in the history, so later turns stay well formed", async () => {
    const { run, provider } = setup([
      { text: '<tool_call>{"name": "get_project", "arguments": {}}</tool_call>' },
      { text: "Done." },
    ]);
    await run("look");
    const assistant = provider.requests[1]?.messages.find((m) => m.role === "assistant");
    expect(assistant).toMatchObject({
      role: "assistant",
      text: "",
      toolCalls: [{ name: "get_project", arguments: {} }],
    });
  });

  it("tells the model when its tool call block is unreadable", async () => {
    const { run, provider } = setup([{ text: "<tool_call>oops</tool_call>" }, { text: "Sorry." }]);
    const result = await run("x");
    const msg = lastToolMessages(provider)[0];
    expect(msg?.role === "tool" && msg.content).toMatch(/could not be read/);
    expect(result.toolCalls).toMatchObject({ total: 1, invalid: 1 });
  });

  it("can be switched off", async () => {
    const { run, session } = setup(
      [{ text: '<tool_call>{"name": "split", "arguments": {"at": 5}}</tool_call>' }],
      { textToolCalls: false },
    );
    const result = await run("x");
    expect(result.toolCalls.total).toBe(0);
    expect(session.history()).toHaveLength(1);
  });

  it("does not run a native call's text twice", async () => {
    const { run } = setup([
      {
        text: '{"name": "split", "arguments": {"at": 5}}',
        toolCalls: [call("get_project")],
      },
      { text: "ok" },
    ]);
    const result = await run("x");
    expect(result.toolCalls).toMatchObject({ total: 1, fromText: 0 });
  });
});

describe("safety nets", () => {
  it("stops after the same call fails repeatedly and warns on the way", async () => {
    const bad = { clipId: "nope", volume: 1 };
    const { run, provider, events } = setup([
      { toolCalls: [call("set_volume", bad, "c1")] },
      { toolCalls: [call("set_volume", bad, "c2")] },
      { toolCalls: [call("set_volume", { volume: 1, clipId: "nope" }, "c3")] },
      { text: "never reached" },
    ]);
    const result = await run("louder");
    expect(result.stopReason).toBe("repeated_failure");
    expect(result.turns).toBe(3);
    expect(provider.requests).toHaveLength(3);
    const second = provider.requests[2]?.messages.filter((m) => m.role === "tool")[1];
    expect(second?.role === "tool" && second.content).toContain("already tried exactly this");
    const last = events[events.length - 1];
    expect(last).toMatchObject({ type: "error" });
    expect(last?.type === "error" && last.message).toMatch(/same step kept failing \(set_volume/);
    // The history stays well formed for the next run.
    expect(result.messages[result.messages.length - 1]).toMatchObject({ role: "assistant" });
  });

  it("does not stop when failing calls differ, or after a success in between", async () => {
    const { run } = setup([
      { toolCalls: [call("set_volume", { clipId: "a", volume: 1 }, "c1")] },
      { toolCalls: [call("set_volume", { clipId: "b", volume: 1 }, "c2")] },
      { toolCalls: [call("set_volume", { clipId: "a", volume: 1 }, "c3")] },
      { text: "I could not find the clip." },
    ]);
    const result = await run("louder");
    expect(result.stopReason).toBe("done");
  });

  it("honours a custom repeat limit", async () => {
    const { run } = setup(
      [
        { toolCalls: [call("set_volume", { clipId: "a", volume: 1 }, "c1")] },
        { toolCalls: [call("set_volume", { clipId: "a", volume: 1 }, "c2")] },
        { text: "x" },
      ],
      { maxRepeatedFailures: 2 },
    );
    expect((await run("louder")).stopReason).toBe("repeated_failure");
  });

  it("stops at the turn limit with an error event, keeping the edits made", async () => {
    const steps: ScriptedStep[] = Array.from({ length: 10 }, (_, i) => ({
      toolCalls: [call("split", { at: i + 1 }, `c${i}`)],
    }));
    const { run, session, events } = setup(steps, { maxTurns: 3 });
    const result = await run("split a lot");
    expect(result).toMatchObject({ stopReason: "max_turns", turns: 3 });
    expect(mainClips(session.project)).toHaveLength(4);
    const last = events[events.length - 1];
    expect(last?.type === "error" && last.message).toMatch(/stopped after 3 steps/);
  });

  it("lets a single run override the turn limit", async () => {
    const steps: ScriptedStep[] = Array.from({ length: 5 }, (_, i) => ({
      toolCalls: [call("get_project", {}, `c${i}`)],
    }));
    const { run } = setup(steps);
    expect((await run("x", { maxTurns: 2 })).turns).toBe(2);
  });

  it("runs at most the allowed number of tool calls per reply and refuses the rest", async () => {
    const many = Array.from({ length: 6 }, (_, i) => call("get_project", {}, `c${i}`));
    const { run, provider, events } = setup([{ toolCalls: many }, { text: "ok" }], {
      maxToolCallsPerTurn: 2,
    });
    const result = await run("x");
    expect(result.toolCalls).toMatchObject({ total: 6, skipped: 4, invalid: 0 });
    const msgs = lastToolMessages(provider);
    expect(msgs).toHaveLength(6);
    expect(msgs[5]?.role === "tool" && msgs[5].content).toMatch(
      /too many tool calls in one step \(limit 2\)/,
    );
    expect(events.filter((e) => e.type === "tool_result" && e.ok)).toHaveLength(2);
  });

  it("does not run a repaired call whose reply was cut off", async () => {
    const { run, session, provider } = setup([
      { toolCalls: [call("delete_range", '{"from": 2, "to": 4')], stopReason: "length" },
      { text: "ok" },
    ]);
    const result = await run("x");
    expect(timelineDuration(session.project)).toBeCloseTo(10);
    const msg = lastToolMessages(provider)[0];
    expect(msg?.role === "tool" && msg.content).toMatch(/cut off/);
    expect(result.toolCalls.invalid).toBe(1);
  });

  it("cuts very long tool results", async () => {
    const { run, provider } = setup([{ toolCalls: [call("get_project")] }, { text: "ok" }], {
      maxToolResultChars: 100,
    });
    await run("x");
    const msg = lastToolMessages(provider)[0];
    expect(msg?.role === "tool" && msg.content).toMatch(/more characters cut/);
  });

  it("shortens old tool results when the conversation gets long", async () => {
    const steps: ScriptedStep[] = [
      { toolCalls: [call("get_project", {}, "c1")] },
      { toolCalls: [call("get_project", {}, "c2")] },
      { toolCalls: [call("get_project", {}, "c3")] },
      { text: "ok" },
    ];
    const { run, provider } = setup(steps, { maxContextChars: 1000 });
    await run("x");
    const tools = provider.requests[3]?.messages.filter((m) => m.role === "tool") ?? [];
    expect(tools[0]?.role === "tool" && tools[0].content).toMatch(/older result shortened/);
    expect(tools[2]?.role === "tool" && tools[2].content).not.toMatch(/shortened/);
  });
});

describe("irreversible commands", () => {
  it("are not offered by default, and the prompt says the model cannot export", async () => {
    const { run, provider } = setup([{ text: "ok" }]);
    await run("export it");
    const req = provider.requests[0];
    expect(req?.tools.map((t) => t.name)).not.toContain("export_video");
    expect(req?.tools.map((t) => t.name)).not.toContain("cancel_task");
    expect(req?.tools.map((t) => t.name)).toEqual(
      commandTools()
        .filter((tool) => !tool.irreversible)
        .map((tool) => tool.name),
    );
    expect(req?.system).toMatch(/cannot export/);
  });

  it("are refused when the model calls them anyway, and nothing is written", async () => {
    const { run, provider, session } = setup([
      { toolCalls: [call("export_video", { path: "/tmp/dax-agent-should-not-exist.mp4" })] },
      { text: "I can't export; use the Export button." },
    ]);
    const result = await run("export it");
    const msg = lastToolMessages(provider)[0];
    expect(msg?.role === "tool" && msg.content).toMatch(/not available here/);
    expect(result.toolCalls.invalid).toBe(1);
    expect(session.history()).toHaveLength(1);
  });

  it("are refused when a text-embedded call asks for them", async () => {
    const { run, provider } = setup([
      {
        text: '<tool_call>{"name": "export_video", "arguments": {"path": "/tmp/x.mp4"}}</tool_call>',
      },
      { text: "no" },
    ]);
    await run("export it");
    const msg = lastToolMessages(provider)[0];
    expect(msg?.role === "tool" && msg.content).toMatch(/not available here/);
  });

  it("are removed even if the caller passes them in `tools`", async () => {
    const { run, provider } = setup([{ text: "ok" }], { tools: commandTools() });
    await run("x");
    expect(provider.requests[0]?.tools.map((t) => t.name)).not.toContain("export_video");
  });

  it("can be allowed explicitly", async () => {
    const { run, provider } = setup([{ text: "ok" }], { allowIrreversible: true });
    await run("x");
    expect(provider.requests[0]?.tools.map((t) => t.name)).toContain("export_video");
    expect(provider.requests[0]?.system).not.toMatch(/cannot export/);
  });
});

describe("cancellation", () => {
  it("stops while waiting for the model and leaves the project untouched", async () => {
    const controller = new AbortController();
    const waiting: ScriptedStep = (req) =>
      new Promise((_resolve, reject) => {
        req.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
        setTimeout(() => controller.abort(), 10);
      });
    const { run, session, events } = setup([waiting, { text: "never" }]);
    const result = await run("x", { signal: controller.signal });
    expect(result.stopReason).toBe("cancelled");
    expect(session.history()).toHaveLength(1);
    expect(events.slice(-2)).toEqual([
      { type: "status", text: "Cancelled." },
      { type: "done", turns: 1 },
    ]);
    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(result.messages[result.messages.length - 1]).toMatchObject({ role: "assistant" });
  });

  it("does nothing if already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const { run, provider } = setup([{ text: "never" }]);
    const result = await run("x", { signal: controller.signal });
    expect(result).toMatchObject({ stopReason: "cancelled", turns: 0 });
    expect(provider.requests).toHaveLength(0);
  });

  it("skips the remaining tool calls once cancelled between them and asks the model nothing more", async () => {
    const controller = new AbortController();
    const provider = new ScriptedProvider([
      {
        toolCalls: [
          call("split", { at: 3 }, "c1"),
          call("split", { at: 6 }, "c2"),
          call("split", { at: 8 }, "c3"),
        ],
      },
      { text: "never" },
    ]);
    const session = newSession();
    const result = await createAgent({ provider }).run("x", {
      session,
      signal: controller.signal,
      onEvent: (e) => {
        if (e.type === "tool_result" && e.id === "c1") controller.abort();
      },
    });
    expect(result.stopReason).toBe("cancelled");
    expect(mainClips(session.project)).toHaveLength(2);
    expect(provider.requests).toHaveLength(1);
    // Every call still has a result, so the history stays valid for the next run.
    expect(result.messages.filter((m) => m.role === "tool")).toHaveLength(3);
  });
});

describe("provider failures", () => {
  it("reports an error event and a result instead of throwing", async () => {
    const { run, events } = setup([
      new Error("Could not reach OpenAI-compatible server at http://x"),
    ]);
    const result = await run("x");
    expect(result).toMatchObject({
      stopReason: "error",
      error: "Could not reach OpenAI-compatible server at http://x",
    });
    expect(events[events.length - 1]).toEqual({
      type: "error",
      message: "Could not reach OpenAI-compatible server at http://x",
    });
  });
});

describe("usage accounting", () => {
  it("says the totals are incomplete when a reply carried no usage", async () => {
    const { run } = setup([
      { toolCalls: [call("get_project")], usage: { inputTokens: 100, outputTokens: 10 } },
      { text: "ok" },
    ]);
    const result = await run("x");
    expect(result.usageComplete).toBe(false);
    expect(result.inputTokens).toBe(100);
  });

  it("omits tokens from the done event when the provider reports none", async () => {
    const { run, events } = setup([{ text: "ok" }]);
    await run("x");
    expect(events[events.length - 1]).toEqual({ type: "done", turns: 1 });
  });
});

describe("tools and prompt configuration", () => {
  it("offers compact tools when asked", async () => {
    const full = setup([{ text: "ok" }]);
    await full.run("x");
    const compact = setup([{ text: "ok" }], { toolStyle: "compact" });
    await compact.run("x");
    const size = (p: ScriptedProvider) => JSON.stringify(p.requests[0]?.tools).length;
    expect(size(compact.provider)).toBeLessThan(size(full.provider) * 0.8);
  });

  it("offers only the tools it is given", async () => {
    const { run, provider } = setup([{ text: "ok" }], {
      tools: commandTools({ names: ["get_project", "split"] }),
    });
    await run("x");
    expect(provider.requests[0]?.tools.map((t) => t.name)).toEqual(["get_project", "split"]);
  });

  it("refuses to be created with a tool that is not a registry command", () => {
    expect(() =>
      createAgent({
        provider: new ScriptedProvider([]),
        tools: [
          { name: "rm_rf", description: "x", parameters: {}, readOnly: false, irreversible: false },
        ],
      }),
    ).toThrow(/rm_rf/);
  });

  it("uses a custom system prompt", async () => {
    const { run, provider } = setup([{ text: "ok" }], { systemPrompt: "Custom rules." });
    await run("x");
    expect(provider.requests[0]?.system.startsWith("Custom rules.")).toBe(true);
  });

  it("uses the default system prompt otherwise", async () => {
    const { run, provider } = setup([{ text: "ok" }]);
    await run("x");
    expect(provider.requests[0]?.system).toMatch(/Call get_project first/);
  });

  it("adds guidance from the contextProvider for this request only", async () => {
    const seen: string[] = [];
    const { run, provider } = setup([{ text: "ok" }, { text: "ok" }], {
      contextProvider: (m) => {
        seen.push(m);
        return m.includes("podcast") ? "Podcast tip: remove_silences first." : undefined;
      },
    });
    await run("tighten this podcast");
    await run("hello");
    expect(seen).toEqual(["tighten this podcast", "hello"]);
    expect(provider.requests[0]?.system).toContain("Podcast tip: remove_silences first.");
    expect(provider.requests[1]?.system).not.toContain("Podcast tip");
  });

  it("accepts an async contextProvider", async () => {
    const { run, provider } = setup([{ text: "ok" }], {
      contextProvider: async () => "Async tip.",
    });
    await run("x");
    expect(provider.requests[0]?.system).toContain("Async tip.");
  });

  it("carries on, with a status event, if the contextProvider fails", async () => {
    const { run, events } = setup([{ text: "ok" }], {
      contextProvider: () => {
        throw new Error("skills folder missing");
      },
    });
    const result = await run("x");
    expect(result.stopReason).toBe("done");
    expect(
      events.find((e) => e.type === "status" && e.text.includes("skills folder missing")),
    ).toBeDefined();
  });
});

describe("text streaming", () => {
  it("sends text as it arrives and holds back anything that looks like a tool call", async () => {
    const chunks = [
      "I will ",
      "cut it.\n",
      "<tool_",
      'call>{"name": "split", "arguments": {"at": 5}}</tool_call>',
    ];
    const streaming: ScriptedStep = (req) => {
      for (const c of chunks) req.onTextDelta?.(c);
      return { text: chunks.join("") };
    };
    const { run, events, session } = setup([streaming, { text: "Split." }], { streamText: true });
    await run("split at 5");
    expect(mainClips(session.project)).toHaveLength(2);
    const texts = events.flatMap((e) => (e.type === "text" ? [e.text] : []));
    expect(texts.join("")).toBe("I will cut it.Split.");
    expect(texts.join("")).not.toMatch(/tool_call/);
    expect(texts.length).toBeGreaterThan(2);
  });

  it("does not repeat text it already streamed", async () => {
    const streaming: ScriptedStep = (req) => {
      req.onTextDelta?.("Hello ");
      req.onTextDelta?.("there.");
      return { text: "Hello there." };
    };
    const { run, events } = setup([streaming], { streamText: true });
    await run("hi");
    expect(events.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("")).toBe(
      "Hello there.",
    );
  });

  it("does not ask providers to stream unless enabled", async () => {
    const { run, provider } = setup([{ text: "ok" }]);
    await run("x");
    expect(provider.requests[0]?.onTextDelta).toBeUndefined();
  });
});
