// The agent loop driven through the real providers against scripted local HTTP servers (no network).

import {
  type Asset,
  addAsset,
  appendClip,
  emptyProject,
  mainClips,
  Session,
  timelineDuration,
} from "@dax/core";
import type { AgentEvent } from "@dax/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { createAgent } from "./agent.js";
import { type MockServer, startMockServer } from "./mock-server.test-util.js";
import { createAnthropicProvider } from "./providers/anthropic.js";
import { createOpenAiProvider } from "./providers/openai.js";

const asset: Asset = { id: "a1", path: "/x/a.mp4", kind: "video", duration: 10, hasAudio: true };
const newSession = () => new Session(appendClip(addAsset(emptyProject("t"), asset), "a1"));

let server: MockServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const openAiToolCall = (name: string, args: string, id = "call_1") => ({
  choices: [
    {
      finish_reason: "tool_calls",
      message: {
        content: null,
        tool_calls: [{ id, type: "function", function: { name, arguments: args } }],
      },
    },
  ],
  usage: { prompt_tokens: 100, completion_tokens: 10 },
});
const openAiText = (text: string) => ({
  choices: [{ finish_reason: "stop", message: { content: text } }],
  usage: { prompt_tokens: 150, completion_tokens: 8 },
});

describe("agent over the OpenAI-compatible API", () => {
  it("edits the project from a model that sends broken JSON, and sends results back in the right shape", async () => {
    server = await startMockServer([
      { json: openAiToolCall("delete_range", "{'from': 2, 'to': 4,}") },
      { json: openAiText("Removed 2 seconds.") },
    ]);
    const provider = createOpenAiProvider({ baseUrl: `${server.url}/v1`, model: "small" });
    const agent = createAgent({ provider, toolStyle: "compact" });
    const session = newSession();
    const events: AgentEvent[] = [];
    const result = await agent.run("Delete 2 to 4 seconds", {
      session,
      onEvent: (e) => events.push(e),
    });

    expect(result).toMatchObject({
      stopReason: "done",
      text: "Removed 2 seconds.",
      inputTokens: 250,
      outputTokens: 18,
      usageComplete: true,
    });
    expect(result.toolCalls).toMatchObject({ total: 1, invalid: 0, repaired: 1 });
    expect(timelineDuration(session.project)).toBeCloseTo(8);
    expect(session.history()[1]?.source).toBe("ai");

    // First request: compact tools, system prompt with the rules, the user message.
    const first = server.requests[0]?.body as {
      messages: { role: string; content: string }[];
      tools: { function: { name: string; description: string; parameters: object } }[];
    };
    expect(first.messages[0]?.content).toMatch(/Call get_project first/);
    expect(first.messages[1]).toEqual({ role: "user", content: "Delete 2 to 4 seconds" });
    expect(first.tools.length).toBeGreaterThan(10);
    // Compact style: no per-field descriptions inside the parameter schemas.
    expect(JSON.stringify(first.tools.map((t) => t.function.parameters))).not.toContain(
      "description",
    );

    // Second request: the assistant tool call (repaired JSON) and the tool result.
    const second = server.requests[1]?.body as { messages: Record<string, unknown>[] };
    expect(second.messages[2]).toMatchObject({
      role: "assistant",
      tool_calls: [
        { id: "call_1", function: { name: "delete_range", arguments: '{"from":2,"to":4}' } },
      ],
    });
    expect(second.messages[3]).toMatchObject({ role: "tool", tool_call_id: "call_1" });
    expect(String(second.messages[3]?.content)).toMatch(/^Deleted 2s to 4s\./);
  });

  it("recovers a tool call a local model wrote as text", async () => {
    server = await startMockServer([
      {
        json: openAiText(
          'Sure, cutting now.\n<tool_call>\n{"name": "split", "arguments": {"at": 5}}\n</tool_call>',
        ),
      },
      { json: openAiText("Split at 5 seconds.") },
    ]);
    const agent = createAgent({
      provider: createOpenAiProvider({ baseUrl: server.url, model: "small" }),
    });
    const session = newSession();
    const events: AgentEvent[] = [];
    const result = await agent.run("split at 5", { session, onEvent: (e) => events.push(e) });
    expect(mainClips(session.project)).toHaveLength(2);
    // The user is told that the call came from the reply text, not from a structured tool call.
    expect(events).toContainEqual(
      expect.objectContaining({ type: "status", text: expect.stringContaining("written as text") }),
    );
    expect(result.toolCalls).toMatchObject({ total: 1, fromText: 1 });
  });

  it("streams text events end to end", async () => {
    const chunk = (content: string) =>
      `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: null }] })}`;
    server = await startMockServer([
      { sse: [chunk("The video "), chunk("is 10 seconds."), "data: [DONE]"] },
    ]);
    const agent = createAgent({
      provider: createOpenAiProvider({ baseUrl: server.url, model: "small" }),
      streamText: true,
    });
    const events: AgentEvent[] = [];
    await agent.run("how long?", { session: newSession(), onEvent: (e) => events.push(e) });
    expect(events.filter((e) => e.type === "text")).toEqual([
      { type: "text", text: "The video" },
      { type: "text", text: " is 10 seconds." },
    ]);
    expect(server.requests[0]?.body).toMatchObject({ stream: true });
  });

  it("stops promptly when cancelled while the server is thinking", async () => {
    server = await startMockServer([{ hang: true }]);
    const agent = createAgent({
      provider: createOpenAiProvider({ baseUrl: server.url, model: "small" }),
    });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30);
    const started = Date.now();
    const result = await agent.run("x", { session: newSession(), signal: controller.signal });
    expect(result.stopReason).toBe("cancelled");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("reports an unreachable server as an error event with a clear message", async () => {
    const dead = await startMockServer([{}]);
    const url = dead.url;
    await dead.close();
    const agent = createAgent({ provider: createOpenAiProvider({ baseUrl: url, model: "small" }) });
    const events: AgentEvent[] = [];
    const result = await agent.run("x", { session: newSession(), onEvent: (e) => events.push(e) });
    expect(result.stopReason).toBe("error");
    expect(result.error).toMatch(/Could not reach OpenAI-compatible server/);
    expect(events[events.length - 1]).toMatchObject({ type: "error" });
  });
});

describe("agent over the Anthropic API", () => {
  it("round-trips tool_use and tool_result blocks", async () => {
    server = await startMockServer([
      {
        json: {
          content: [
            { type: "text", text: "Looking." },
            { type: "tool_use", id: "toolu_1", name: "get_project", input: {} },
          ],
          stop_reason: "tool_use",
          usage: { input_tokens: 200, output_tokens: 20 },
        },
      },
      {
        json: {
          content: [{ type: "text", text: "It is 10 seconds long." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 400, output_tokens: 9 },
        },
      },
    ]);
    const agent = createAgent({
      provider: createAnthropicProvider({ baseUrl: server.url, model: "claude-test", apiKey: "k" }),
    });
    const result = await agent.run("how long is it?", { session: newSession() });
    expect(result).toMatchObject({
      stopReason: "done",
      text: "It is 10 seconds long.",
      inputTokens: 600,
      outputTokens: 29,
      usageComplete: true,
    });

    const second = server.requests[1]?.body as {
      messages: { role: string; content: Record<string, unknown>[] }[];
    };
    expect(second.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(second.messages[1]?.content[1]).toMatchObject({
      type: "tool_use",
      id: "toolu_1",
      name: "get_project",
    });
    expect(second.messages[2]?.content[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "toolu_1",
      is_error: false,
    });
  });
});
