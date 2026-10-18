// Finds tool calls that a model wrote as plain text instead of using the API's tool-call field, and removes
// reasoning blocks. Small and local models do this often. Pure string processing; never runs anything.

import { parseJsonLoose } from "./json-repair.js";

/** A tool call recovered from text. `arguments` is an object, a JSON string, or raw text that could not be read. */
export interface TextToolCall {
  /** Resolved tool name, or `""` if a tool-call block was present but unreadable. */
  name: string;
  arguments: unknown;
}

/** Result of {@link extractTextToolCalls}. */
export interface TextToolExtraction {
  /** Calls in the order they appear in the text. */
  calls: TextToolCall[];
  /** The text with the tool-call blocks removed, trimmed. */
  text: string;
}

/**
 * Remove chain-of-thought blocks (`<think>`, `<thinking>`, `<reasoning>`) that some local models put
 * in their reply. An unclosed block removes everything after it; a stray closing tag removes
 * everything before it (some chat templates open the block themselves).
 */
export function stripThinking(text: string): string {
  let out = text.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, "");
  const stray = /<\/(think|thinking|reasoning)>/i.exec(out);
  if (stray) out = out.slice(stray.index + stray[0].length);
  const open = /<(think|thinking|reasoning)>/i.exec(out);
  if (open) out = out.slice(0, open.index);
  return out.trim();
}

interface Match {
  start: number;
  end: number;
  calls: TextToolCall[];
}

type Known = ReadonlyMap<string, string>;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Map a model's spelling of a tool name to the real one: ignores case and `functions.` prefixes. */
function resolveName(raw: string, known: Known): string | undefined {
  const cleaned = raw
    .trim()
    .replace(/^(functions?|tools?)[.:]+/i, "")
    .toLowerCase();
  return known.get(cleaned);
}

const NAME_KEYS = [
  "name",
  "tool",
  "tool_name",
  "function_name",
  "action",
  "function",
  "type",
  "id",
];

function withoutKeys(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));
}

function callFromObject(v: unknown, known: Known, requireKnown: boolean): TextToolCall | null {
  if (!isObject(v)) return null;
  const fn = isObject(v.function) ? v.function : v;
  const rawName = [
    fn.name,
    fn.tool,
    fn.tool_name,
    fn.function_name,
    fn.action,
    typeof v.function === "string" ? v.function : undefined,
  ].find((x): x is string => typeof x === "string" && x.trim() !== "");
  if (rawName !== undefined) {
    const name = resolveName(rawName, known);
    if (name === undefined && requireKnown) return null;
    const explicit =
      fn.arguments ?? fn.parameters ?? fn.args ?? fn.input ?? fn.params ?? fn.action_input;
    // `{"name": "split", "at": 3}`: with no arguments container, the other keys are the arguments.
    const args = explicit ?? withoutKeys(fn, NAME_KEYS);
    return { name: name ?? rawName, arguments: args };
  }
  // {"delete_range": {"from": 2, "to": 4}}
  const keys = Object.keys(v);
  const only = keys.length === 1 ? keys[0] : undefined;
  if (only !== undefined) {
    const name = resolveName(only, known);
    const value = v[only];
    if (name !== undefined && (isObject(value) || value === null || typeof value === "string")) {
      return { name, arguments: value ?? {} };
    }
  }
  return null;
}

/** Turn a parsed JSON value into calls: an object, an array of objects, or `{ tool_calls: [...] }`. */
function callsFromValue(v: unknown, known: Known, requireKnown: boolean): TextToolCall[] | null {
  const list = Array.isArray(v)
    ? v
    : isObject(v) && Array.isArray(v.tool_calls)
      ? v.tool_calls
      : [v];
  if (list.length === 0) return null;
  const calls: TextToolCall[] = [];
  for (const item of list) {
    const call = callFromObject(item, known, requireKnown);
    if (!call) {
      if (requireKnown) return null; // an array of unrelated data is not a tool call
      continue;
    }
    calls.push(call);
  }
  return calls.length > 0 ? calls : null;
}

/** A block that was clearly meant as a tool call but cannot be read: report it so the model hears about it. */
function unreadable(content: string): TextToolCall {
  const name = /["']?name["']?\s*[:=]\s*["']([A-Za-z0-9_.-]+)["']/.exec(content)?.[1];
  return { name: name ?? "", arguments: content.trim() };
}

/** `<parameter=from>2</parameter>` style arguments (used by some Qwen and Llama templates). */
function parseXmlParameters(body: string): Record<string, unknown> | null {
  const re = /<parameter=([A-Za-z0-9_.-]+)>([\s\S]*?)(?:<\/parameter>|(?=<parameter=)|$)/g;
  const out: Record<string, unknown> = {};
  let found = false;
  for (const m of body.matchAll(re)) {
    found = true;
    const raw = (m[2] ?? "").trim();
    const parsed = parseJsonLoose(raw);
    out[m[1] ?? ""] = parsed.ok && !/^[A-Za-z]/.test(raw) ? parsed.value : raw;
  }
  return found ? out : null;
}

/** `name({"a": 1})` or `name(a=1, b="x")`: the part inside the parentheses. */
function parseCallArguments(inner: string): unknown {
  const text = inner.trim();
  if (text === "") return {};
  if (text.startsWith("{") || text.startsWith("[")) {
    const r = parseJsonLoose(text);
    if (r.ok) return r.value;
  }
  const r = parseJsonLoose(`{${text}}`);
  return r.ok ? r.value : text;
}

/** `<function=name>{...}</function>` and `<function=name><parameter=k>v</parameter></function>`. */
function functionTagMatches(text: string, known: Known): Match[] {
  const out: Match[] = [];
  for (const m of text.matchAll(/<function=([A-Za-z0-9_.-]+)>([\s\S]*?)(?:<\/function>|$)/gi)) {
    const name = resolveName(m[1] ?? "", known) ?? m[1] ?? "";
    const body = m[2] ?? "";
    const xml = parseXmlParameters(body);
    const parsed = xml ? null : parseJsonLoose(body);
    const args = xml ?? (parsed?.ok ? parsed.value : body.trim() === "" ? {} : body.trim());
    out.push({ start: m.index, end: m.index + m[0].length, calls: [{ name, arguments: args }] });
  }
  return out;
}

function tagMatches(text: string, known: Known): Match[] {
  const out: Match[] = [];

  for (const m of text.matchAll(/<tool[_-]?call>([\s\S]*?)(?:<\/tool[_-]?call>|$)/gi)) {
    const content = m[1] ?? "";
    // Qwen-coder wraps <function=...> blocks in <tool_call>; read the inner blocks, not JSON.
    const inner = content.includes("<function=") ? functionTagMatches(content, known) : [];
    let calls: TextToolCall[] | null = inner.flatMap((x) => x.calls);
    if (calls.length === 0) {
      const parsed = parseJsonLoose(content);
      calls = parsed.ok ? callsFromValue(parsed.value, known, false) : null;
    }
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      calls: calls ?? [unreadable(content)],
    });
  }

  out.push(...functionTagMatches(text, known));

  // Mistral: [TOOL_CALLS][{"name": ..., "arguments": {...}}]   Llama 3: <|python_tag|>{...}
  for (const m of text.matchAll(/\[TOOL_CALLS\]|<\|python_tag\|>/g)) {
    const from = m.index + m[0].length;
    const parsed = parseJsonLoose(text, from);
    const calls = parsed.ok ? callsFromValue(parsed.value, known, false) : null;
    const end = parsed.ok ? parsed.end : text.length;
    out.push({
      start: m.index,
      end,
      calls: calls ?? [unreadable(text.slice(from))],
    });
  }
  return out;
}

function fenceMatches(text: string, known: Known): Match[] {
  const out: Match[] = [];
  for (const m of text.matchAll(/```[ \t]*[A-Za-z_-]*[ \t]*\r?\n([\s\S]*?)(?:```|$)/g)) {
    const content = m[1] ?? "";
    const parsed = parseJsonLoose(content);
    let calls = parsed.ok ? callsFromValue(parsed.value, known, true) : null;
    if (!calls) calls = lineCalls(content, known, true);
    if (calls) out.push({ start: m.index, end: m.index + m[0].length, calls });
  }
  return out;
}

function bareJsonMatches(text: string, known: Known, taken: Match[]): Match[] {
  const out: Match[] = [];
  const isTaken = (i: number) => taken.some((t) => i >= t.start && i < t.end);
  let i = 0;
  while (i < text.length) {
    const c = text.charAt(i);
    if ((c !== "{" && c !== "[") || isTaken(i)) {
      i++;
      continue;
    }
    const parsed = parseJsonLoose(text, i);
    const calls = parsed.ok ? callsFromValue(parsed.value, known, true) : null;
    if (parsed.ok && calls) {
      out.push({ start: i, end: parsed.end, calls });
      i = parsed.end;
    } else {
      i++;
    }
  }
  return out;
}

/**
 * Lines that consist solely of a call such as `delete_range(from=2, to=4)`. A name mentioned inside
 * a sentence is not a call; that restriction keeps "I used remove_silences() to ..." from running again.
 */
function lineCalls(text: string, known: Known, wholeBlock: boolean): TextToolCall[] | null {
  const calls: TextToolCall[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  for (const line of lines) {
    const m = /^\s*(?:[-*]\s*)?`?([A-Za-z_][A-Za-z0-9_.]*)\((.*)\)`?\s*$/.exec(line);
    const name = m?.[1] ? resolveName(m[1], known) : undefined;
    if (!m || name === undefined) {
      if (wholeBlock) return null; // a fenced block must be nothing but calls
      continue;
    }
    calls.push({ name, arguments: parseCallArguments(m[2] ?? "") });
  }
  return calls.length > 0 ? calls : null;
}

function lineMatches(text: string, known: Known, taken: Match[]): Match[] {
  const out: Match[] = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    const start = offset;
    offset += line.length + 1;
    if (taken.some((t) => start >= t.start && start < t.end)) continue;
    const calls = lineCalls(line, known, false);
    if (calls) out.push({ start, end: start + line.length, calls });
  }
  return out;
}

/**
 * Recover tool calls that a model wrote as text. Understood, in this order of priority:
 *
 * - `<tool_call>{"name": ..., "arguments": {...}}</tool_call>` (Hermes, Qwen), also unclosed;
 * - `<function=name>{...}</function>` and `<parameter=key>value</parameter>` (Llama 3.1, Qwen coder);
 * - `[TOOL_CALLS][...]` (Mistral) and `<|python_tag|>{...}` (Llama 3);
 * - a fenced code block holding such JSON or one call per line;
 * - bare JSON such as `{"name": "split", "arguments": {"at": 3}}` or `{"tool_calls": [...]}`;
 * - a line that is only `name(a=1, b=2)` or `name({"a": 1})`.
 *
 * Only bare JSON, fenced blocks and call-syntax lines must name a tool in `knownNames`, so ordinary
 * prose and unrelated JSON are left alone. Inside an explicit `<tool_call>` tag any name is
 * reported, so the agent can tell the model the tool does not exist. A tag that cannot be read at
 * all yields a call with `name: ""`. Names are matched ignoring case and a `functions.` prefix.
 *
 * @param text The model's reply (after {@link stripThinking}).
 * @param knownNames Every tool name that exists, available or not.
 */
export function extractTextToolCalls(
  text: string,
  knownNames: Iterable<string>,
): TextToolExtraction {
  const known: Known = new Map([...knownNames].map((n) => [n.toLowerCase(), n]));
  const accepted: Match[] = [];
  const overlaps = (m: Match) => accepted.some((a) => m.start < a.end && m.end > a.start);
  const take = (ms: Match[]) => {
    for (const m of ms) if (!overlaps(m)) accepted.push(m);
  };

  take(tagMatches(text, known));
  take(fenceMatches(text, known));
  take(bareJsonMatches(text, known, accepted));
  take(lineMatches(text, known, accepted));

  accepted.sort((a, b) => a.start - b.start);
  let rest = "";
  let cursor = 0;
  for (const m of accepted) {
    rest += text.slice(cursor, m.start);
    cursor = m.end;
  }
  rest += text.slice(cursor);
  return {
    calls: accepted.flatMap((m) => m.calls),
    text: rest.replace(/\n{3,}/g, "\n\n").trim(),
  };
}
