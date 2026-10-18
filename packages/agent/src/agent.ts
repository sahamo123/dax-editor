// The agent loop: ask the model, run the tool calls it makes against the command registry, feed results and
// errors back, and stop when it answers without tools. Provider-neutral; all reliability features for small
// models live here. Never calls anything but the injected provider and the registry (source "ai").

import {
  type CommandResult,
  commandTools,
  getCommand,
  type Session,
  type ToolSpec,
  type Transcriber,
} from "@dax/core";
import type { AgentEvent } from "@dax/protocol";
import { buildSystemPrompt } from "./prompt.js";
import { extractTextToolCalls, stripThinking } from "./text-tool-calls.js";
import { interpretArguments, registryNames, runToolCall, type ToolOutcome } from "./tool-runner.js";
import { type ToolStyle, toToolDefinition } from "./tools.js";
import type { AgentProvider, ChatMessage, ToolCall, ToolDefinition } from "./types.js";

/** Settings for {@link createAgent}. Everything except `provider` has a default. */
export interface CreateAgentOptions {
  /** The model to talk to. */
  provider: AgentProvider;
  /** Commands offered to the model. Default: every command from `commandTools()`. Each must exist in the registry. */
  tools?: ToolSpec[];
  /** How tools are described to the model. Default `"full"`; use `"compact"` for small local models. */
  toolStyle?: ToolStyle;
  /** Replaces the default system prompt ({@link DEFAULT_SYSTEM_PROMPT}). The notes about export and per-request guidance are still appended. */
  systemPrompt?: string;
  /** Model round trips allowed per run. Default 8. */
  maxTurns?: number;
  /** Tool calls executed per model reply; the rest are refused with a message. Default 8. */
  maxToolCallsPerTurn?: number;
  /** Stop the run when the same call has failed this many times in a row. Default 3. */
  maxRepeatedFailures?: number;
  /** Offer irreversible commands such as `export_video`. Default false: they are removed from the tools and refused if called. */
  allowIrreversible?: boolean;
  /** Recover tool calls the model wrote as text (`<tool_call>`, fenced JSON, ...). Default true. */
  textToolCalls?: boolean;
  /**
   * Called with the user's message before each run; the returned text is added to the system prompt
   * as guidance for this request only (for example relevant skill documents). The agent does not
   * know where it comes from. A failure is reported as a `status` event and the run continues without it.
   */
  contextProvider?: (message: string) => string | undefined | Promise<string | undefined>;
  /** Stream the model's text as it arrives (many small `text` events) instead of one event per reply. Default false. */
  streamText?: boolean;
  /** A tool result longer than this many characters is cut. Default 6000. */
  maxToolResultChars?: number;
  /** When the conversation is longer than this many characters, results of older tool calls are shortened. Default 60000. */
  maxContextChars?: number;
}

/** Per-run inputs for {@link Agent.run}. */
export interface AgentRunOptions {
  /** The project to edit. Edits are recorded in its history with source `ai`. */
  session: Session;
  /** Earlier messages of this conversation: pass the `messages` returned by the previous run. */
  history?: ChatMessage[];
  /** Receives every `AgentEvent` (from `@dax/protocol`) in order. Must not throw. */
  onEvent?: (event: AgentEvent) => void;
  /** Aborting stops the run as soon as the current model call or tool call returns. */
  signal?: AbortSignal;
  /** If set, imports and exports are limited to these folders. */
  allowedRoots?: string[];
  /** Speech-to-text engine the transcribe and cut commands use. Omit when none is installed. */
  transcriber?: Transcriber;
  /** Overrides the agent's `maxTurns` for this run. */
  maxTurns?: number;
}

/** Why a run ended. */
export type StopCause = "done" | "cancelled" | "max_turns" | "repeated_failure" | "error";

/**
 * Counts of the tool calls the model made in a run. `invalid` counts calls that could not be run
 * because the call itself was wrong (unreadable, unknown tool, bad arguments), not commands that
 * ran and reported a problem (`failed`). `repaired` calls had broken JSON or wrongly typed values
 * fixed and are counted as valid; `fromText` calls were written as text, not through the API.
 */
export interface ToolCallStats {
  total: number;
  invalid: number;
  failed: number;
  repaired: number;
  fromText: number;
  /** Calls refused because the model made more than `maxToolCallsPerTurn` in one reply. */
  skipped: number;
}

/** The outcome of one {@link Agent.run}. */
export interface AgentRunResult {
  stopReason: StopCause;
  /** The model's final answer, or `""` if the run did not end with one. */
  text: string;
  /** Model round trips used. */
  turns: number;
  toolCalls: ToolCallStats;
  /** Sum of the token counts the provider reported. Only meaningful when `usageComplete`. */
  inputTokens: number;
  outputTokens: number;
  /** True only if the provider reported usage for every round trip, so the sums are exact. */
  usageComplete: boolean;
  /** Set when `stopReason` is `error`: what went wrong. */
  error?: string;
  /** The whole conversation including this run; pass it as `history` to the next run. */
  messages: ChatMessage[];
}

/** A configured agent. */
export interface Agent {
  /**
   * Turn a chat message into edits. Resolves (never rejects for model or tool problems) with how the
   * run ended; failures are also emitted as `error` events. Exactly one of a `done` or `error`
   * event is the last event.
   */
  run(message: string, options: AgentRunOptions): Promise<AgentRunResult>;
}

const DEFAULTS = {
  maxTurns: 8,
  maxToolCallsPerTurn: 8,
  maxRepeatedFailures: 3,
  maxToolResultChars: 6000,
  maxContextChars: 60_000,
} as const;

const NUDGE = "Please tell the user, in one or two short sentences, what you did.";

/** Create an agent around a provider. Throws if `tools` names something that is not a registry command. */
export function createAgent(options: CreateAgentOptions): Agent {
  const allowIrreversible = options.allowIrreversible ?? false;
  const specs = (options.tools ?? commandTools()).filter(
    (t) => allowIrreversible || !t.irreversible,
  );
  for (const spec of specs) {
    if (!getCommand(spec.name)) {
      throw new Error(`Tool "${spec.name}" is not a command in the @dax/core registry`);
    }
  }
  const available = new Map(specs.map((s) => [s.name, s]));
  const definitions: ToolDefinition[] = specs.map((s) => toToolDefinition(s, options.toolStyle));
  const knownNames = [...new Set([...registryNames(), ...available.keys()])];

  return {
    async run(message, run) {
      return new Loop(options, run, { available, definitions, knownNames, allowIrreversible }).go(
        message,
      );
    },
  };
}

interface Prepared {
  available: ReadonlyMap<string, ToolSpec>;
  definitions: ToolDefinition[];
  knownNames: string[];
  allowIrreversible: boolean;
}

/** State and steps of a single run. A class only to avoid passing a dozen values between helpers. */
class Loop {
  private messages: ChatMessage[] = [];
  private turns = 0;
  private callCounter = 0;
  private inputTokens = 0;
  private outputTokens = 0;
  private usageTurns = 0;
  private ranTools = false;
  private nudged = false;
  private finalText = "";
  private readonly stats: ToolCallStats = {
    total: 0,
    invalid: 0,
    failed: 0,
    repaired: 0,
    fromText: 0,
    skipped: 0,
  };
  /** Consecutive failures per distinct call (name + arguments). */
  private readonly failures = new Map<string, number>();
  private readonly maxTurns: number;
  private readonly cap: number;
  private readonly repeatLimit: number;

  constructor(
    private readonly options: CreateAgentOptions,
    private readonly run: AgentRunOptions,
    private readonly prepared: Prepared,
  ) {
    this.maxTurns = run.maxTurns ?? options.maxTurns ?? DEFAULTS.maxTurns;
    this.cap = options.maxToolCallsPerTurn ?? DEFAULTS.maxToolCallsPerTurn;
    this.repeatLimit = options.maxRepeatedFailures ?? DEFAULTS.maxRepeatedFailures;
  }

  private emit(event: AgentEvent): void {
    this.run.onEvent?.(event);
  }

  async go(message: string): Promise<AgentRunResult> {
    this.messages = [...(this.run.history ?? []), { role: "user", content: message }];
    const system = buildSystemPrompt({
      ...(this.options.systemPrompt !== undefined ? { base: this.options.systemPrompt } : {}),
      allowIrreversible: this.prepared.allowIrreversible,
      ...(await this.loadContext(message)),
    });

    for (;;) {
      if (this.run.signal?.aborted) return this.finish("cancelled");
      if (this.turns >= this.maxTurns) return this.finish("max_turns");
      this.turns++;
      this.emit({ type: "status", text: "Thinking..." });

      const streamer = this.options.streamText
        ? new TextStreamer((t) => this.emit({ type: "text", text: t }))
        : undefined;
      let response: Awaited<ReturnType<AgentProvider["chat"]>>;
      try {
        response = await this.options.provider.chat({
          system,
          messages: this.shortenOldResults(),
          tools: this.prepared.definitions,
          ...(this.run.signal ? { signal: this.run.signal } : {}),
          ...(streamer ? { onTextDelta: (d: string) => streamer.push(d) } : {}),
        });
      } catch (err) {
        if (this.run.signal?.aborted) return this.finish("cancelled");
        return this.finish("error", err instanceof Error ? err.message : String(err));
      }
      if (response.usage) {
        this.inputTokens += response.usage.inputTokens;
        this.outputTokens += response.usage.outputTokens;
        this.usageTurns++;
      }

      let text = stripThinking(response.text);
      let calls: { id?: string; name: string; arguments: unknown }[] = response.toolCalls;
      if (calls.length === 0 && this.options.textToolCalls !== false) {
        const found = extractTextToolCalls(text, this.prepared.knownNames);
        if (found.calls.length > 0) {
          calls = found.calls;
          text = found.text;
          this.stats.fromText += found.calls.length;
        }
      }
      const toolCalls = this.withIds(calls);

      if (toolCalls.length === 0) {
        if (text === "" && this.ranTools && !this.nudged) {
          // Small models often stop silently after the last tool call; ask once for the summary.
          this.nudged = true;
          this.messages.push({ role: "user", content: NUDGE });
          continue;
        }
        this.messages.push({ role: "assistant", text, toolCalls: [] });
        (streamer ?? new TextStreamer((t) => this.emit({ type: "text", text: t }))).finish(text);
        this.finalText = text;
        return this.finish("done");
      }

      this.messages.push({ role: "assistant", text, toolCalls });
      (streamer ?? new TextStreamer((t) => this.emit({ type: "text", text: t }))).finish(text);
      const stopped = await this.runCalls(toolCalls, response.stopReason === "length");
      if (stopped) return this.finish(stopped.cause, stopped.message);
    }
  }

  /** Ask the contextProvider for guidance; a failure is reported but never stops the run. */
  private async loadContext(message: string): Promise<{ context?: string }> {
    if (!this.options.contextProvider) return {};
    try {
      const context = await this.options.contextProvider(message);
      return context ? { context } : {};
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      this.emit({ type: "status", text: `Could not load extra guidance: ${why}` });
      return {};
    }
  }

  /** Give every call a unique, non-empty id (some local servers send none, or repeat ids). */
  private withIds(calls: { id?: string; name: string; arguments: unknown }[]): ToolCall[] {
    const seen = new Set<string>();
    return calls.map((c) => {
      let id = c.id ?? "";
      while (id === "" || seen.has(id) || this.idUsed(id)) id = `call_${++this.callCounter}`;
      seen.add(id);
      return { id, name: c.name, arguments: c.arguments };
    });
  }

  private idUsed(id: string): boolean {
    return this.messages.some(
      (m) => m.role === "assistant" && m.toolCalls.some((c) => c.id === id),
    );
  }

  /**
   * Run one reply's tool calls in order and record their results. Returns a stop request when the
   * run must end (cancelled, or the same call failed too many times).
   */
  private async runCalls(
    calls: ToolCall[],
    truncated: boolean,
  ): Promise<{ cause: StopCause; message?: string } | undefined> {
    this.ranTools = true;
    let repeated: string | undefined;
    for (const [index, call] of calls.entries()) {
      this.stats.total++;
      if (this.run.signal?.aborted) {
        this.addResult(call, "Not run: the user cancelled.", true);
        continue;
      }
      if (index >= this.cap) {
        this.stats.skipped++;
        this.emit({ type: "tool_call", id: call.id, name: call.name, args: call.arguments });
        const note = `Not run: too many tool calls in one step (limit ${this.cap}). Make at most ${this.cap} calls at a time and call the rest in your next step.`;
        this.emit({ type: "tool_result", id: call.id, name: call.name, ok: false, summary: note });
        this.addResult(call, note, true);
        continue;
      }

      // Announce the call before it runs: some commands (silence detection, export) take a while.
      const announced = interpretArguments(call.arguments);
      this.emit({
        type: "tool_call",
        id: call.id,
        name: call.name,
        args: announced.ok ? announced.value : call.arguments,
      });
      const outcome = await runToolCall(
        {
          session: this.run.session,
          allowedRoots: this.run.allowedRoots,
          transcriber: this.run.transcriber,
          available: this.prepared.available,
        },
        call,
        truncated,
      );
      // Keep the cleaned-up arguments in the history: models imitate what they see there, and
      // some APIs need a JSON object. Unreadable arguments stay as they were.
      if (
        typeof outcome.args === "object" &&
        outcome.args !== null &&
        !Array.isArray(outcome.args)
      ) {
        call.arguments = outcome.args;
      }
      const { content, ok, summary } = this.describe(outcome);
      this.count(outcome);

      let toModel = content;
      if (!ok) {
        const key = `${call.name}:${canonical(outcome.args)}`;
        const n = (this.failures.get(key) ?? 0) + 1;
        this.failures.set(key, n);
        if (n >= this.repeatLimit) repeated ??= `${call.name} ${canonical(outcome.args)}`;
        else if (n >= 2) {
          toModel +=
            "\nYou already tried exactly this and it failed. Change the arguments, use a different tool, or tell the user what is blocking you.";
        }
      } else {
        this.failures.delete(`${call.name}:${canonical(outcome.args)}`);
      }
      this.emit({ type: "tool_result", id: call.id, name: call.name, ok, summary });
      this.addResult(call, toModel, !ok);
    }

    if (this.run.signal?.aborted) return { cause: "cancelled" };
    if (repeated) {
      return {
        cause: "repeated_failure",
        message: `I stopped because the same step kept failing (${repeated.slice(0, 120)}). Your edits so far are kept; you can undo them.`,
      };
    }
    return undefined;
  }

  private count(outcome: ToolOutcome): void {
    if (outcome.repaired) this.stats.repaired++;
    if (outcome.kind === "invalid") this.stats.invalid++;
    else if (outcome.kind === "failed") this.stats.failed++;
  }

  /** The text for the model, whether it counts as success, and the short summary for the UI. */
  private describe(outcome: ToolOutcome): { content: string; ok: boolean; summary: string } {
    if (outcome.kind === "ok") {
      return { content: this.resultText(outcome), ok: true, summary: outcome.summary };
    }
    return { content: outcome.error, ok: false, summary: outcome.error };
  }

  private resultText(r: CommandResult): string {
    if (r.data === undefined) return r.summary;
    const max = this.options.maxToolResultChars ?? DEFAULTS.maxToolResultChars;
    const json = JSON.stringify(r.data);
    const body =
      json.length > max
        ? `${json.slice(0, max)}... [${json.length - max} more characters cut]`
        : json;
    return `${r.summary}\n${body}`;
  }

  private addResult(call: ToolCall, content: string, isError: boolean): void {
    this.messages.push({ role: "tool", toolCallId: call.id, name: call.name, content, isError });
  }

  /**
   * The messages to send. When the conversation is long, results of tool calls before the last two
   * model replies are shortened (the project can always be re-read with get_project).
   */
  private shortenOldResults(): ChatMessage[] {
    const limit = this.options.maxContextChars ?? DEFAULTS.maxContextChars;
    const size = this.messages.reduce(
      (n, m) =>
        n +
        (m.role === "user"
          ? m.content.length
          : m.role === "tool"
            ? m.content.length
            : m.text.length + 40 * m.toolCalls.length),
      0,
    );
    if (size <= limit) return this.messages;
    const assistants = this.messages.flatMap((m, i) => (m.role === "assistant" ? [i] : []));
    const keepFrom = assistants[Math.max(0, assistants.length - 2)] ?? 0;
    return this.messages.map((m, i) =>
      m.role === "tool" && i < keepFrom && m.content.length > 200
        ? { ...m, content: `${m.content.slice(0, 200)}... [older result shortened]` }
        : m,
    );
  }

  /** Close the run: tidy the history, emit the last event and build the result. */
  private finish(cause: StopCause, errorMessage?: string): AgentRunResult {
    const last = this.messages[this.messages.length - 1];
    if (cause !== "done" && last?.role !== "assistant") {
      // Keep the history well formed (user and assistant alternate) and tell the model what happened next time.
      this.messages.push({
        role: "assistant",
        text: closingNote(cause, errorMessage),
        toolCalls: [],
      });
    }

    const reported = this.usageTurns > 0;
    const doneEvent: AgentEvent = { type: "done", turns: this.turns };
    if (reported) {
      doneEvent.inputTokens = this.inputTokens;
      doneEvent.outputTokens = this.outputTokens;
    }
    if (cause === "done") {
      this.emit(doneEvent);
    } else if (cause === "cancelled") {
      this.emit({ type: "status", text: "Cancelled." });
      this.emit(doneEvent);
    } else if (cause === "max_turns") {
      this.emit({
        type: "error",
        message: `I stopped after ${this.maxTurns} steps without finishing. Your edits so far are kept; you can undo them or ask me to continue.`,
      });
    } else {
      this.emit({ type: "error", message: errorMessage ?? "The assistant stopped unexpectedly." });
    }

    const result: AgentRunResult = {
      stopReason: cause,
      text: this.finalText,
      turns: this.turns,
      toolCalls: this.stats,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      usageComplete: this.turns > 0 && this.usageTurns === this.turns,
      messages: this.messages,
    };
    if (cause === "error" && errorMessage) result.error = errorMessage;
    return result;
  }
}

function closingNote(cause: StopCause, message: string | undefined): string {
  switch (cause) {
    case "cancelled":
      return "(The user cancelled this request.)";
    case "max_turns":
      return "(Stopped: too many steps without finishing.)";
    case "repeated_failure":
      return "(Stopped: the same step kept failing.)";
    default:
      return `(The request failed: ${message ?? "unknown error"})`;
  }
}

/** Stable text for an arguments value, so identical calls compare equal whatever the key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Forwards streamed text to `text` events without leaking tool calls the model writes as text:
 * output stops at the first character that could start one (`<`, a backtick, `{` or `[`) and the
 * rest is released by {@link TextStreamer.finish} once the final, cleaned text is known.
 */
class TextStreamer {
  private raw = "";
  private emitted = "";

  constructor(private readonly send: (text: string) => void) {}

  push(delta: string): void {
    this.raw += delta;
    const base = this.raw.trimStart();
    const marker = base.search(/[<`{[]/);
    const safe = (marker === -1 ? base : base.slice(0, marker)).trimEnd();
    if (safe.length > this.emitted.length) {
      this.send(safe.slice(this.emitted.length));
      this.emitted = safe;
    }
  }

  /** Emit whatever part of the final text has not been sent yet. */
  finish(finalText: string): void {
    const rest = finalText.startsWith(this.emitted) ? finalText.slice(this.emitted.length) : "";
    if (rest !== "") this.send(rest);
    else if (this.emitted === "" && finalText !== "") this.send(finalText);
  }
}
