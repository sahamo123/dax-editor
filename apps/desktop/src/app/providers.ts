// Names and one-line descriptions of the AI provider kinds, in the order the UI lists them.

import type { ProviderKind } from "@dax/protocol";

/** Display information for one provider kind. */
export interface ProviderInfo {
  kind: ProviderKind;
  /** Short name used in menus. */
  label: string;
  /** One sentence shown in the settings list and the setup card. */
  blurb: string;
}

/** All providers, in display order. */
export const PROVIDERS: readonly ProviderInfo[] = [
  {
    kind: "local",
    label: "Local model",
    blurb:
      "A small open model that runs on this computer. Free and private; needs a one-time download.",
  },
  {
    kind: "openai-compatible",
    label: "OpenAI-compatible API",
    blurb: "Connect LM Studio, Ollama or a custom server that speaks the OpenAI chat format.",
  },
  {
    kind: "openai",
    label: "OpenAI",
    blurb:
      "Connect directly with your OpenAI API key and a tool-capable model. API billing is separate from assistant subscriptions.",
  },
  {
    kind: "openrouter",
    label: "OpenRouter",
    blurb:
      "Use your OpenRouter key and a model ID with tool calling. Online; provider charges and limits apply.",
  },
  {
    kind: "anthropic",
    label: "Anthropic API",
    blurb: "Use your own Anthropic API key.",
  },
  {
    kind: "cli-claude",
    label: "Claude Code",
    blurb: "Use the Claude Code command-line tool you are already signed in to.",
  },
  {
    kind: "cli-codex",
    label: "Codex CLI",
    blurb: "Use the Codex command-line tool you are already signed in to.",
  },
  {
    kind: "cli-gemini",
    label: "Gemini CLI",
    blurb: "Use the Gemini command-line tool you are already signed in to.",
  },
];

/** Display name for a kind. */
export function providerLabel(kind: ProviderKind): string {
  return PROVIDERS.find((p) => p.kind === kind)?.label ?? kind;
}

/** True for the providers that drive a signed-in command-line tool. */
export function isCliProvider(kind: ProviderKind): boolean {
  return kind.startsWith("cli-");
}
