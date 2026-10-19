import { afterEach, describe, expect, it } from "vitest";
import { type MockServer, startMockServer } from "../mock-server.test-util.js";
import type { ChatMessage, ToolDefinition } from "../types.js";
import { createAnthropicProvider } from "./anthropic.js";
import { ProviderError } from "./http.js";

const TOOLS: ToolDefinition[] = [
  {
    name: "split",
    description: "Cut at a time.",
    parameters: { type: "object", properties: { at: { type: "number" } }, required: ["at"] },
  },
];
const USER: ChatMessage[] = [{ role: "user", content: "cut at 3" }];
const FAST = { retryDelayMs: 1 };

let server: MockServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const message = (content: unknown[], extra: Record<string, unknown> = {}) => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  content,
  stop_reason: "end_turn",
  usage: { input_tokens: 10, output_tokens: 5 },
  ...extra,
});

function provider(url: string, extra: Record<string, unknown> = {}) {
  return createAnthropicProvider({
    baseUrl: url,
    model: "claude-test",
    apiKey: "k-secret",
    ...FAST,
    ...extra,
  });
}

describe("Anthropic provider", () => {
  it("posts to /v1/messages with the key, version, system prompt and input_schema tools", async () => {
    server = await startMockServer([{ json: message([{ type: "text", text: "Hi" }]) }]);
    const reply = await provider(server.url, { temperature: 0, maxTokens: 512 }).chat({
      system: "Be brief.",
      messages: USER,
      tools: TOOLS,
    });
    expect(reply).toMatchObject({ text: "Hi", toolCalls: [], stopReason: "end" });
    expect(reply.usage).toEqual({ inputTokens: 10, outputTokens: 5 });

    const req = server.requests[0];
    expect(req?.url).toBe("/v1/messages");
    expect(req?.headers["x-api-key"]).toBe("k-secret");
    expect(req?.headers["anthropic-version"]).toBe("2023-06-01");
    expect(req?.body).toMatchObject({
      model: "claude-test",
      max_tokens: 512,
      temperature: 0,
      system: "Be brief.",
      stream: false,
      messages: [{ role: "user", content: [{ type: "text", text: "cut at 3" }] }],
      tools: [{ name: "split", description: "Cut at a time.", input_schema: TOOLS[0]?.parameters }],
    });
  });

  it("defaults max_tokens and omits temperature and empty tools", async () => {
    server = await startMockServer([{ json: message([{ type: "text", text: "Hi" }]) }]);
    await provider(server.url).chat({ system: "s", messages: USER, tools: [] });
    expect(server.requests[0]?.body).toMatchObject({ max_tokens: 4096 });
    expect(server.requests[0]?.body).not.toHaveProperty("temperature");
    expect(server.requests[0]?.body).not.toHaveProperty("tools");
  });

  it("returns tool_use blocks as tool calls with object arguments", async () => {
    server = await startMockServer([
      {
        json: message(
          [
            { type: "text", text: "Cutting." },
            { type: "tool_use", id: "toolu_1", name: "split", input: { at: 3 } },
          ],
          { stop_reason: "tool_use" },
        ),
      },
    ]);
    const reply = await provider(server.url).chat({ system: "s", messages: USER, tools: TOOLS });
    expect(reply.text).toBe("Cutting.");
    expect(reply.toolCalls).toEqual([{ id: "toolu_1", name: "split", arguments: { at: 3 } }]);
    expect(reply.stopReason).toBe("tool_use");
  });

  it("ignores thinking blocks and maps max_tokens to length", async () => {
    server = await startMockServer([
      {
        json: message(
          [
            { type: "thinking", thinking: "hmm", signature: "x" },
            { type: "text", text: "A" },
          ],
          {
            stop_reason: "max_tokens",
          },
        ),
      },
    ]);
    const reply = await provider(server.url).chat({ system: "s", messages: USER, tools: [] });
    expect(reply.text).toBe("A");
    expect(reply.stopReason).toBe("length");
  });

  it("counts prompt-cache tokens as input", async () => {
    server = await startMockServer([
      {
        json: message([{ type: "text", text: "A" }], {
          usage: {
            input_tokens: 5,
            cache_creation_input_tokens: 100,
            cache_read_input_tokens: 20,
            output_tokens: 7,
          },
        }),
      },
    ]);
    const reply = await provider(server.url).chat({ system: "s", messages: USER, tools: [] });
    expect(reply.usage).toEqual({ inputTokens: 125, outputTokens: 7 });
  });

  it("groups consecutive tool results into one user message, tool_result first", async () => {
    server = await startMockServer([{ json: message([{ type: "text", text: "ok" }]) }]);
    const messages: ChatMessage[] = [
      { role: "user", content: "do two things" },
      {
        role: "assistant",
        text: "On it.",
        toolCalls: [
          { id: "t1", name: "split", arguments: { at: 1 } },
          { id: "t2", name: "split", arguments: "{'at': 2" },
        ],
      },
      { role: "tool", toolCallId: "t1", name: "split", content: "Split at 1s.", isError: false },
      { role: "tool", toolCallId: "t2", name: "split", content: "bad", isError: true },
      { role: "user", content: "thanks, now undo" },
    ];
    await provider(server.url).chat({ system: "s", messages, tools: TOOLS });
    const body = server.requests[0]?.body as { messages: { role: string; content: unknown[] }[] };
    const sent = body.messages;
    expect(sent.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(sent[1]?.content).toEqual([
      { type: "text", text: "On it." },
      { type: "tool_use", id: "t1", name: "split", input: { at: 1 } },
      { type: "tool_use", id: "t2", name: "split", input: {} },
    ]);
    expect(sent[2]?.content).toEqual([
      { type: "tool_result", tool_use_id: "t1", content: "Split at 1s.", is_error: false },
      { type: "tool_result", tool_use_id: "t2", content: "bad", is_error: true },
      { type: "text", text: "thanks, now undo" },
    ]);
  });

  it("streams text and tool input, and reports usage from both ends of the stream", async () => {
    const ev = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}`;
    server = await startMockServer([
      {
        sse: [
          ev("message_start", {
            type: "message_start",
            message: { usage: { input_tokens: 40, output_tokens: 1 } },
          }),
          "event: ping\ndata: {}",
          ev("content_block_start", {
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" },
          }),
          ev("content_block_delta", {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "Cut" },
          }),
          ev("content_block_delta", {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "ting." },
          }),
          ev("content_block_start", {
            type: "content_block_start",
            index: 1,
            content_block: { type: "tool_use", id: "toolu_9", name: "split", input: {} },
          }),
          ev("content_block_delta", {
            type: "content_block_delta",
            index: 1,
            delta: { type: "input_json_delta", partial_json: '{"at"' },
          }),
          ev("content_block_delta", {
            type: "content_block_delta",
            index: 1,
            delta: { type: "input_json_delta", partial_json: ": 3}" },
          }),
          ev("message_delta", {
            type: "message_delta",
            delta: { stop_reason: "tool_use" },
            usage: { output_tokens: 22 },
          }),
          ev("message_stop", { type: "message_stop" }),
        ],
      },
    ]);
    const deltas: string[] = [];
    const reply = await provider(server.url).chat({
      system: "s",
      messages: USER,
      tools: TOOLS,
      onTextDelta: (d) => deltas.push(d),
    });
    expect(deltas).toEqual(["Cut", "ting."]);
    expect(reply.text).toBe("Cutting.");
    expect(reply.toolCalls).toEqual([{ id: "toolu_9", name: "split", arguments: '{"at": 3}' }]);
    expect(reply.usage).toEqual({ inputTokens: 40, outputTokens: 22 });
    expect(reply.stopReason).toBe("tool_use");
    expect(server.requests[0]?.body).toMatchObject({ stream: true });
  });

  it("surfaces an error event in a stream", async () => {
    server = await startMockServer([
      {
        sse: [
          `event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } })}`,
        ],
      },
    ]);
    await expect(
      provider(server.url).chat({ system: "s", messages: USER, tools: [], onTextDelta: () => {} }),
    ).rejects.toThrow(/Overloaded/);
  });

  it("explains HTTP errors without leaking the key", async () => {
    server = await startMockServer([
      {
        status: 401,
        json: {
          type: "error",
          error: { type: "authentication_error", message: "invalid x-api-key" },
        },
      },
    ]);
    const err = await provider(server.url)
      .chat({ system: "s", messages: USER, tools: [] })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.message).toContain("invalid x-api-key");
    expect(err.message).not.toContain("k-secret");
  });

  it("retries an overloaded (529) reply", async () => {
    server = await startMockServer([
      { status: 529, json: { error: { message: "Overloaded" } } },
      { json: message([{ type: "text", text: "fine" }]) },
    ]);
    const reply = await provider(server.url).chat({ system: "s", messages: USER, tools: [] });
    expect(reply.text).toBe("fine");
    expect(server.requests).toHaveLength(2);
  });

  it("rejects a reply of the wrong shape", async () => {
    server = await startMockServer([{ json: { nope: true } }]);
    await expect(
      provider(server.url).chat({ system: "s", messages: USER, tools: [] }),
    ).rejects.toThrow(/unexpected reply/);
  });
});
