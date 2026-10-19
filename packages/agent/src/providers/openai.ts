// Provider for OpenAI-compatible chat APIs: POST {baseUrl}/chat/completions with `tools`. Covers llama.cpp
// llama-server, Ollama, LM Studio, OpenAI, OpenRouter and Gemini's compatibility endpoint. Plain fetch, no SDK.

import { z } from "zod";
import type {
  AgentProvider,
  ChatMessage,
  ProviderRequest,
  ProviderResponse,
  StopReason,
  TokenUsage,
  ToolCall,
} from "../types.js";
import { type HttpOptions, ProviderError, postJson, readJson, readSse } from "./http.js";

/** Settings for {@link createOpenAiProvider}. */
export interface OpenAiProviderOptions extends HttpOptions {
  /** API root including the version path, e.g. `http://127.0.0.1:8080/v1` or `https://api.openai.com/v1`. A trailing slash is fine. */
  baseUrl: string;
  /** Model name to request. Local servers that host one model usually ignore it. */
  model: string;
  /** Sent as `Authorization: Bearer`. Omit for local servers. Never logged. */
  apiKey?: string;
  /** Sampling temperature. Omit to use the server default (some hosted reasoning models reject any other value). */
  temperature?: number;
  /** Maximum reply tokens (`max_tokens`). Omit to use the server default. */
  maxTokens?: number;
  /** Extra HTTP headers, e.g. OpenRouter's `HTTP-Referer`. */
  headers?: Record<string, string>;
  /** Extra top-level body fields, e.g. `{ chat_template_kwargs: { enable_thinking: false } }`. They override the fields this provider sets. */
  extraBody?: Record<string, unknown>;
}

const ToolCallSchema = z.object({
  id: z.string().nullish(),
  function: z.object({
    name: z.string(),
    arguments: z.union([z.string(), z.record(z.unknown()), z.null()]).optional(),
  }),
});

const ContentSchema = z.union([
  z.string(),
  z.null(),
  z.array(z.object({ type: z.string().optional(), text: z.string().optional() })),
]);

const CompletionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: ContentSchema.optional(),
          tool_calls: z.array(ToolCallSchema).nullish(),
        }),
        finish_reason: z.string().nullish(),
      }),
    )
    .min(1),
  usage: z
    .object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional() })
    .nullish(),
});

const ChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z
          .object({
            content: z.union([z.string(), z.null()]).optional(),
            tool_calls: z
              .array(
                z.object({
                  index: z.number().optional(),
                  id: z.string().nullish(),
                  function: z
                    .object({
                      name: z.string().nullish(),
                      arguments: z.union([z.string(), z.record(z.unknown()), z.null()]).optional(),
                    })
                    .optional(),
                }),
              )
              .nullish(),
          })
          .optional(),
        finish_reason: z.string().nullish(),
      }),
    )
    .optional(),
  usage: z
    .object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional() })
    .nullish(),
});

function mapFinish(reason: string | null | undefined, hasCalls: boolean): StopReason {
  if (reason === "tool_calls" || reason === "function_call") return "tool_use";
  if (reason === "length") return "length";
  if (reason === "stop" || reason === null || reason === undefined) {
    return hasCalls ? "tool_use" : "end";
  }
  return "other";
}

function mapUsage(
  u:
    | { prompt_tokens?: number | undefined; completion_tokens?: number | undefined }
    | null
    | undefined,
): TokenUsage | undefined {
  if (!u || (u.prompt_tokens === undefined && u.completion_tokens === undefined)) return undefined;
  return { inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0 };
}

function argumentsText(args: unknown): string {
  if (typeof args === "string") return args;
  return JSON.stringify(args ?? {});
}

/** Translate the neutral conversation into OpenAI chat messages. */
function toOpenAiMessages(system: string, messages: ChatMessage[]): unknown[] {
  const out: unknown[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      const msg: Record<string, unknown> = {
        role: "assistant",
        content: m.text === "" && m.toolCalls.length > 0 ? null : m.text,
      };
      if (m.toolCalls.length > 0) {
        msg.tool_calls = m.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: argumentsText(c.arguments) },
        }));
      }
      out.push(msg);
    } else {
      out.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
    }
  }
  return out;
}

function contentText(content: z.infer<typeof ContentSchema> | undefined): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p) => p.text ?? "").join("");
  return "";
}

function toolCallsFrom(raw: z.infer<typeof ToolCallSchema>[] | null | undefined): ToolCall[] {
  return (raw ?? []).map((c, i) => ({
    id: c.id || `call_${i + 1}`,
    name: c.function.name,
    // Left as text on purpose: the agent loop parses and repairs it, and counts bad JSON honestly.
    arguments: c.function.arguments ?? "{}",
  }));
}

/**
 * Create a provider for any server that speaks the OpenAI chat-completions protocol with tools.
 * When the request has `onTextDelta` the call streams (with `stream_options.include_usage`);
 * otherwise it is a single JSON reply.
 * Errors: {@link ProviderError} with a readable message for unreachable servers, HTTP errors
 * and replies that are not valid chat completions.
 */
export function createOpenAiProvider(options: OpenAiProviderOptions): AgentProvider {
  const url = `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const label = "OpenAI-compatible server";
  const headers: Record<string, string> = { ...options.headers };
  if (options.apiKey) headers.authorization = `Bearer ${options.apiKey}`;

  return {
    name: "openai-compatible",
    async chat(req: ProviderRequest): Promise<ProviderResponse> {
      const stream = req.onTextDelta !== undefined;
      const body: Record<string, unknown> = {
        model: options.model,
        messages: toOpenAiMessages(req.system, req.messages),
        stream,
      };
      if (req.tools.length > 0) {
        body.tools = req.tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }));
        body.tool_choice = "auto";
      }
      if (options.temperature !== undefined) body.temperature = options.temperature;
      if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
      if (stream) body.stream_options = { include_usage: true };
      Object.assign(body, options.extraBody);

      return postJson({
        url,
        headers,
        body,
        signal: req.signal,
        label,
        http: options,
        read: async (res) =>
          stream && req.onTextDelta
            ? readStream(res, req.onTextDelta)
            : parseCompletion(await readJson(res, label)),
      });
    },
  };
}

function parseCompletion(json: unknown): ProviderResponse {
  const parsed = CompletionSchema.safeParse(json);
  if (!parsed.success) {
    throw new ProviderError(
      `OpenAI-compatible server returned an unexpected reply (${parsed.error.issues[0]?.message ?? "bad shape"}): ${JSON.stringify(json).slice(0, 200)}`,
    );
  }
  const choice = parsed.data.choices[0];
  if (!choice) throw new ProviderError("OpenAI-compatible server returned no choices.");
  const toolCalls = toolCallsFrom(choice.message.tool_calls);
  const response: ProviderResponse = {
    text: contentText(choice.message.content),
    toolCalls,
    stopReason: mapFinish(choice.finish_reason, toolCalls.length > 0),
  };
  const usage = mapUsage(parsed.data.usage);
  if (usage) response.usage = usage;
  return response;
}

async function readStream(
  res: Response,
  onTextDelta: (d: string) => void,
): Promise<ProviderResponse> {
  let text = "";
  let finish: string | null | undefined;
  let usage: TokenUsage | undefined;
  const calls = new Map<number, { id: string; name: string; args: string }>();

  for await (const ev of readSse(res)) {
    if (ev.data.trim() === "[DONE]") break;
    let json: unknown;
    try {
      json = JSON.parse(ev.data);
    } catch {
      throw new ProviderError(
        `OpenAI-compatible server sent a broken stream chunk: ${ev.data.slice(0, 200)}`,
      );
    }
    const errorMessage = (json as { error?: { message?: unknown } }).error?.message;
    if (typeof errorMessage === "string")
      throw new ProviderError(`OpenAI-compatible server: ${errorMessage}`);
    const chunk = ChunkSchema.safeParse(json);
    if (!chunk.success) continue;
    usage = mapUsage(chunk.data.usage) ?? usage;
    const choice = chunk.data.choices?.[0];
    if (!choice) continue;
    if (choice.finish_reason) finish = choice.finish_reason;
    const delta = choice.delta;
    if (delta?.content) {
      text += delta.content;
      onTextDelta(delta.content);
    }
    for (const [position, tc] of (delta?.tool_calls ?? []).entries()) {
      const index = tc.index ?? position;
      const entry = calls.get(index) ?? { id: "", name: "", args: "" };
      if (tc.id) entry.id = tc.id;
      if (tc.function?.name) entry.name += tc.function.name;
      if (tc.function?.arguments !== undefined && tc.function.arguments !== null) {
        entry.args += argumentsText(tc.function.arguments);
      }
      calls.set(index, entry);
    }
  }

  const toolCalls: ToolCall[] = [...calls.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, c], i) => ({ id: c.id || `call_${i + 1}`, name: c.name, arguments: c.args || "{}" }));
  const response: ProviderResponse = {
    text,
    toolCalls,
    stopReason: mapFinish(finish, toolCalls.length > 0),
  };
  if (usage) response.usage = usage;
  return response;
}
