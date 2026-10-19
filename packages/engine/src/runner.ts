// Builds the AgentRunner the server uses: picks the provider from settings, adds the skills that match the
// request, and keeps the conversation going between messages of the same project.

import {
  type AgentProvider,
  type ChatMessage,
  createAgent,
  createAnthropicProvider,
  createOpenAiProvider,
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

/** Default model names per hosted provider; users can override them in Settings. */
export const DEFAULT_MODELS: Partial<Record<ProviderKind, string>> = {
  anthropic: "claude-sonnet-5-5",
  "openai-compatible": "gpt-5-mini",
  local: "local",
};

/** Where the embedded model's OpenAI-compatible endpoint is, or undefined when it is not running. */
export type LocalEndpoint = () => Promise<string | undefined>;

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
  ): Promise<{ provider: AgentProvider; compact: boolean } | string> {
    const cfg = env.settings.providers[kind] ?? {};
    const model = cfg.model ?? DEFAULT_MODELS[kind];
    if (kind === "anthropic") {
      const apiKey = await env.getApiKey(kind);
      if (!apiKey) return "Add an Anthropic API key in Settings to use Claude.";
      return { provider: createAnthropicProvider({ apiKey, model: model ?? "" }), compact: false };
    }
    if (kind === "openai-compatible") {
      if (!cfg.baseUrl)
        return "Set the server address (base URL) for your OpenAI-compatible provider in Settings.";
      const apiKey = await env.getApiKey(kind);
      return {
        provider: createOpenAiProvider({
          baseUrl: cfg.baseUrl,
          model: model ?? "",
          ...(apiKey ? { apiKey } : {}),
        }),
        // Hosted models cope with full tool descriptions; compact is for small local ones.
        compact: false,
      };
    }
    if (kind === "local") {
      const baseUrl = await options.localEndpoint?.();
      if (!baseUrl) return "The built-in model is not running. Download and start it in Settings.";
      return {
        provider: createOpenAiProvider({ baseUrl, model: model ?? "local" }),
        compact: true,
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
    const agent = createAgent({
      provider: made.provider,
      toolStyle: made.compact ? "compact" : "full",
      contextProvider: (message) =>
        skills.length > 0
          ? skillContext(selectSkills(message, skills, { maxChars: made.compact ? 3000 : 6000 }))
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
        if (mine === generation) history = result.messages;
      },
    };
  };
}
