import { describe, expect, it } from "vitest";
import { parseJsonLoose } from "./json-repair.js";

function value(text: string): unknown {
  const r = parseJsonLoose(text);
  if (!r.ok) throw new Error(`not parsed: ${r.error}`);
  return r.value;
}

describe("parseJsonLoose", () => {
  it("returns strict JSON untouched and says it was not repaired", () => {
    const r = parseJsonLoose('{"from": 2, "to": 4}');
    expect(r).toMatchObject({ ok: true, value: { from: 2, to: 4 }, repaired: false });
  });

  it("removes trailing commas", () => {
    expect(value('{"a": 1, "b": [1, 2,],}')).toEqual({ a: 1, b: [1, 2] });
  });

  it("accepts single and curly quotes", () => {
    expect(value("{'text': 'Hello', 'color': '#ff0000'}")).toEqual({
      text: "Hello",
      color: "#ff0000",
    });
    expect(value("{“text”: “Hi there”}")).toEqual({ text: "Hi there" });
  });

  it("accepts unquoted keys and bare words", () => {
    expect(value("{preset: title, start: 0, text: 'Hi'}")).toEqual({
      preset: "title",
      start: 0,
      text: "Hi",
    });
  });

  it("ignores a Markdown code fence and prose around the JSON", () => {
    expect(value('Sure! Here you go:\n```json\n{"at": 3}\n```\nHope that helps.')).toEqual({
      at: 3,
    });
  });

  it("drops comments", () => {
    expect(value('{\n  // where to cut\n  "at": 3, /* seconds */\n  "x": 1\n}')).toEqual({
      at: 3,
      x: 1,
    });
  });

  it("maps Python literals", () => {
    expect(value("{'overwrite': True, 'path': None, 'on': False}")).toEqual({
      overwrite: true,
      path: null,
      on: false,
    });
  });

  it("closes brackets and strings that were cut off", () => {
    expect(value('{"ranges": [{"start": 0, "end": 3}, {"start": 5')).toEqual({
      ranges: [{ start: 0, end: 3 }, { start: 5 }],
    });
    expect(value('{"text": "Hello wor')).toEqual({ text: "Hello wor" });
  });

  it("accepts key=value and => separators", () => {
    expect(value("{from=2, to=4}")).toEqual({ from: 2, to: 4 });
    expect(value('{"a" => 1}')).toEqual({ a: 1 });
  });

  it("understands escapes in single-quoted strings", () => {
    expect(value("{'t': 'it\\'s \\u0041\\n'}")).toEqual({ t: "it's A\n" });
  });

  it("parses numbers in several spellings", () => {
    expect(value("{a: .5, b: +3, c: -1e2, d: 2.}")).toEqual({ a: 0.5, b: 3, c: -100, d: 2 });
  });

  it("tolerates a missing comma and a value-less key", () => {
    expect(value('{"a": 1 "b": 2}')).toEqual({ a: 1, b: 2 });
    expect(value('{"a": , "b": 2}')).toEqual({ a: null, b: 2 });
  });

  it("stops after the first complete value and reports where it ended", () => {
    const text = 'x {"a": 1} trailing {"b": 2}';
    const r = parseJsonLoose(text);
    expect(r).toMatchObject({ ok: true, value: { a: 1 } });
    if (r.ok) expect(text.slice(r.end)).toBe(' trailing {"b": 2}');
  });

  it("can start part-way through a string", () => {
    const text = 'ignore {"a": 1} then {"b": 2}';
    const r = parseJsonLoose(text, text.indexOf('{"b"'));
    expect(r).toMatchObject({ ok: true, value: { b: 2 } });
  });

  it("reports failure instead of throwing", () => {
    expect(parseJsonLoose("")).toMatchObject({ ok: false });
    expect(parseJsonLoose("no json here")).toMatchObject({ ok: false });
    expect(parseJsonLoose('{"a" 1}')).toMatchObject({ ok: false });
    expect(parseJsonLoose("{".repeat(100))).toMatchObject({ ok: false });
  });
});
