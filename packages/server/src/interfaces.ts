// The seams the server exposes for things built elsewhere: the AI agent, provider availability and the local model runtime.
// The server never imports @dax/agent or @dax/local-llm; the launcher injects implementations of these interfaces.

import type { Session } from "@dax/core";
import type {
  AgentEvent,
  LocalModelStatus,
  ProviderKind,
  ProviderStatus,
  Settings,
} from "@dax/protocol";

/** Everything an {@link AgentRunner} gets for one run. */
export interface AgentRunContext {
  /** The open project's session. Run commands on it with source `ai` so the history says who did what. */
  session: Session;
  /** Report progress; each event is forwarded to the UI as a `chat` WebSocket event. */
  onEvent(event: AgentEvent): void;
  /** Aborted when the user cancels. Runners must stop promptly and then resolve or reject. */
  signal: AbortSignal;
  /** Folders the agent may import from and export to (the server's `--allow-root` set). */
  allowedRoots: readonly string[];
}

/**
 * Runs one chat message to completion by editing the session. The real implementation
 * (`@dax/agent`) is wired in by the launcher; tests use {@link ScriptedRunner}.
 */
export interface AgentRunner {
  /** Resolve when the run is over (success, cancel or handled failure). A rejection is reported to the UI as an `error` event. */
  run(message: string, ctx: AgentRunContext): Promise<void>;
}

/** What a {@link AgentRunnerFactory} may look at when choosing a runner for the active provider. */
export interface RunnerEnv {
  /** Current settings, including `activeProvider`. */
  settings: Settings;
  /** The stored API key for a provider, if any. Never log or return it. */
  getApiKey(kind: ProviderKind): Promise<string | undefined>;
}

/** Builds the runner for the currently active provider. Called once per chat run, so settings changes take effect immediately. */
export type AgentRunnerFactory = (env: RunnerEnv) => AgentRunner | Promise<AgentRunner>;

/** Reports which AI providers are usable right now. Implemented by the launcher (checks CLIs, local model, keys). */
export interface ProviderRegistry {
  /** Status of every provider kind the registry knows about. Called at most every few seconds; may spawn processes. */
  list(env: RunnerEnv): Promise<ProviderStatus[]>;
}

/** Options passed to long-running {@link LocalModelController} operations. */
export interface LocalModelTask {
  /** Report progress as a fraction from 0 to 1. */
  onProgress(fraction: number): void;
  /** Aborted by `POST /api/local-model/cancel` or on shutdown. */
  signal: AbortSignal;
}

/** Controls the embedded local model. Implemented by the launcher on top of `@dax/local-llm`. */
export interface LocalModelController {
  /** Current state; cheap to call. */
  status(): Promise<LocalModelStatus>;
  /** Download the model (and runtime). `modelId` omitted means "the recommended one". Resolves when done. */
  install(modelId: string | undefined, task: LocalModelTask): Promise<void>;
  /** Start the model server and resolve once it answers. */
  start(task: LocalModelTask): Promise<void>;
  /** Stop the model server. Must be safe to call when it is not running. */
  stop(): Promise<void>;
  /**
   * Delete the downloaded model files to free disk space. The server stops the model first.
   * Optional: a controller without it makes `POST /api/local-model/uninstall` answer 501.
   */
  uninstall?(): Promise<void>;
}
