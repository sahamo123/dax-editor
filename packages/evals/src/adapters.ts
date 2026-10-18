// Builds the adapter named on the command line (`--adapter oracle|openai|anthropic`) from its options.
// Reads API keys only from environment variables named by the user, and never prints them.

import { createAnthropicProvider, createOpenAiProvider } from "@dax/agent";
import { AgentAdapter } from "./agent-adapter.js";
import { OracleAdapter } from "./oracle.js";
import type { ModelAdapter } from "./runner.js";

/** Adapter names accepted by `--adapter`. */
export const ADAPTER_NAMES = ["oracle", "openai", "anthropic"] as const;

/** Options of {@link makeAdapter}; they mirror the command-line flags. */
export interface AdapterOptions {
  /** One of {@link ADAPTER_NAMES}. */
  adapter: string;
  /** OpenAI-compatible API root such as `http://127.0.0.1:8080/v1` (required for `openai`; optional override for `anthropic`). */
  baseUrl?: string | undefined;
  /** Model name to request (required for `openai` and `anthropic`). */
  model?: string | undefined;
  /** Name of the environment variable that holds the API key. Default for `anthropic`: `ANTHROPIC_API_KEY`. `openai` sends no key unless this is set. */
  apiKeyEnv?: string | undefined;
  /** Sampling temperature as text: a number, or `default` to leave it to the server. Default `0`, so runs are comparable. */
  temperature?: string | undefined;
  /** `full` or `compact`. Default `compact` for `openai` (small local models), `full` for `anthropic`. */
  toolStyle?: string | undefined;
  /** Maximum reply tokens. Default: the server's (`openai`), 4096 (`anthropic`). */
  maxTokens?: number | undefined;
  /** Per-request timeout in seconds. Default 300. */
  timeoutSec?: number | undefined;
  /** Environment to read keys from. Default `process.env`. */
  env?: Record<string, string | undefined> | undefined;
}

function parseTemperature(text: string | undefined): number | undefined {
  if (text === undefined) return 0;
  if (text === "default") return undefined;
  const n = Number(text);
  if (text.trim() === "" || !Number.isFinite(n) || n < 0) {
    throw new Error(`--temperature must be a number >= 0 or "default", got "${text}"`);
  }
  return n;
}

function parseToolStyle(
  text: string | undefined,
  fallback: "full" | "compact",
): "full" | "compact" {
  if (text === undefined) return fallback;
  if (text === "full" || text === "compact") return text;
  throw new Error(`--tool-style must be "full" or "compact", got "${text}"`);
}

/** The key held in environment variable `name`, or undefined if no variable was named. Throws if it is named but empty. */
function readKey(
  env: Record<string, string | undefined>,
  name: string | undefined,
): string | undefined {
  if (name === undefined) return undefined;
  const value = env[name];
  if (value === undefined || value === "") {
    throw new Error(
      `Environment variable ${name} is not set. Export it, or pass a different --api-key-env.`,
    );
  }
  return value;
}

/**
 * Create the adapter for `options.adapter`.
 *
 * - `oracle`: the hand-written solver (no model).
 * - `openai`: any OpenAI-compatible server; needs `baseUrl` and `model`.
 * - `anthropic`: the Anthropic API; needs `model` and an API key in the environment.
 *
 * The adapter id records settings that differ from the adapter's default (`openai:model+full`), so
 * reports of different configurations are never confused. Throws an `Error` with a message fit for
 * the terminal when options are missing or invalid. Makes no network call.
 */
export function makeAdapter(options: AdapterOptions): ModelAdapter {
  const env = options.env ?? process.env;
  const httpTimeout =
    options.timeoutSec !== undefined ? { timeoutMs: options.timeoutSec * 1000 } : {};

  switch (options.adapter) {
    case "oracle":
      return new OracleAdapter();

    case "openai": {
      if (!options.baseUrl) {
        throw new Error("--adapter openai needs --base-url, e.g. http://127.0.0.1:8080/v1");
      }
      if (!options.model) throw new Error("--adapter openai needs --model NAME");
      const temperature = parseTemperature(options.temperature);
      const toolStyle = parseToolStyle(options.toolStyle, "compact");
      const apiKey = readKey(env, options.apiKeyEnv);
      const provider = createOpenAiProvider({
        baseUrl: options.baseUrl,
        model: options.model,
        ...(apiKey !== undefined ? { apiKey } : {}),
        ...(temperature !== undefined ? { temperature } : {}),
        ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
        ...httpTimeout,
      });
      return new AgentAdapter({
        id: `openai:${options.model}${toolStyle === "compact" ? "" : `+${toolStyle}`}`,
        provider,
        toolStyle,
      });
    }

    case "anthropic": {
      if (!options.model) throw new Error("--adapter anthropic needs --model NAME");
      const temperature = parseTemperature(options.temperature);
      const toolStyle = parseToolStyle(options.toolStyle, "full");
      const apiKey = readKey(env, options.apiKeyEnv ?? "ANTHROPIC_API_KEY");
      if (apiKey === undefined) throw new Error("No Anthropic API key available");
      const provider = createAnthropicProvider({
        model: options.model,
        apiKey,
        ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
        ...(temperature !== undefined ? { temperature } : {}),
        ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
        ...httpTimeout,
      });
      return new AgentAdapter({
        id: `anthropic:${options.model}${toolStyle === "full" ? "" : `+${toolStyle}`}`,
        provider,
        toolStyle,
      });
    }

    default:
      throw new Error(
        `Unknown adapter "${options.adapter}". Available: ${ADAPTER_NAMES.join(", ")}`,
      );
  }
}
