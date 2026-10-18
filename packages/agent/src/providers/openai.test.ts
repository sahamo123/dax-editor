import { afterEach, describe, expect, it } from "vitest";
import { type MockServer, startMockServer } from "../mock-server.test-util.js";
import type { ChatMessage, ToolDefinition } from "../types.js";
import { ProviderError } from "./http.js";
import { createOpenAiProvider } from "./openai.js";

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

const completion = (message: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  choices: [{ message, finish_reason: "stop" }],
  ...extra,
});

describe("OpenAI-compatible provider", () => {
  it("posts to /chat/completions with system prompt, tools and bearer key", async () => {
    server = await startMockServer([{ json: completion({ content: "Hello" }) }]);
    const provider = createOpenAiProvider({
      baseUrl: `${server.url}/v1/`,
      model: "m1",
      apiKey: "sk-secret",
      temperature: 0,
      maxTokens: 256,
      ...FAST,
    });
    const reply = await provider.chat({ system: "Be brief.", messages: USER, tools: TOOLS });

    expect(reply).toMatchObject({ text: "Hello", toolCalls: [], stopReason: "end" });
    const req = server.requests[0];
    expect(req?.method).toBe("POST");
    expect(req?.url).toBe("/v1/chat/completions");
    expect(req?.headers.authorization).toBe("Bearer sk-secret");
    expect(req?.body).toMatchObject({
      model: "m1",
      stream: false,
      temperature: 0,
      max_tokens: 256,
      tool_choice: "auto",
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "cut at 3" },
      ],
      tools: [{ type: "function", function: { name: "split", description: "Cut at a time." } }],
    });
  });

  it("sends no Authorization header without an api key and omits unset options and empty tools", async () => {
    server = await startMockServer([{ json: completion({ content: "ok" }) }]);
    const provider = createOpenAiProvider({ baseUrl: server.url, model: "m", ...FAST });
    await provider.chat({ system: "s", messages: USER, tools: [] });
    const req = server.requests[0];
    expect(req?.headers.authorization).toBeUndefined();
    expect(req?.url).toBe("/chat/completions");
    expect(req?.body).not.toHaveProperty("tools");
    expect(req?.body).not.toHaveProperty("temperature");
    expect(req?.body).not.toHaveProperty("max_tokens");
  });

  it("merges extraBody and extra headers", async () => {
    server = await startMockServer([{ json: completion({ content: "ok" }) }]);
    const provider = createOpenAiProvider({
      baseUrl: server.url,
      model: "m",
      headers: { "x-title": "dax" },
      extraBody: { chat_template_kwargs: { enable_thinking: false } },
      ...FAST,
    });
    await provider.chat({ system: "s", messages: USER, tools: [] });
    expect(server.requests[0]?.headers["x-title"]).toBe("dax");
    expect(server.requests[0]?.body).toMatchObject({
      chat_template_kwargs: { enable_thinking: false },
    });
  });

  it("returns tool calls with their argument text untouched, plus usage", async () => {
    server = await startMockServer([
      {
        json: completion(
          {
            content: null,
            tool_calls: [
              {
                id: "call_9",
                type: "function",
                function: { name: "split", arguments: "{'at': 3,}" },
              },
            ],
          },
          { usage: { prompt_tokens: 120, completion_tokens: 15 } },
        ),
      },
    ]);
    const provider = createOpenAiProvider({ baseUrl: server.url, model: "m", ...FAST });
    const reply = await provider.chat({ system: "s", messages: USER, tools: TOOLS });
    expect(reply.toolCalls).toEqual([{ id: "call_9", name: "split", arguments: "{'at': 3,}" }]);
    expect(reply.usage).toEqual({ inputTokens: 120, outputTokens: 15 });
    expect(reply.stopReason).toBe("tool_use");
  });

  it("gives ids to tool calls from servers that send none, and accepts object arguments", async () => {
    server = await startMockServer([
      {
        json: completion({
          tool_calls: [
            { function: { name: "split", arguments: { at: 1 } } },
            { id: "", function: { name: "split", arguments: '{"at": 2}' } },
          ],
        }),
      },
    ]);
    const provider = createOpenAiProvider({ baseUrl: server.url, model: "m", ...FAST });
    const reply = await provider.chat({ system: "s", messages: USER, tools: TOOLS });
    expect(reply.toolCalls.map((c) => c.id)).toEqual(["call_1", "call_2"]);
    expect(reply.toolCalls[0]?.arguments).toEqual({ at: 1 });
  });

  it("reports usage as absent when the server does not send it, and maps finish reasons", async () => {
    server = await startMockServer([
      { json: { choices: [{ message: { content: "cut o" }, finish_reason: "length" }] } },
    ]);
    const provider = createOpenAiProvider({ baseUrl: server.url, model: "m", ...FAST });
    const reply = await provider.chat({ system: "s", messages: USER, tools: [] });
    expect(reply.usage).toBeUndefined();
    expect(reply.stopReason).toBe("length");
  });

  it("accepts content given as a list of parts", async () => {
    server = await startMockServer([
      {
        json: completion({
          content: [
            { type: "text", text: "Hel" },
            { type: "text", text: "lo" },
          ],
        }),
      },
    ]);
    const provider = createOpenAiProvider({ baseUrl: server.url, model: "m", ...FAST });
    expect((await provider.chat({ system: "s", messages: USER, tools: [] })).text).toBe("Hello");
  });

  it("sends assistant tool calls and tool results back in OpenAI shape", async () => {
    server = await startMockServer([{ json: completion({ content: "Done." }) }]);
    const provider = createOpenAiProvider({ baseUrl: server.url, model: "m", ...FAST });
    const messages: ChatMessage[] = [
      { role: "user", content: "cut at 3" },
      {
        role: "assistant",
        text: "",
        toolCalls: [{ id: "c1", name: "split", arguments: { at: 3 } }],
      },
      { role: "tool", toolCallId: "c1", name: "split", content: "Split at 3s.", isError: false },
    ];
    await provider.chat({ system: "s", messages, tools: TOOLS });
    const body = server.requests[0]?.body as { messages: unknown[] };
    const sent = body.messages;
    expect(sent[2]).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "c1", type: "function", function: { name: "split", arguments: '{"at":3}' } },
      ],
    });
    expect(sent[3]).toEqual({ role: "tool", tool_call_id: "c1", content: "Split at 3s." });
  });

  it("streams text and tool calls, and asks for usage", async () => {
    const chunk = (delta: unknown, finish: string | null = null) =>
      `data: ${JSON.stringify({ choices: [{ delta, finish_reason: finish }] })}`;
    server = await startMockServer([
      {
        sse: [
          chunk({ role: "assistant", content: "Cut" }),
          chunk({ content: "ting." }),
          chunk({ tool_calls: [{ index: 0, id: "c1", function: { name: "spl", arguments: "" } }] }),
          chunk({ tool_calls: [{ index: 0, function: { name: "it", arguments: '{"at"' } }] }),
          chunk({ tool_calls: [{ index: 0, function: { arguments: ": 3}" } }] }, "tool_calls"),
          `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 50, completion_tokens: 9 } })}`,
          "data: [DONE]",
        ],
      },
    ]);
    const provider = createOpenAiProvider({ baseUrl: server.url, model: "m", ...FAST });
    const deltas: string[] = [];
    const reply = await provider.chat({
      system: "s",
      messages: USER,
      tools: TOOLS,
      onTextDelta: (d) => deltas.push(d),
    });
    expect(deltas).toEqual(["Cut", "ting."]);
    expect(reply.text).toBe("Cutting.");
    expect(reply.toolCalls).toEqual([{ id: "c1", name: "split", arguments: '{"at": 3}' }]);
    expect(reply.usage).toEqual({ inputTokens: 50, outputTokens: 9 });
    expect(reply.stopReason).toBe("tool_use");
    expect(server.requests[0]?.body).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    });
  });

  it("explains an unreachable server", async () => {
    // Open a port, note its number, close it: nothing listens there any more.
    const closed = await startMockServer([{}]);
    const deadUrl = closed.url;
    await closed.close();
    const provider = createOpenAiProvider({ baseUrl: `${deadUrl}/v1`, model: "m", ...FAST });
    const err = await provider.chat({ system: "s", messages: USER, tools: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.message).toContain(`Could not reach OpenAI-compatible server at ${deadUrl}`);
    expect(err.message).toMatch(/ECONNREFUSED/);
  });

  it("turns an HTTP error into a readable message without echoing the key", async () => {
    server = await startMockServer([
      { status: 401, json: { error: { message: "Incorrect API key provided" } } },
    ]);
    const provider = createOpenAiProvider({
      baseUrl: server.url,
      model: "m",
      apiKey: "sk-very-secret",
      ...FAST,
    });
    const err = await provider.chat({ system: "s", messages: USER, tools: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.status).toBe(401);
    expect(err.message).toContain("Incorrect API key provided");
    expect(err.message).toContain("Check the API key");
    expect(err.message).not.toContain("sk-very-secret");
  });

  it("retries a 503 and then succeeds", async () => {
    server = await startMockServer([
      { status: 503, text: "loading model" },
      { json: completion({ content: "ready" }) },
    ]);
    const provider = createOpenAiProvider({ baseUrl: server.url, model: "m", ...FAST });
    const reply = await provider.chat({ system: "s", messages: USER, tools: [] });
    expect(reply.text).toBe("ready");
    expect(server.requests).toHaveLength(2);
  });

  it("gives up after the retries and does not retry a 400", async () => {
    server = await startMockServer([{ status: 500, text: "boom" }]);
    const provider = createOpenAiProvider({
      baseUrl: server.url,
      model: "m",
      ...FAST,
      maxRetries: 1,
    });
    await expect(provider.chat({ system: "s", messages: USER, tools: [] })).rejects.toThrow(
      /HTTP 500/,
    );
    expect(server.requests).toHaveLength(2);
    await server.close();

    server = await startMockServer([{ status: 400, json: { error: { message: "bad request" } } }]);
    const p2 = createOpenAiProvider({ baseUrl: server.url, model: "m", ...FAST });
    await expect(p2.chat({ system: "s", messages: USER, tools: [] })).rejects.toThrow(
      /bad request/,
    );
    expect(server.requests).toHaveLength(1);
  });

  it("rejects a reply that is not a chat completion", async () => {
    server = await startMockServer([{ json: { hello: "world" } }, { text: "<html>nope</html>" }]);
    const provider = createOpenAiProvider({ baseUrl: server.url, model: "m", ...FAST });
    await expect(provider.chat({ system: "s", messages: USER, tools: [] })).rejects.toThrow(
      /unexpected reply/,
    );
    await expect(provider.chat({ system: "s", messages: USER, tools: [] })).rejects.toThrow(
      /not JSON/,
    );
  });

  it("times out a server that never answers", async () => {
    server = await startMockServer([{ hang: true }]);
    const provider = createOpenAiProvider({
      baseUrl: server.url,
      model: "m",
      timeoutMs: 80,
      maxRetries: 0,
    });
    await expect(provider.chat({ system: "s", messages: USER, tools: [] })).rejects.toThrow(
      /did not answer within/,
    );
  });

  it("rejects with the abort reason when the signal is aborted", async () => {
    server = await startMockServer([{ hang: true }]);
    const provider = createOpenAiProvider({ baseUrl: server.url, model: "m", ...FAST });
    const controller = new AbortController();
    const pending = provider
      .chat({ system: "s", messages: USER, tools: [], signal: controller.signal })
      .catch((e) => e);
    setTimeout(() => controller.abort(), 30);
    const err = await pending;
    expect(err).not.toBeInstanceOf(ProviderError);
    expect((err as Error).name).toBe("AbortError");
  });
});
