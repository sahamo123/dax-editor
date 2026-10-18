// Turns command specs into the tools a model sees (full or compact), describes them as one-line signatures
// for error messages, and fixes common argument mistakes (numbers as strings, nulls, a lone object for a list).

import type { ToolSpec } from "@dax/core";
import { parseJsonLoose } from "./json-repair.js";
import type { ToolDefinition } from "./types.js";

/**
 * How tools are presented to the model:
 *
 * - `"full"`: the command descriptions and the complete JSON Schema, including field descriptions.
 *   Best for capable hosted models.
 * - `"compact"`: first sentence of each description and a bare schema (types, enums, required) with
 *   no field descriptions, roughly a third of the tokens. Meant for small local models with short
 *   context windows; the system prompt carries the units.
 * - a function: build the definition yourself.
 */
export type ToolStyle = "full" | "compact" | ((tool: ToolSpec) => ToolDefinition);

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** The JSON Schema types a schema accepts, looking through `anyOf`/`oneOf` and `enum`. */
function typesOf(schema: unknown): string[] {
  if (!isObject(schema)) return [];
  const out: string[] = [];
  if (typeof schema.type === "string") out.push(schema.type);
  else if (Array.isArray(schema.type))
    out.push(...schema.type.filter((t) => typeof t === "string"));
  for (const key of ["anyOf", "oneOf"] as const) {
    const alts = schema[key];
    if (Array.isArray(alts)) for (const alt of alts) out.push(...typesOf(alt));
  }
  if (out.length === 0 && Array.isArray(schema.enum)) out.push("string");
  return out;
}

const KEEP_IN_COMPACT = new Set([
  "type",
  "enum",
  "items",
  "properties",
  "required",
  "anyOf",
  "oneOf",
]);

function compactSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(compactSchema);
  if (!isObject(schema)) return schema;
  const out: Json = {};
  for (const [key, value] of Object.entries(schema)) {
    if (!KEEP_IN_COMPACT.has(key)) continue;
    if (key === "properties" && isObject(value)) {
      out[key] = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, compactSchema(v)]));
    } else if (key === "enum" || key === "required" || key === "type") {
      out[key] = value;
    } else {
      out[key] = compactSchema(value);
    }
  }
  return out;
}

function firstSentence(description: string, max: number): string {
  const flat = description.replace(/\s+/g, " ").trim();
  const end = flat.search(/[.!?](\s|$)/);
  const sentence = end === -1 ? flat : flat.slice(0, end + 1);
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 20))}...`;
}

/**
 * Build the definition a model is shown for one command, in the requested style.
 * `"compact"` keeps names, types, enums and which fields are required, and drops prose.
 */
export function toToolDefinition(spec: ToolSpec, style: ToolStyle = "full"): ToolDefinition {
  if (typeof style === "function") return style(spec);
  if (style === "compact") {
    return {
      name: spec.name,
      description: firstSentence(spec.description, 160),
      parameters: compactSchema(spec.parameters) as Record<string, unknown>,
    };
  }
  return { name: spec.name, description: spec.description, parameters: spec.parameters };
}

function typeText(schema: unknown, depth: number): string {
  if (!isObject(schema)) return "any";
  if (Array.isArray(schema.enum)) return schema.enum.map((v) => JSON.stringify(v)).join("|");
  const types = [...new Set(typesOf(schema))].filter((t) => t !== "null");
  const nullable = typesOf(schema).includes("null") ? "|null" : "";
  if (types.length === 0) return "any";
  const one = types.map((t) => {
    if (t === "array") return `Array<${typeText(schema.items, depth + 1)}>`;
    if (t === "object" && isObject(schema.properties) && depth < 3) {
      return propertiesText(schema, depth + 1, true);
    }
    return t;
  });
  return one.join("|") + nullable;
}

function propertiesText(schema: Json, depth: number, braces: boolean): string {
  const props = isObject(schema.properties) ? schema.properties : {};
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const parts = Object.entries(props).map(
    ([k, v]) => `${k}${required.has(k) ? "" : "?"}: ${typeText(v, depth)}`,
  );
  return braces ? `{${parts.join(", ")}}` : parts.join(", ");
}

/**
 * One-line description of a tool's arguments, such as `delete_range(from: number, to: number)`.
 * Optional fields end in `?`. Used in error messages so a model can fix its next call.
 */
export function toolSignature(spec: Pick<ToolSpec, "name" | "parameters">): string {
  return `${spec.name}(${propertiesText(spec.parameters, 0, false)})`;
}

/** Result of {@link coerceArguments}. */
export interface Coerced {
  value: unknown;
  /** True if anything was changed. */
  changed: boolean;
}

const REMOVE = Symbol("remove");

function coerceValue(value: unknown, schema: unknown, state: { changed: boolean }): unknown {
  if (!isObject(schema)) return value;
  const types = typesOf(schema);

  if (value === null && types.length > 0 && !types.includes("null")) {
    state.changed = true;
    return REMOVE; // "not given", as models often write null for an omitted optional field
  }

  if (typeof value === "string" && !types.includes("string")) {
    const t = value.trim();
    if ((types.includes("number") || types.includes("integer")) && t !== "") {
      const n = Number(t.replace(/s$/i, "")); // "2" and "2s" (seconds) both mean 2
      if (Number.isFinite(n)) {
        state.changed = true;
        return n;
      }
    }
    if (types.includes("boolean") && /^(true|false)$/i.test(t)) {
      state.changed = true;
      return t.toLowerCase() === "true";
    }
    if ((types.includes("array") || types.includes("object")) && /^[[{]/.test(t)) {
      const parsed = parseJsonLoose(t);
      if (parsed.ok) {
        state.changed = true;
        return coerceValue(parsed.value, schema, state);
      }
    }
    return value;
  }

  if (types.includes("array") && !types.includes("object") && value !== undefined) {
    // A single item where a list is expected: {"start": 0, "end": 3} instead of [{...}].
    const list = Array.isArray(value) ? value : [value];
    if (!Array.isArray(value)) state.changed = true;
    return list.map((item) => {
      const c = coerceValue(item, schema.items, state);
      return c === REMOVE ? null : c;
    });
  }

  if (isObject(value) && isObject(schema.properties)) {
    const props = schema.properties;
    const out: Json = {};
    for (const [k, v] of Object.entries(value)) {
      const c = coerceValue(v, props[k], state);
      if (c !== REMOVE) out[k] = c;
    }
    return out;
  }
  return value;
}

/**
 * Fix the mistakes small models make with otherwise correct arguments, guided by the tool's
 * JSON Schema: numbers or booleans written as strings (`"2"`, `"2s"`, `"true"`), JSON written as a
 * string, `null` for an omitted optional field, and one item where a list is expected.
 * Validation still happens afterwards; this never invents values.
 */
export function coerceArguments(args: unknown, schema: Record<string, unknown>): Coerced {
  const state = { changed: false };
  const value = coerceValue(args, schema, state);
  return { value: value === REMOVE ? {} : value, changed: state.changed };
}
