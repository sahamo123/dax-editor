// Keys typed by a model must become data, never a change of prototype: __proto__ and friends in repaired JSON, in
// coerced arguments and in text-recovered arguments.

import { describe, expect, it } from "vitest";
import { parseJsonLoose } from "./json-repair.js";
import { getOwn, setOwn } from "./own-property.js";
import { extractTextToolCalls } from "./text-tool-calls.js";
import { coerceArguments } from "./tools.js";

describe("own-property helpers", () => {
  it("sets a __proto__ key as data, without changing the prototype", () => {
    const target: Record<string, unknown> = {};
    setOwn(target, "__proto__", { x: 1 });
    expect(Object.getPrototypeOf(target)).toBe(Object.prototype);
    expect(Object.hasOwn(target, "__proto__")).toBe(true);
  });

  it("reads only own properties", () => {
    expect(getOwn({ a: 1 }, "constructor")).toBeUndefined();
    expect(getOwn({ a: 1 }, "a")).toBe(1);
  });
});

describe("untrusted keys from a model", () => {
  it("keeps a __proto__ key in repaired JSON as an ordinary key", () => {
    // Before the fix the assignment set the prototype of the parsed object instead.
    const r = parseJsonLoose('{"__proto__": {"polluted": true}, "a": 2,}');
    expect(r.ok).toBe(true);
    const value = (r as { value: Record<string, unknown> }).value;
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.hasOwn(value, "__proto__")).toBe(true);
    expect(value.a).toBe(2);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("keeps a __proto__ key in coerced arguments as an ordinary key", () => {
    const schema = { type: "object", properties: { at: { type: "number" } } };
    const args = JSON.parse('{"__proto__": {"polluted": true}, "at": "2"}') as Record<
      string,
      unknown
    >;
    const { value } = coerceArguments(args, schema);
    const out = value as Record<string, unknown>;
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.hasOwn(out, "__proto__")).toBe(true);
    expect(out.at).toBe(2);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("keeps a __proto__ parameter from text-recovered XML arguments as an ordinary key", () => {
    const r = extractTextToolCalls(
      "<function=split><parameter=__proto__>1</parameter><parameter=at>3</parameter></function>",
      ["split"],
    );
    // This reply is only a call, so it is acted on; the argument object must still be a plain one.
    const args = r.calls[0]?.arguments as Record<string, unknown> | undefined;
    expect(args).toBeDefined();
    expect(Object.getPrototypeOf(args)).toBe(Object.prototype);
    expect(args?.at).toBe(3);
  });
});
