// How much of a model's context window each part of a run may use. Everything is derived from one number, the window
// in tokens, so a small local model gets a compact prompt, fewer skills, shorter tool results and a shorter conversation.

import { commandTools, type ToolSpec } from "@dax/core";
import type { ChatMessage } from "./types.js";

/** Windows at or below this many tokens get tools described in compact form. */
export const SMALL_CONTEXT_TOKENS = 16_384;
/** Window assumed when nothing says otherwise: the limits this package has always used. */
export const DEFAULT_CONTEXT_TOKENS = 32_768;
/**
 * The commands offered to a small model. Each one is used for everyday editing, and the system prompt names them.
 * The rest stay available to larger models, which can hold the full list.
 */
export const SMALL_MODEL_TOOL_NAMES: readonly string[] = [
  "get_project",
  "get_transcript",
  "import_media",
  "split",
  "delete_range",
  "keep_only",
  "trim_clip",
  "move_clip",
  "remove_clip",
  "remove_silences",
  "remove_fillers",
  "smart_cut",
  "set_volume",
  "set_fades",
  "set_format",
  "add_overlay",
  "update_overlay",
  "remove_overlay",
  "apply_template",
  "undo",
  "redo",
];

/** Everyday tools plus requested speech/motion/template tools, in registry order. Retains everyday controls for steering. */
export function smallModelTools(message?: string): ToolSpec[] {
  return commandTools({
    names: [
      ...new Set([
        ...SMALL_MODEL_TOOL_NAMES,
        ...focusedModelTools(message).map((tool) => tool.name),
      ]),
    ],
  });
}

/** Relevant advertised tools for a request; unknown intent keeps the established everyday list. */
export function focusedModelTools(message?: string): ToolSpec[] {
  const names = new Set(["get_project", "undo", "redo"]);
  const groups: Array<[RegExp, string[]]> = [
    [
      /\b(format|portrait|landscape|square|aspect|resolution|fit|vertical|horizontal)\b/i,
      ["set_format"],
    ],
    [/\b(volume|audio|mute|louder|quieter)\b|\bfade[ -]?(in|out)\b/i, ["set_volume", "set_fades"]],
    [
      /\b(trim|split|cut|delete|remove|move|reorder)\b|\bkeep only\b/i,
      ["split", "delete_range", "keep_only", "trim_clip", "move_clip", "remove_clip"],
    ],
    [
      /\b(speech|transcri\w*|caption\w*|subtitle\w*|filler\w*|silence\w*)\b/i,
      [
        "transcribe",
        "get_transcript",
        "correct_transcript_word",
        "set_captions",
        "plan_cuts",
        "apply_cut_plan",
      ],
    ],
    [/\b(blender|3d|motion|intro|logo)\b/i, ["list_motion_templates", "render_motion_template"]],
    [/\btemplate\b/i, ["list_templates", "apply_template"]],
    [/\blist presets\b/i, ["list_presets"]],
    [/\b(import|upload|footage)\b/i, ["import_media"]],
  ];
  for (const [pattern, tools] of groups)
    if (message && pattern.test(message)) for (const tool of tools) names.add(tool);
  if (message && /\b(title|text|overlay|lower.third|callout)\b/i.test(message)) {
    names.add(
      /\b(add|insert|create|put)\b/i.test(message)
        ? "add_overlay"
        : /\b(change|update|replace|edit)\b/i.test(message)
          ? "update_overlay"
          : "add_overlay",
    );
  }
  return commandTools({ names: names.size > 3 ? [...names] : [...SMALL_MODEL_TOOL_NAMES] });
}

/** Tokens kept free for the model's reply and its tool-call syntax. */
const REPLY_RESERVE_TOKENS = 2048;
/** Characters per token for English prose and JSON. Conservative on purpose: too much context is worse than too little. */
const CHARS_PER_TOKEN = 3;

/** The limits for one run, all derived from the context window. */
export interface ContextBudget {
  /** The window the limits were derived from, in tokens. */
  contextTokens: number;
  /** True when tools should be described compactly (small windows). */
  compact: boolean;
  /** Characters the conversation may take before older tool results are shortened. */
  maxContextChars: number;
  /** Characters of one tool result's data before it is cut. */
  maxToolResultChars: number;
  /** Characters of skill guidance added to one request. */
  skillChars: number;
}

/** Keep `n` within `[min, max]`. */
function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * The limits for a model with a `contextTokens` window. Without a size the defaults are the ones the agent always used.
 * Smaller windows never get larger limits than the defaults.
 */
export function contextBudget(contextTokens: number = DEFAULT_CONTEXT_TOKENS): ContextBudget {
  const tokens = Math.max(2048, Math.floor(contextTokens));
  const usable = Math.max(1024, tokens - REPLY_RESERVE_TOKENS);
  return {
    contextTokens: tokens,
    compact: tokens <= SMALL_CONTEXT_TOKENS,
    maxContextChars: Math.min(60_000, usable * CHARS_PER_TOKEN),
    maxToolResultChars: clamp(Math.floor(tokens / 2), 1500, 6000),
    skillChars: clamp(Math.floor(tokens * 0.3), 1000, 6000),
  };
}

/** Characters a message takes up in the next request, counted the same way everywhere in the agent. */
export function messageSize(m: ChatMessage): number {
  return m.role === "assistant" ? m.text.length + 40 * m.toolCalls.length : m.content.length;
}

/**
 * The most recent part of a conversation that fits in `maxChars`. It starts at a user message, so the model always
 * sees a request before the replies to it. The newest user message is kept even when it alone is over the limit.
 */
export function trimHistory(messages: ChatMessage[], maxChars: number): ChatMessage[] {
  let size = 0;
  let start = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    // Stop once the limit is reached, but never drop everything: at least the last message is kept.
    if (start < messages.length && size + messageSize(m) > maxChars) break;
    size += messageSize(m);
    start = i;
  }
  while (start < messages.length && messages[start]?.role !== "user") start++;
  return messages.slice(start);
}
