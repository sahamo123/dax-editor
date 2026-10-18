// Runs one tool call for the agent loop: parse and repair the arguments, validate them, run the command with
// source "ai", and turn every kind of failure into a message the model can act on. Never throws.

import {
  COMMANDS,
  type CommandContext,
  getCommand,
  type Session,
  type ToolSpec,
  type Transcriber,
  tryRunCommand,
} from "@dax/core";
import { parseJsonLoose } from "./json-repair.js";
import { coerceArguments, toolSignature } from "./tools.js";

/** How a tool call ended, for the statistics and for deciding what to tell the model. */
export type ToolOutcome =
  | {
      kind: "ok";
      summary: string;
      data: unknown;
      args: Record<string, unknown>;
      repaired: boolean;
    }
  /** The command ran and reported a problem (for example "No clip can be split at 4s"). */
  | { kind: "failed"; error: string; args: Record<string, unknown>; repaired: boolean }
  /** The call itself was bad: unreadable, unknown tool, wrong arguments. Nothing ran. */
  | { kind: "invalid"; error: string; args: unknown; repaired: boolean };

/** What the runner needs to execute calls. */
export interface ToolRunnerContext {
  session: Session;
  allowedRoots: string[] | undefined;
  /** Speech-to-text for `transcribe` and the cut commands; absent when none is installed. */
  transcriber?: Transcriber | undefined;
  /** The tools offered to the model, by name. Calls to anything else are refused. */
  available: ReadonlyMap<string, ToolSpec>;
}

/** Result of {@link interpretArguments}. */
export type ParsedArgs =
  | { ok: true; value: Record<string, unknown>; repaired: boolean }
  | { ok: false; error: string };

/**
 * Turn what a provider delivered as `arguments` into an object: parse JSON text (repairing common
 * mistakes), treat empty text and `null` as no arguments, reject anything that is not an object.
 */
export function interpretArguments(raw: unknown): ParsedArgs {
  if (raw === undefined || raw === null) return { ok: true, value: {}, repaired: false };
  let value: unknown = raw;
  let repaired = false;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (text === "" || text === "null") return { ok: true, value: {}, repaired: false };
    const parsed = parseJsonLoose(text);
    if (!parsed.ok) return { ok: false, error: `it is not valid JSON (${parsed.error})` };
    value = parsed.value;
    repaired = parsed.repaired;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: 'it must be a JSON object such as {"key": value}' };
  }
  return { ok: true, value: value as Record<string, unknown>, repaired };
}

function formatIssues(name: string, issues: { path: (string | number)[]; message: string }[]) {
  const text = issues.map((i) => `${i.path.join(".") || "arguments"}: ${i.message}`).join("; ");
  return `Invalid arguments for ${name}: ${text}`;
}

/** Name of every command in the registry, for recognising tools that exist but are not offered. */
export function registryNames(): string[] {
  return COMMANDS.map((c) => c.name);
}

/**
 * Execute one tool call and classify the outcome.
 *
 * `truncated` marks a reply cut off by the output limit: a call whose arguments had to be repaired
 * is then refused, because a cut-off number such as `4` for `45` would silently edit the wrong part.
 */
export async function runToolCall(
  ctx: ToolRunnerContext,
  call: { name: string; arguments: unknown },
  truncated: boolean,
): Promise<ToolOutcome> {
  const { name } = call;
  if (name === "") {
    return {
      kind: "invalid",
      args: call.arguments,
      repaired: false,
      error:
        "Your tool call could not be read. Call a tool with its name and a JSON object of arguments.",
    };
  }

  const spec = ctx.available.get(name);
  if (!spec) {
    const error = getCommand(name)
      ? `The tool "${name}" is not available here. Do not use it. Tell the user you cannot do that yourself.`
      : `Unknown tool "${name}". Available tools: ${[...ctx.available.keys()].join(", ")}.`;
    return { kind: "invalid", args: call.arguments, repaired: false, error };
  }
  const usage = `Usage: ${toolSignature(spec)}`;

  const parsed = interpretArguments(call.arguments);
  if (!parsed.ok) {
    return {
      kind: "invalid",
      args: call.arguments,
      repaired: false,
      error: `The arguments of ${name} were not understood: ${parsed.error}. ${usage}`,
    };
  }
  if (truncated && parsed.repaired) {
    return {
      kind: "invalid",
      args: parsed.value,
      repaired: true,
      error: `Your reply was cut off before the arguments of ${name} were complete, so it was not run. Try again with a shorter reply. ${usage}`,
    };
  }

  const coerced = coerceArguments(parsed.value, spec.parameters);
  const args =
    typeof coerced.value === "object" && coerced.value !== null && !Array.isArray(coerced.value)
      ? (coerced.value as Record<string, unknown>)
      : parsed.value;
  const repaired = parsed.repaired || coerced.changed;

  const def = getCommand(name);
  const check = def?.schema.safeParse(args);
  if (check && !check.success) {
    return {
      kind: "invalid",
      args,
      repaired,
      error: `${formatIssues(name, check.error.issues)}. ${usage}`,
    };
  }

  const commandCtx: CommandContext = { session: ctx.session, source: "ai" };
  if (ctx.allowedRoots) commandCtx.allowedRoots = ctx.allowedRoots;
  if (ctx.transcriber) commandCtx.transcriber = ctx.transcriber;
  const result = await tryRunCommand(commandCtx, name, args);
  if (!result.ok) return { kind: "failed", error: result.error, args, repaired };
  return { kind: "ok", summary: result.summary, data: result.data, args, repaired };
}
