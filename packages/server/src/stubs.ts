// Stand-ins for the injected interfaces: the defaults used when the launcher injects nothing, and the scripted runner tests drive.
// None of these touches the network or starts a process.

import { tryRunCommand } from "@dax/core";
import { type AgentEvent, PROVIDER_KINDS, type ProviderStatus } from "@dax/protocol";
import type {
  AgentRunContext,
  AgentRunner,
  LocalModelController,
  LocalModelStatus,
  ProviderRegistry,
} from "./interfaces.js";

/** A provider registry that reports every provider as unavailable. The default when no registry is injected, and the one tests use. */
export class NullProviderRegistry implements ProviderRegistry {
  /** One unavailable entry per provider kind. */
  async list(): Promise<ProviderStatus[]> {
    return PROVIDER_KINDS.map((kind) => ({
      kind,
      available: false,
      detail: "No AI provider backend is installed in this build",
    }));
  }
}

/** A local-model controller for builds without a local runtime: reports "not available" and refuses to install or start. */
export class NullLocalModelController implements LocalModelController {
  /** Always "not installed, not running". */
  async status(): Promise<LocalModelStatus> {
    return {
      installed: false,
      running: false,
      detail: "Local model support is not available in this build",
    };
  }
  /** Always throws; there is nothing to install. */
  async install(): Promise<void> {
    throw new Error("Local model support is not available in this build");
  }
  /** Always throws; there is nothing to start. */
  async start(): Promise<void> {
    throw new Error("Local model support is not available in this build");
  }
  /** Does nothing: stopping a model that cannot run is a no-op. */
  async stop(): Promise<void> {}
}

/** The runner used when none is injected: tells the user how to get AI working instead of failing mysteriously. */
export class NoRunner implements AgentRunner {
  /** Emits one `error` event. */
  async run(_message: string, ctx: AgentRunContext): Promise<void> {
    ctx.onEvent({
      type: "error",
      message: "No AI provider is available. Choose one in Settings, or edit by hand.",
    });
  }
}

/** One step of a {@link ScriptedRunner} script. */
export type ScriptStep =
  /** Emit this event to the UI. */
  | AgentEvent
  /** Pause for `ms` milliseconds (ends early if cancelled). */
  | { type: "wait"; ms: number }
  /** Run a registry command on the session as the AI (source `ai`) and emit matching `tool_call` / `tool_result` events. */
  | { type: "run_command"; name: string; args?: Record<string, unknown> }
  /** Block until the run is cancelled, then continue. Used to test cancel and the `busy` flag. */
  | { type: "until_aborted" }
  /** Make the run reject with this message. */
  | { type: "throw"; message: string };

/** A script, or a function that builds one from the user's message. */
export type Script = ScriptStep[] | ((message: string) => ScriptStep[]);

/**
 * A deterministic {@link AgentRunner} for tests: plays back a script of events and commands.
 * After the script it emits `done` unless the script already ended with `done` or `error`.
 * Every message it receives is kept in {@link ScriptedRunner.messages}.
 */
export class ScriptedRunner implements AgentRunner {
  /** Messages received, oldest first. */
  readonly messages: string[] = [];
  private nextId = 0;

  constructor(private readonly script: Script = [{ type: "text", text: "ok" }]) {}

  /** Play the script. Rejects if a `throw` step runs. */
  async run(message: string, ctx: AgentRunContext): Promise<void> {
    this.messages.push(message);
    const steps = typeof this.script === "function" ? this.script(message) : this.script;
    let terminal = false;
    for (const step of steps) {
      if (ctx.signal.aborted && step.type !== "done" && step.type !== "error") return;
      switch (step.type) {
        case "wait":
          await sleep(step.ms, ctx.signal);
          break;
        case "until_aborted":
          await sleep(Number.POSITIVE_INFINITY, ctx.signal);
          break;
        case "throw":
          throw new Error(step.message);
        case "run_command": {
          const id = `call_${++this.nextId}`;
          ctx.onEvent({ type: "tool_call", id, name: step.name, args: step.args ?? {} });
          const out = await tryRunCommand(
            { session: ctx.session, source: "ai", allowedRoots: [...ctx.allowedRoots] },
            step.name,
            step.args ?? {},
          );
          ctx.onEvent({
            type: "tool_result",
            id,
            name: step.name,
            ok: out.ok,
            summary: out.ok ? out.summary : out.error,
          });
          break;
        }
        default:
          if (step.type === "done" || step.type === "error") terminal = true;
          ctx.onEvent(step);
      }
    }
    if (!terminal && !ctx.signal.aborted) ctx.onEvent({ type: "done", turns: 1 });
  }
}

/** Resolve after `ms`, or as soon as `signal` aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = Number.isFinite(ms) ? setTimeout(done, ms) : undefined;
    signal.addEventListener("abort", done, { once: true });
  });
}
