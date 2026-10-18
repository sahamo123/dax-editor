// A ModelAdapter built on @dax/agent: any provider (OpenAI-compatible server, Anthropic, scripted) can be scored
// on the eval tasks through the same agent loop the product uses. Reports tokens and invalid tool calls as
// the backend and the loop observed them; it never estimates.

import { type Agent, type AgentProvider, createAgent, type ToolStyle } from "@dax/agent";
import type { AgentContext, AgentResult, ModelAdapter } from "./runner.js";

/** Settings for {@link AgentAdapter}. */
export interface AgentAdapterOptions {
  /** Stable name used in reports, e.g. `openai:qwen2.5-7b`. */
  id: string;
  /** The model to evaluate. */
  provider: AgentProvider;
  /** How tools are described to the model. Default `"full"`. */
  toolStyle?: ToolStyle;
  /** Replaces the agent's default system prompt, to evaluate a prompt change. */
  systemPrompt?: string;
}

/**
 * Attempts each task by running the agent loop on the task's prompt against the task's session.
 *
 * Accounting, so results can be compared fairly:
 * - `toolCalls.total` counts every tool call the model made, `invalid` those that could not run
 *   because the call itself was wrong (unreadable, unknown tool, bad arguments). Calls with broken
 *   JSON that the agent repaired count as valid and are counted in `repaired`; calls recovered from
 *   text in `fromText`; commands that ran and reported a problem in `failed`.
 * - Token counts are what the backend reported. If it did not report usage for every round trip, no
 *   token counts are recorded at all (an undercount would look like a cheap model).
 * - A provider failure (server unreachable, HTTP error) or a cancellation throws, so the runner
 *   records an `error` for the task instead of a quiet failure.
 */
export class AgentAdapter implements ModelAdapter {
  readonly id: string;
  private readonly agent: Agent;

  constructor(options: AgentAdapterOptions) {
    this.id = options.id;
    this.agent = createAgent({
      provider: options.provider,
      ...(options.toolStyle !== undefined ? { toolStyle: options.toolStyle } : {}),
      ...(options.systemPrompt !== undefined ? { systemPrompt: options.systemPrompt } : {}),
    });
  }

  /** Run the agent on `ctx.task.prompt` with the task's turn limit. Throws if the provider failed. */
  async run(ctx: AgentContext): Promise<AgentResult> {
    const result = await this.agent.run(ctx.task.prompt, {
      session: ctx.session,
      maxTurns: ctx.task.maxTurns,
    });
    if (result.stopReason === "error" || result.stopReason === "cancelled") {
      throw new Error(result.error ?? `agent run ${result.stopReason}`);
    }
    const out: AgentResult = {
      turns: result.turns,
      toolCalls: {
        total: result.toolCalls.total,
        invalid: result.toolCalls.invalid,
        failed: result.toolCalls.failed,
        repaired: result.toolCalls.repaired,
        fromText: result.toolCalls.fromText,
      },
    };
    if (result.usageComplete) {
      out.inputTokens = result.inputTokens;
      out.outputTokens = result.outputTokens;
    }
    return out;
  }
}
