// Provider for the Anthropic Messages API: POST {baseUrl}/v1/messages with `tools` and `tool_use` blocks.
// Plain fetch, no SDK.

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

/** Settings for {@link createAnthropicProvider}. */
export interface AnthropicProviderOptions extends HttpOptions {
  /** Model id to request. */
  model: string;
  /** Sent as the `x-api-key` header. Never logged. */
  apiKey: string;
  /** API origin. Default `https://api.anthropic.com`. Change it for a proxy or a test server. */
  baseUrl?: string;
  /** Maximum reply tokens (required by the API). Default 4096. */
  maxTokens?: number;
  /** Sampling temperature. Omit to use the API default (some newer models reject other values). */
  temperature?: number;
  /** Value of the `anthropic-version` header. Default `2023-06-01`. */
  version?: string;
}

const UsageSchema = z
  .object({
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
    cache_creation_input_tokens: z.number().nullish(),
    cache_read_input_tokens: z.number().nullish(),
  })
  .nullish();
type Usage = z.infer<typeof UsageSchema>;

const MessageSchema = z.object({
  content: z.array(
    z.union([
      z.object({ type: z.literal("text"), text: z.string() }),
      z.object({
        type: z.literal("tool_use"),
        id: z.string(),
        name: z.string(),
        input: z.unknown(),
      }),
      z.object({ type: z.string() }).passthrough(), // thinking blocks and anything newer
    ]),
  ),
  stop_reason: z.string().nullish(),
  usage: UsageSchema,
});

function mapStop(reason: string | null | undefined): StopReason {
  if (reason === "tool_use") return "tool_use";
  if (reason === "max_tokens") return "length";
  if (reason === "end_turn" || reason === "stop_sequence" || !reason) return "end";
  return "other";
}

/** Input tokens include prompt-cache reads and writes, which are real input the model processed. */
function mapUsage(inputSide: Usage, outputSide: Usage): TokenUsage | undefined {
  if (inputSide?.input_tokens === undefined && outputSide?.output_tokens === undefined) {
    return undefined;
  }
  return {
    inputTokens:
      (inputSide?.input_tokens ?? 0) +
      (inputSide?.cache_creation_input_tokens ?? 0) +
      (inputSide?.cache_read_input_tokens ?? 0),
    outputTokens: outputSide?.output_tokens ?? inputSide?.output_tokens ?? 0,
  };
}

/** A tool call's arguments must be a JSON object for `tool_use.input`; anything else is sent as `{}`. */
function inputObject(args: unknown): Record<string, unknown> {
  if (typeof args === "string") {
    try {
      const parsed: unknown = JSON.parse(args);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // unparseable text cannot be represented; the tool_result already carries the error
    }
    return {};
  }
  if (typeof args === "object" && args !== null && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  return {};
}

/**
 * Translate the neutral conversation into Anthropic messages. Consecutive tool results become one
 * user message of `tool_result` blocks (required by the API), placed before any following user text.
 */
function toAnthropicMessages(messages: ChatMessage[]): unknown[] {
  const out: { role: "user" | "assistant"; content: unknown[] }[] = [];
  const push = (role: "user" | "assistant", block: unknown) => {
    const last = out[out.length - 1];
    if (last && last.role === role) last.content.push(block);
    else out.push({ role, content: [block] });
  };
  for (const m of messages) {
    if (m.role === "user") {
      push("user", { type: "text", text: m.content });
    } else if (m.role === "tool") {
      push("user", {
        type: "tool_result",
        tool_use_id: m.toolCallId,
        content: m.content,
        is_error: m.isError,
      });
    } else {
      if (m.text !== "") push("assistant", { type: "text", text: m.text });
      for (const c of m.toolCalls) {
        push("assistant", {
          type: "tool_use",
          id: c.id,
          name: c.name,
          input: inputObject(c.arguments),
        });
      }
      if (m.text === "" && m.toolCalls.length === 0) {
        push("assistant", { type: "text", text: "(no reply)" });
      }
    }
  }
  // tool_result blocks must come first inside a user message.
  for (const msg of out) {
    msg.content.sort(
      (a, b) =>
        Number((b as { type: string }).type === "tool_result") -
        Number((a as { type: string }).type === "tool_result"),
    );
  }
  return out;
}

/**
 * Create a provider for the Anthropic Messages API.
 * When the request has `onTextDelta` the call streams server-sent events; otherwise it is a single
 * JSON reply. Token usage includes prompt-cache tokens.
 * Errors: {@link ProviderError} with a readable message (HTTP errors, unreachable server, bad reply).
 */
export function createAnthropicProvider(options: AnthropicProviderOptions): AgentProvider {
  const url = `${(options.baseUrl ?? "https://api.anthropic.com").replace(/\/+$/, "")}/v1/messages`;
  const label = "Anthropic API";
  const headers = {
    "x-api-key": options.apiKey,
    "anthropic-version": options.version ?? "2023-06-01",
  };

  return {
    name: "anthropic",
    async chat(req: ProviderRequest): Promise<ProviderResponse> {
      const stream = req.onTextDelta !== undefined;
      const body: Record<string, unknown> = {
        model: options.model,
        max_tokens: options.maxTokens ?? 4096,
        system: req.system,
        messages: toAnthropicMessages(req.messages),
        stream,
      };
      if (req.tools.length > 0) {
        body.tools = req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        }));
      }
      if (options.temperature !== undefined) body.temperature = options.temperature;

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
            : parseMessage(await readJson(res, label)),
      });
    },
  };
}

function parseMessage(json: unknown): ProviderResponse {
  const parsed = MessageSchema.safeParse(json);
  if (!parsed.success) {
    throw new ProviderError(
      `Anthropic API returned an unexpected reply (${parsed.error.issues[0]?.message ?? "bad shape"}): ${JSON.stringify(json).slice(0, 200)}`,
    );
  }
  let text = "";
  const toolCalls: ToolCall[] = [];
  for (const block of parsed.data.content) {
    if (block.type === "text" && "text" in block && typeof block.text === "string") {
      text += block.text;
    } else if (block.type === "tool_use" && "id" in block && "name" in block) {
      toolCalls.push({
        id: String(block.id),
        name: String(block.name),
        arguments: "input" in block ? (block.input ?? {}) : {},
      });
    }
  }
  const response: ProviderResponse = {
    text,
    toolCalls,
    stopReason: mapStop(parsed.data.stop_reason),
  };
  const usage = mapUsage(parsed.data.usage, parsed.data.usage);
  if (usage) response.usage = usage;
  return response;
}

async function readStream(
  res: Response,
  onTextDelta: (d: string) => void,
): Promise<ProviderResponse> {
  let text = "";
  let stop: string | null | undefined;
  let startUsage: Usage;
  let endUsage: Usage;
  const blocks = new Map<number, { id: string; name: string; json: string; seed: unknown }>();

  for await (const ev of readSse(res)) {
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(ev.data) as Record<string, unknown>;
    } catch {
      throw new ProviderError(`Anthropic API sent a broken stream event: ${ev.data.slice(0, 200)}`);
    }
    const type = ev.event ?? json.type;
    if (type === "error") {
      const message = (json.error as { message?: unknown } | undefined)?.message;
      throw new ProviderError(
        `Anthropic API: ${typeof message === "string" ? message : ev.data.slice(0, 200)}`,
      );
    } else if (type === "message_start") {
      startUsage = UsageSchema.parse((json.message as { usage?: unknown } | undefined)?.usage);
    } else if (type === "content_block_start") {
      const block = json.content_block as Record<string, unknown> | undefined;
      if (block?.type === "tool_use") {
        blocks.set(Number(json.index), {
          id: String(block.id ?? ""),
          name: String(block.name ?? ""),
          json: "",
          seed: block.input,
        });
      }
    } else if (type === "content_block_delta") {
      const delta = json.delta as Record<string, unknown> | undefined;
      if (delta?.type === "text_delta" && typeof delta.text === "string") {
        text += delta.text;
        onTextDelta(delta.text);
      } else if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
        const block = blocks.get(Number(json.index));
        if (block) block.json += delta.partial_json;
      }
    } else if (type === "message_delta") {
      const delta = json.delta as { stop_reason?: string | null } | undefined;
      if (delta?.stop_reason) stop = delta.stop_reason;
      endUsage = UsageSchema.parse(json.usage);
    }
  }

  const toolCalls: ToolCall[] = [...blocks.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, b]) => ({
      id: b.id,
      name: b.name,
      arguments: b.json !== "" ? b.json : (b.seed ?? {}),
    }));
  const response: ProviderResponse = { text, toolCalls, stopReason: mapStop(stop) };
  const usage = mapUsage(startUsage, endUsage ?? startUsage);
  if (usage) response.usage = usage;
  return response;
}
