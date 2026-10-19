import { describe, expect, it } from "vitest";
import { extractTextToolCalls, stripThinking } from "./text-tool-calls.js";

const KNOWN = [
  "get_project",
  "delete_range",
  "split",
  "keep_only",
  "remove_silences",
  "export_video",
];
const extract = (text: string) => extractTextToolCalls(text, KNOWN);

describe("extractTextToolCalls", () => {
  it("reads <tool_call> JSON (Hermes / Qwen style)", () => {
    const r = extract(
      'I will cut it.\n<tool_call>\n{"name": "delete_range", "arguments": {"from": 2, "to": 4}}\n</tool_call>',
    );
    expect(r.calls).toEqual([{ name: "delete_range", arguments: { from: 2, to: 4 } }]);
    expect(r.text).toBe("I will cut it.");
  });

  it("reads several <tool_call> blocks in order", () => {
    const r = extract(
      '<tool_call>{"name":"get_project","arguments":{}}</tool_call>\n<tool_call>{"name":"split","arguments":{"at":3}}</tool_call>',
    );
    expect(r.calls.map((c) => c.name)).toEqual(["get_project", "split"]);
    expect(r.text).toBe("");
  });

  it("reads an unclosed <tool_call> and repairs its JSON", () => {
    const r = extract("<tool_call>{'name': 'split', 'arguments': {'at': 3,}}");
    expect(r.calls).toEqual([{ name: "split", arguments: { at: 3 } }]);
  });

  it("reports an unknown tool name inside an explicit tag so the model can be told", () => {
    const r = extract('<tool_call>{"name": "make_it_pretty", "arguments": {}}</tool_call>');
    expect(r.calls).toEqual([{ name: "make_it_pretty", arguments: {} }]);
  });

  it("reports an unreadable tag with an empty name instead of dropping it", () => {
    const r = extract("<tool_call>this is not json at all</tool_call>");
    expect(r.calls).toEqual([{ name: "", arguments: "this is not json at all" }]);
    expect(r.text).toBe("");
  });

  it("finds the name of an unreadable tag when it can", () => {
    const r = extract('<tool_call>{"name": "split", "arguments": </tool_call>');
    expect(r.calls[0]?.name).toBe("split");
  });

  it("reads Llama 3.1 <function=name>{...}</function>", () => {
    const r = extract('<function=delete_range>{"from": 1, "to": 2}</function>');
    expect(r.calls).toEqual([{ name: "delete_range", arguments: { from: 1, to: 2 } }]);
  });

  it("reads <function=...><parameter=...> blocks, also inside <tool_call>", () => {
    const r = extract(
      "<tool_call>\n<function=delete_range>\n<parameter=from>\n2\n</parameter>\n<parameter=to>\n4\n</parameter>\n</function>\n</tool_call>",
    );
    expect(r.calls).toEqual([{ name: "delete_range", arguments: { from: 2, to: 4 } }]);
    expect(r.text).toBe("");
  });

  it("reads Mistral [TOOL_CALLS] arrays", () => {
    const r = extract(
      '[TOOL_CALLS] [{"name": "split", "arguments": {"at": 1}}, {"name": "get_project", "arguments": {}}]',
    );
    expect(r.calls.map((c) => c.name)).toEqual(["split", "get_project"]);
  });

  it("reads Llama 3 <|python_tag|> with parameters", () => {
    const r = extract('<|python_tag|>{"name": "split", "parameters": {"at": 2}}');
    expect(r.calls).toEqual([{ name: "split", arguments: { at: 2 } }]);
  });

  it("reads a fenced JSON block and removes it from the text", () => {
    const r = extract(
      'Here is the call:\n```json\n{"name": "keep_only", "arguments": {"ranges": [{"start": 0, "end": 3}]}}\n```\nDone.',
    );
    expect(r.calls).toEqual([{ name: "keep_only", arguments: { ranges: [{ start: 0, end: 3 }] } }]);
    expect(r.text).toBe("Here is the call:\n\nDone.");
  });

  it("reads a fenced block without a language tag and with an array of calls", () => {
    const r = extract('```\n[{"name": "split", "arguments": {"at": 1}}]\n```');
    expect(r.calls).toEqual([{ name: "split", arguments: { at: 1 } }]);
  });

  it("reads bare JSON in the text", () => {
    const r = extract('Sure. {"name": "remove_silences", "arguments": {}} Let me know.');
    expect(r.calls).toEqual([{ name: "remove_silences", arguments: {} }]);
    expect(r.text).toBe("Sure.  Let me know.");
  });

  it("reads other common key spellings", () => {
    expect(extract('{"tool": "split", "args": {"at": 2}}').calls[0]).toEqual({
      name: "split",
      arguments: { at: 2 },
    });
    expect(
      extract('{"function": {"name": "split", "arguments": "{\\"at\\": 2}"}}').calls[0],
    ).toEqual({
      name: "split",
      arguments: '{"at": 2}',
    });
    expect(
      extract('{"type": "function", "function": {"name": "split", "parameters": {"at": 2}}}')
        .calls[0]?.name,
    ).toBe("split");
    expect(
      extract('{"tool_calls": [{"name": "split", "arguments": {"at": 2}}]}').calls[0]?.name,
    ).toBe("split");
    expect(extract('{"delete_range": {"from": 1, "to": 2}}').calls[0]).toEqual({
      name: "delete_range",
      arguments: { from: 1, to: 2 },
    });
    expect(extract('{"name": "split", "at": 5}').calls[0]).toEqual({
      name: "split",
      arguments: { at: 5 },
    });
  });

  it("matches tool names ignoring case and a functions. prefix", () => {
    const r = extract('{"name": "functions.Delete_Range", "arguments": {"from": 1, "to": 2}}');
    expect(r.calls[0]?.name).toBe("delete_range");
  });

  it("reads a line that is only a function call, with keyword or JSON arguments", () => {
    expect(extract("delete_range(from=2, to=4)").calls).toEqual([
      { name: "delete_range", arguments: { from: 2, to: 4 } },
    ]);
    expect(extract('split({"at": 3})').calls).toEqual([{ name: "split", arguments: { at: 3 } }]);
    expect(extract("get_project()").calls).toEqual([{ name: "get_project", arguments: {} }]);
    expect(extract("```python\nget_project()\nsplit(at=2)\n```").calls.map((c) => c.name)).toEqual([
      "get_project",
      "split",
    ]);
  });

  it("does not treat a tool name mentioned in a sentence as a call", () => {
    const r = extract("I used remove_silences() to tighten the video and then split(at=3) it.");
    expect(r.calls).toEqual([]);
    expect(r.text).toContain("remove_silences()");
  });

  it("leaves ordinary prose and unrelated JSON alone", () => {
    const text = 'The settings are {"name": "Alice", "age": 3} and [1, 2, 3].';
    const r = extract(text);
    expect(r.calls).toEqual([]);
    expect(r.text).toBe(text);
  });

  it("does not take a fenced block of ordinary code", () => {
    const r = extract("```js\nconsole.log(1)\n```");
    expect(r.calls).toEqual([]);
  });

  it("returns plain text unchanged", () => {
    expect(extract("The video is 6 seconds long.")).toEqual({
      calls: [],
      text: "The video is 6 seconds long.",
    });
  });
});

describe("stripThinking", () => {
  it("removes closed, unclosed and stray reasoning tags", () => {
    expect(stripThinking("<think>hmm\nlet me see</think>The answer.")).toBe("The answer.");
    expect(stripThinking("Answer.<think>and more thinking that never ends")).toBe("Answer.");
    expect(stripThinking("I reasoned a lot</think>\nThe answer.")).toBe("The answer.");
    expect(stripThinking("<THINKING>x</THINKING>Hi")).toBe("Hi");
  });

  it("leaves normal text alone", () => {
    expect(stripThinking("  Hello  ")).toBe("Hello");
  });
});
