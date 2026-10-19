// The provider-neutral vocabulary of the agent: messages, tool calls and the AgentProvider interface.
// Pure types. Nothing here knows about HTTP, a vendor, or the editing engine.

/** A tool as offered to a model: a name, a description and a JSON Schema for its arguments. */
export interface ToolDefinition {
  /** snake_case tool name. For editing tools it is the command name in `COMMANDS`. */
  name: string;
  /** What the tool does, written for a language model. */
  description: string;
  /** JSON Schema (draft 7) of the arguments object. */
  parameters: Record<string, unknown>;
}

/**
 * One tool call requested by a model.
 *
 * `arguments` is whatever the provider received: a parsed object (Anthropic), or the raw JSON text
 * (OpenAI-compatible APIs, where small models often produce slightly broken JSON). A string means
 * "not parsed yet": the agent loop parses and, if needed, repairs it.
 */
export interface ToolCall {
  /** Id that the matching `tool` message refers to. Unique within one assistant message. */
  id: string;
  name: string;
  arguments: unknown;
}

/**
 * One message of the conversation, in a shape every provider can translate to and from.
 * There is no `system` role: the system prompt is passed separately.
 */
export type ChatMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      /** What the model said. May be empty when it only called tools. */
      text: string;
      toolCalls: ToolCall[];
    }
  | {
      /** The result of one tool call. Providers that need it group consecutive results. */
      role: "tool";
      toolCallId: string;
      name: string;
      /** Text shown to the model: a summary or an error message. */
      content: string;
      isError: boolean;
    };

/** Token counts for one model round trip, as reported by the backend (never estimated). */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Why the model stopped: `end` it finished its answer, `tool_use` it wants tools run,
 * `length` it hit the output limit (a tool call may be cut off), `other` anything else
 * (content filter, refusal, unknown).
 */
export type StopReason = "end" | "tool_use" | "length" | "other";

/** Everything a provider needs for one model round trip. */
export interface ProviderRequest {
  /** The system prompt. */
  system: string;
  messages: ChatMessage[];
  /** Tools the model may call. Empty means no tools are offered. */
  tools: ToolDefinition[];
  /** Aborting must make `chat` reject promptly. */
  signal?: AbortSignal;
  /**
   * If set, the provider streams and calls this with each piece of text as it arrives.
   * The final {@link ProviderResponse} is complete either way.
   */
  onTextDelta?: (delta: string) => void;
}

/** What one model round trip produced. */
export interface ProviderResponse {
  /** The text the model wrote, possibly empty. */
  text: string;
  /** Tool calls the model made through the provider's native mechanism. */
  toolCalls: ToolCall[];
  /** Absent when the backend does not report usage. */
  usage?: TokenUsage;
  stopReason: StopReason;
}

/**
 * One model round trip. Implementations: the OpenAI-compatible and Anthropic providers in this
 * package, and {@link ScriptedProvider} for tests. A provider is stateless between calls.
 */
export interface AgentProvider {
  /** Short label for logs and reports, e.g. `openai-compatible` or `anthropic`. */
  readonly name: string;
  /**
   * Send the conversation and return the model's reply.
   * Rejects with a {@link ProviderError} for HTTP and network problems, and with an `AbortError`
   * when `req.signal` is aborted.
   */
  chat(req: ProviderRequest): Promise<ProviderResponse>;
}
