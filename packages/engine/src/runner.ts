// Builds the AgentRunner the server uses: picks the provider from settings, adds the skills that match the
// request, and keeps the conversation going between messages of the same project.

import {
  type AgentProvider,
  type ChatMessage,
  contextBudget,
  createAgent,
  createAnthropicProvider,
  createOpenAiProvider,
  smallModelTools,
  trimHistory,
} from "@dax/agent";
import {
  loadSkills,
  type Session,
  type Skill,
  selectSkills,
  skillContext,
  type Transcriber,
} from "@dax/core";
import type { ProviderKind } from "@dax/protocol";
import type { AgentRunner, AgentRunnerFactory, RunnerEnv } from "@dax/server";
import type { LocalConnection } from "./local-model.js";

/** Context window used for the built-in model only when neither Settings nor the running model says what it is. */
const BUILT_IN_CONTEXT_TOKENS = 8192;

/** Default model names per hosted provider; users can override them in Settings. */
export const DEFAULT_MODELS: Partial<Record<ProviderKind, string>> = {
  anthropic: "claude-sonnet-5-5",
  "openai-compatible": "gpt-5-mini",
  local: "local",
};

/** The host part of a URL for messages, or a placeholder when it does not parse. */
function safeHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host || "the configured address";
  } catch {
    return "the configured address";
  }
}

/** Where the embedded model's OpenAI-compatible endpoint is and how to authenticate to it; undefined when it is not running. */
export type LocalEndpoint = () => Promise<LocalConnection | undefined>;

/**
 * How the `local` provider talks to the running built-in model. Settings win; otherwise the model's own catalog name and
 * the window it was started with, so the agent budgets for the model that is really loaded.
 */
export function localProviderSettings(
  cfg: { model?: string; contextTokens?: number },
  connection: LocalConnection,
): { baseUrl: string; apiKey?: string; model: string; contextTokens: number } {
  return {
    baseUrl: connection.baseUrl,
    // Only the loopback server is ever called here, so the key never leaves this machine.
    ...(connection.apiKey ? { apiKey: connection.apiKey } : {}),
    model: cfg.model ?? connection.modelId ?? "local",
    contextTokens: cfg.contextTokens ?? connection.contextTokens ?? BUILT_IN_CONTEXT_TOKENS,
  };
}

/** Everything {@link createRunnerFactory} needs besides the server's own settings. */
export interface RunnerFactoryOptions {
  /** Folder of `<name>/SKILL.md` editing skills. Missing or unreadable means no skills, not a failure. */
  skillsDir?: string;
  /** Speech-to-text engine handed to the agent's commands. */
  transcriber?: Transcriber;
  /** Base URL of the running embedded model. */
  localEndpoint?: LocalEndpoint;
  /**
   * Builds runners for providers this package does not know (for example signed-in command-line agents).
   * Return undefined to fall through to the "not available" runner.
   */
  extraProviders?: (kind: ProviderKind, env: RunnerEnv) => Promise<AgentRunner | undefined>;
}

/**
 * True when an API key may be sent to `baseUrl`: an https address, or plain http to this machine only. A key sent in
 * clear text over the network could be read by anyone on the path, so such a configuration is refused (L3).
 */
export function keyMayGoTo(baseUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
}

/** Host names that always mean this machine. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** A runner that only explains why nothing happened. */
function unavailable(message: string): AgentRunner {
  return {
    async run(_text, ctx) {
      ctx.onEvent({ type: "error", message });
    },
  };
}

/** Skills that load, or an empty list. A broken skills folder must never stop the editor starting. */
function safeLoadSkills(dir: string | undefined): Skill[] {
  if (!dir) return [];
  try {
    return loadSkills(dir);
  } catch {
    return [];
  }
}

/**
 * The factory the server calls once per chat message. Conversation history is kept per session object, so a
 * newly opened project starts a fresh conversation while a provider switch keeps the context.
 */
export function createRunnerFactory(options: RunnerFactoryOptions = {}): AgentRunnerFactory {
  const skills = safeLoadSkills(options.skillsDir);
  let historySession: Session | undefined;
  let history: ChatMessage[] = [];
  /** Incremented for every run. Only the newest run may store its conversation, so an old run that outlives its cancel cannot overwrite it. */
  let generation = 0;

  /** Make a provider for `kind`, or an explanation of what is missing. */
  async function makeProvider(
    kind: ProviderKind,
    env: RunnerEnv,
  ): Promise<{ provider: AgentProvider; contextTokens?: number } | string> {
    const cfg = env.settings.providers[kind] ?? {};
    const model = cfg.model ?? DEFAULT_MODELS[kind];
    if (kind === "anthropic") {
      const apiKey = await env.getApiKey(kind);
      if (!apiKey) return "Add an Anthropic API key in Settings to use Claude.";
      return {
        provider: createAnthropicProvider({ apiKey, model: model ?? "" }),
        ...(cfg.contextTokens ? { contextTokens: cfg.contextTokens } : {}),
      };
    }
    if (kind === "openai-compatible") {
      if (!cfg.baseUrl)
        return "Set the server address (base URL) for your OpenAI-compatible provider in Settings.";
      const apiKey = await env.getApiKey(kind);
      if (apiKey && !keyMayGoTo(cfg.baseUrl)) {
        // Name the host only: the address may carry credentials or a path that should not be echoed.
        const host = safeHost(cfg.baseUrl);
        return `Your API key would be sent over an unencrypted connection to ${host}. Use an https:// address, or remove the key.`;
      }
      return {
        provider: createOpenAiProvider({
          baseUrl: cfg.baseUrl,
          model: model ?? "",
          ...(apiKey ? { apiKey } : {}),
        }),
        // Unset means a large hosted model; set a smaller window in Settings for a small model behind this address.
        ...(cfg.contextTokens ? { contextTokens: cfg.contextTokens } : {}),
      };
    }
    if (kind === "local") {
      const connection = await options.localEndpoint?.();
      if (!connection)
        return "The built-in model is not running. Download and start it in Settings.";
      const local = localProviderSettings(cfg, connection);
      return {
        provider: createOpenAiProvider({
          baseUrl: local.baseUrl,
          model: local.model,
          ...(local.apiKey ? { apiKey: local.apiKey } : {}),
        }),
        contextTokens: local.contextTokens,
      };
    }
    return `The ${kind} provider is not available in this build.`;
  }

  return async (env) => {
    const kind = env.settings.activeProvider;
    const made = await makeProvider(kind, env);
    if (typeof made === "string") {
      return (await options.extraProviders?.(kind, env)) ?? unavailable(made);
    }
    // Everything small-model related follows from the window size: tool style, which tools are offered, how many skills
    // fit and how much conversation is kept.
    const budget = contextBudget(made.contextTokens);
    const agent = createAgent({
      provider: made.provider,
      contextTokens: budget.contextTokens,
      toolStyle: budget.compact ? "compact" : "full",
      ...(budget.compact ? { tools: smallModelTools() } : {}),
      contextProvider: (message) =>
        skills.length > 0
          ? skillContext(selectSkills(message, skills, { maxChars: budget.skillChars }))
          : undefined,
    });
    return {
      async run(message, ctx) {
        const mine = ++generation;
        if (historySession !== ctx.session) {
          historySession = ctx.session;
          history = [];
        }
        // The run gets its own copy, so nothing it does to its array reaches the stored conversation.
        const result = await agent.run(message, {
          session: ctx.session,
          history: [...history],
          onEvent: ctx.onEvent,
          signal: ctx.signal,
          allowedRoots: [...ctx.allowedRoots],
          ...(options.transcriber ? { transcriber: options.transcriber } : {}),
        });
        // Only the newest run's conversation is kept, and only its most recent part (about the window the model can see).
        if (mine === generation) history = trimHistory(result.messages, budget.maxContextChars);
      },
    };
  };
}
