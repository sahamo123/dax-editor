// Turns Claude Code's `--output-format stream-json` lines into the chat events the UI understands.
// The stream carries many event types we do not need (rate limits, summaries, hooks); unknown types are ignored,
// so a new CLI version adds noise but never breaks a run. Field names come from a recorded real run
// (test/fixtures/claude-hello.jsonl) and the CLI's documented message blocks.

import type { AgentEvent } from "@dax/protocol";
import { MCP_SERVER_NAME, MCP_TOOL_PREFIX } from "./command.js";

/** What the CLI reported about itself when the run started. */
interface InitInfo {
  /** Claude Code's own session id, usable with `--resume` for the next message. */
  sessionId?: string;
  /** Model the CLI selected. */
  model?: string;
  /** Status the CLI gave our MCP server: `connected`, `pending`, `failed`, `needs-auth`, `disabled`, or undefined when it is not listed. */
  mcpStatus?: string;
  /** Where the CLI got an API key from (`none` when it uses a subscription login). */
  apiKeySource?: string;
  /** True when the CLI says it will bill an API key instead of a subscription. */
  usesApiKey: boolean;
}

/** The final `result` event, reduced to what we use. */
interface ResultInfo {
  /** True when the run failed. */
  isError: boolean;
  /** Claude Code's session id. */
  sessionId?: string;
  /** Agent turns used. */
  turns: number;
  /** Names of tools the CLI refused to run (already restricted by the allow-list). */
  deniedTools: string[];
}

/** What {@link ClaudeEventMapper.handle} found in one line. */
export interface MappedLine {
  /** Chat events to forward, in order. */
  events: AgentEvent[];
  /** Set for the `system/init` line. */
  init?: InitInfo;
  /** Set for the final `result` line. */
  result?: ResultInfo;
}

/** Longest tool-result summary shown in the chat. The full data stays in the project history. */
const MAX_SUMMARY = 240;

/** Treat a value as a plain object, or undefined. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** A finite number, or undefined. */
function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** `mcp__dax__smart_cut` becomes `smart_cut`; other names are shown as they are. */
export function displayToolName(name: string): string {
  return name.startsWith(MCP_TOOL_PREFIX) ? name.slice(MCP_TOOL_PREFIX.length) : name;
}

/** Text of a tool result block: a string, or the text parts of a content list. */
function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    const rec = asRecord(part);
    if (rec?.type === "text" && typeof rec.text === "string") parts.push(rec.text);
  }
  return parts.join("\n");
}

/**
 * Our MCP server answers `summary\n{compact json}`. The chat wants the summary: the first line, trimmed and shortened.
 * Failures keep a little more of the message because that is what the user needs to read.
 */
function summarize(text: string, ok: boolean): string {
  let trimmed = text.trim();
  // The CLI may hand over our structured answer (`{"summary": "...", "data": {...}}`) instead of the text form.
  if (ok && trimmed.startsWith("{")) {
    try {
      const summary = asRecord(JSON.parse(trimmed))?.summary;
      if (typeof summary === "string") trimmed = summary.trim();
    } catch {
      // Not JSON after all: use the text as it is.
    }
  }
  if (trimmed === "") return ok ? "Done." : "Failed.";
  const first = ok ? (trimmed.split("\n", 1)[0] ?? trimmed) : trimmed;
  return first.length > MAX_SUMMARY ? `${first.slice(0, MAX_SUMMARY - 1)}…` : first;
}

/** Signs in the result text that mean the CLI is not signed in (or its login expired). */
const SIGN_IN_PROBLEM =
  /not logged in|please run \/login|invalid api key|authentication[_ ]error|oauth token has (expired|been revoked)|credentials? (are|is) (missing|invalid)/i;

/** Message shown when the CLI says it is not signed in. */
const SIGN_IN_HINT =
  "Claude Code is not signed in, or its login expired. Run `claude` once in a terminal to sign in, then try again.";

/** Turn a failed `result` line into a message a person can act on. */
function failureMessage(result: Record<string, unknown>): string {
  const text = typeof result.result === "string" ? result.result.trim() : "";
  const subtype = typeof result.subtype === "string" ? result.subtype : "";
  const turns = asNumber(result.num_turns);
  if (SIGN_IN_PROBLEM.test(text)) return SIGN_IN_HINT;
  if (subtype === "error_max_turns") {
    return `I stopped after ${turns ?? "the maximum number of"} steps. Your edits so far are kept; you can undo them or ask me to continue.`;
  }
  if (subtype === "error_max_budget_usd") {
    return "I stopped because this request reached its spending limit. Your edits so far are kept; you can undo them.";
  }
  if (text !== "") return text.length > 500 ? `${text.slice(0, 499)}…` : text;
  return "Claude Code reported an error and stopped. Your edits so far are kept; you can undo them.";
}

/**
 * Stateful translator for one run's stdout lines. Create one per run and feed it every parsed JSON line in order.
 *
 * - Text arrives as streamed deltas; when deltas were seen for a message, the complete `assistant` copy is skipped so
 *   nothing is shown twice. Without partial messages the complete text is used instead.
 * - A `tool_use` block becomes a `tool_call` once, however many times the CLI repeats the message.
 * - A `tool_result` block becomes a `tool_result` carrying the name of the call it answers.
 * - The `result` line ends the run with `done` or `error`.
 */
export class ClaudeEventMapper {
  private readonly toolNames = new Map<string, string>();
  private readonly announcedTools = new Set<string>();
  private readonly streamedMessages = new Set<string>();
  private readonly shownBlocks = new Set<string>();
  private lastTextMessage: string | undefined;

  /** Translate one parsed line. Unknown or malformed lines produce no events. */
  handle(raw: unknown): MappedLine {
    const line = asRecord(raw);
    if (!line) return { events: [] };
    // Output from sub-agents is not part of this conversation.
    if (line.parent_tool_use_id !== undefined && line.parent_tool_use_id !== null) {
      return { events: [] };
    }
    switch (line.type) {
      case "system":
        return this.system(line);
      case "stream_event":
        return { events: this.streamEvent(line) };
      case "assistant":
        return { events: this.assistant(line) };
      case "user":
        return { events: this.user(line) };
      case "result":
        return this.result(line);
      default:
        return { events: [] };
    }
  }

  private system(line: Record<string, unknown>): MappedLine {
    if (line.subtype !== "init") return { events: [] };
    const servers = Array.isArray(line.mcp_servers) ? line.mcp_servers : [];
    const ours = servers.map(asRecord).find((s) => s?.name === MCP_SERVER_NAME);
    const apiKeySource = typeof line.apiKeySource === "string" ? line.apiKeySource : undefined;
    const init: InitInfo = {
      ...(typeof line.session_id === "string" ? { sessionId: line.session_id } : {}),
      ...(typeof line.model === "string" ? { model: line.model } : {}),
      ...(typeof ours?.status === "string" ? { mcpStatus: ours.status } : {}),
      ...(apiKeySource !== undefined ? { apiKeySource } : {}),
      // "none" and login-based values mean a subscription; anything naming an API key or key helper is billed per use.
      usesApiKey: apiKeySource !== undefined && /api[_ ]?key/i.test(apiKeySource),
    };
    const text = init.usesApiKey
      ? "Claude Code is working on it (it is using an API key, so usage is billed to that key)..."
      : "Claude Code is working on it...";
    return { events: [{ type: "status", text }], init };
  }

  private streamEvent(line: Record<string, unknown>): AgentEvent[] {
    const event = asRecord(line.event);
    if (event?.type !== "content_block_delta") return [];
    const delta = asRecord(event.delta);
    if (delta?.type !== "text_delta" || typeof delta.text !== "string" || delta.text === "") {
      return [];
    }
    const messageId = typeof line.api_message_id === "string" ? line.api_message_id : "stream";
    this.streamedMessages.add(messageId);
    return [{ type: "text", text: this.separated(messageId, delta.text) }];
  }

  /** Put a paragraph break between the texts of two different assistant messages. */
  private separated(messageId: string, text: string): string {
    const needsBreak = this.lastTextMessage !== undefined && this.lastTextMessage !== messageId;
    this.lastTextMessage = messageId;
    return needsBreak ? `\n\n${text}` : text;
  }

  private assistant(line: Record<string, unknown>): AgentEvent[] {
    const message = asRecord(line.message);
    const content = Array.isArray(message?.content) ? message.content : [];
    const messageId = typeof message?.id === "string" ? message.id : "message";
    const out: AgentEvent[] = [];
    for (const block of content) {
      const rec = asRecord(block);
      if (!rec) continue;
      if (rec.type === "text" && typeof rec.text === "string") {
        const key = `${messageId}|${rec.text}`;
        // Streamed deltas already showed this text.
        if (this.streamedMessages.has(messageId) || this.shownBlocks.has(key) || rec.text === "") {
          continue;
        }
        this.shownBlocks.add(key);
        out.push({ type: "text", text: this.separated(messageId, rec.text) });
      } else if (rec.type === "tool_use" && typeof rec.id === "string") {
        if (this.announcedTools.has(rec.id)) continue;
        this.announcedTools.add(rec.id);
        const name = typeof rec.name === "string" ? rec.name : "unknown";
        this.toolNames.set(rec.id, name);
        out.push({
          type: "tool_call",
          id: rec.id,
          name: displayToolName(name),
          args: rec.input ?? {},
        });
      }
    }
    return out;
  }

  private user(line: Record<string, unknown>): AgentEvent[] {
    const message = asRecord(line.message);
    const content = Array.isArray(message?.content) ? message.content : [];
    const out: AgentEvent[] = [];
    for (const block of content) {
      const rec = asRecord(block);
      if (rec?.type !== "tool_result" || typeof rec.tool_use_id !== "string") continue;
      const ok = rec.is_error !== true;
      const name = this.toolNames.get(rec.tool_use_id) ?? "unknown";
      out.push({
        type: "tool_result",
        id: rec.tool_use_id,
        name: displayToolName(name),
        ok,
        summary: summarize(toolResultText(rec.content), ok),
      });
    }
    return out;
  }

  private result(line: Record<string, unknown>): MappedLine {
    const isError = line.is_error === true;
    const turns = asNumber(line.num_turns) ?? 0;
    const denials = Array.isArray(line.permission_denials) ? line.permission_denials : [];
    const deniedTools = denials
      .map((d) => asRecord(d)?.tool_name)
      .filter((n): n is string => typeof n === "string");
    const result: ResultInfo = {
      isError,
      turns,
      deniedTools,
      ...(typeof line.session_id === "string" ? { sessionId: line.session_id } : {}),
    };
    if (isError) {
      return { events: [{ type: "error", message: failureMessage(line) }], result };
    }
    const usage = asRecord(line.usage);
    // Cached input is still input the model read; adding it shows the real size of the conversation.
    const input =
      (asNumber(usage?.input_tokens) ?? 0) +
      (asNumber(usage?.cache_read_input_tokens) ?? 0) +
      (asNumber(usage?.cache_creation_input_tokens) ?? 0);
    const output = asNumber(usage?.output_tokens);
    const done: AgentEvent = {
      type: "done",
      turns,
      ...(usage && input > 0 ? { inputTokens: input } : {}),
      ...(output !== undefined ? { outputTokens: output } : {}),
    };
    return { events: [done], result };
  }
}
