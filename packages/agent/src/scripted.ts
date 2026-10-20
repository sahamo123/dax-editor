// A provider that replays prepared replies. Used by tests (here, in evals and in the server) so that agent
// behaviour can be checked without a model or a network.

import type { AgentProvider, ProviderRequest, ProviderResponse } from "./types.js";

/**
 * One scripted reply: a (partial) response, a function that computes one from the request, or an
 * `Error` to reject with. Omitted fields default to empty text, no tool calls and a stop reason
 * of `tool_use` when there are tool calls and `end` otherwise.
 */
export type ScriptedStep =
  | Partial<ProviderResponse>
  | Error
  | ((req: ProviderRequest) => Partial<ProviderResponse> | Promise<Partial<ProviderResponse>>);

/**
 * Replays {@link ScriptedStep}s in order, one per `chat` call. It records what it was asked in
 * {@link ScriptedProvider.requests}. Running out of steps rejects, so a test that loops forever
 * fails loudly instead of hanging.
 */
export class ScriptedProvider implements AgentProvider {
  readonly name = "scripted";
  /** A copy of every request received, oldest first. Messages are cloned, so later edits do not change them. */
  readonly requests: ProviderRequest[] = [];
  private next = 0;

  constructor(private readonly steps: ScriptedStep[]) {}

  /** Replay the next step. Rejects with the step's error, or if no steps are left. */
  async chat(req: ProviderRequest): Promise<ProviderResponse> {
    this.requests.push({ ...req, messages: structuredClone(req.messages) });
    const step = this.steps[this.next++];
    if (step === undefined) {
      throw new Error(
        `ScriptedProvider has no step ${this.next} (it was given ${this.steps.length})`,
      );
    }
    if (step instanceof Error) throw step;
    const reply = typeof step === "function" ? await step(req) : step;
    const toolCalls = reply.toolCalls ?? [];
    const response: ProviderResponse = {
      text: reply.text ?? "",
      toolCalls,
      stopReason: reply.stopReason ?? (toolCalls.length > 0 ? "tool_use" : "end"),
    };
    if (reply.usage) response.usage = reply.usage;
    // Pretend to stream: static replies arrive as one delta. Function steps may call onTextDelta themselves.
    if (typeof step !== "function" && response.text !== "") req.onTextDelta?.(response.text);
    return response;
  }
}
