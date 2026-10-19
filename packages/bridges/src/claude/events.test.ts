// Tests for turning Claude Code's stream-json lines into chat events, using a recorded real run plus synthetic edge cases.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentEvent } from "@dax/protocol";
import { describe, expect, it } from "vitest";
import { FIXTURE_DIR } from "../test/fake-cli.js";
import { ClaudeEventMapper, displayToolName } from "./events.js";

/** Feed every line of a fixture through a fresh mapper and collect what comes out. */
function replay(lines: unknown[]): { events: AgentEvent[]; mapper: ClaudeEventMapper } {
  const mapper = new ClaudeEventMapper();
  const events: AgentEvent[] = [];
  for (const line of lines) events.push(...mapper.handle(line).events);
  return { events, mapper };
}

const recorded = readFileSync(join(FIXTURE_DIR, "claude-edit.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l) as unknown);

describe("a recorded real run (get_project, set_format, undo, get_project, answer)", () => {
  const { events } = replay(recorded);

  it("shows each tool call once, with the server prefix removed", () => {
    const calls = events.filter((e) => e.type === "tool_call");
    expect(calls.map((c) => (c.type === "tool_call" ? c.name : ""))).toEqual([
      "get_project",
      "set_format",
      "undo",
      "get_project",
    ]);
    const setFormat = calls[1];
    expect(setFormat).toMatchObject({ args: { preset: "portrait-1080x1920" } });
  });

  it("pairs every result with its call and shows our summary rather than the JSON envelope", () => {
    const results = events.filter((e) => e.type === "tool_result");
    expect(results).toHaveLength(4);
    expect(results[1]).toMatchObject({
      name: "set_format",
      ok: true,
      summary: "Format is now 1080x1920 at 30 fps (fit: blur).",
    });
    const calls = events.filter((e) => e.type === "tool_call");
    expect(results.map((r) => (r.type === "tool_result" ? r.id : ""))).toEqual(
      calls.map((c) => (c.type === "tool_call" ? c.id : "")),
    );
  });

  it("streams the final answer once, not twice", () => {
    const text = events
      .filter((e): e is Extract<AgentEvent, { type: "text" }> => e.type === "text")
      .map((e) => e.text)
      .join("");
    expect(text).toBe(
      "The final format is 1920x1080 at 30 fps (landscape), because the undo reverted the portrait change.",
    );
  });

  it("ends with exactly one done event carrying turns and token counts", () => {
    const terminal = events.filter((e) => e.type === "done" || e.type === "error");
    expect(terminal).toHaveLength(1);
    expect(events[events.length - 1]).toMatchObject({ type: "done", turns: 5 });
    const done = events[events.length - 1];
    expect(done?.type === "done" && done.inputTokens).toBeGreaterThan(0);
    expect(done?.type === "done" && done.outputTokens).toBeGreaterThan(0);
  });

  it("reports the init facts", () => {
    const init = new ClaudeEventMapper().handle(recorded[0]).init;
    expect(init).toMatchObject({ mcpStatus: "connected", apiKeySource: "none", usesApiKey: false });
    expect(init?.sessionId).toBeTruthy();
  });

  it("ignores noise lines (status, rate limits) without producing events", () => {
    const mapper = new ClaudeEventMapper();
    expect(mapper.handle({ type: "rate_limit_event", rate_limit_info: {} }).events).toEqual([]);
    expect(
      mapper.handle({ type: "system", subtype: "status", status: "requesting" }).events,
    ).toEqual([]);
    expect(mapper.handle({ type: "something_new", payload: 1 }).events).toEqual([]);
    expect(mapper.handle("not an object").events).toEqual([]);
    expect(mapper.handle(null).events).toEqual([]);
  });
});

describe("text handling", () => {
  it("uses the complete assistant text when no partial messages were streamed", () => {
    const { events } = replay([
      { type: "assistant", message: { id: "m1", content: [{ type: "text", text: "Hello" }] } },
      // The CLI may repeat the same message; it must not be shown twice.
      { type: "assistant", message: { id: "m1", content: [{ type: "text", text: "Hello" }] } },
    ]);
    expect(events).toEqual([{ type: "text", text: "Hello" }]);
  });

  it("separates texts from different messages with a paragraph break", () => {
    const { events } = replay([
      { type: "assistant", message: { id: "m1", content: [{ type: "text", text: "First." }] } },
      { type: "assistant", message: { id: "m2", content: [{ type: "text", text: "Second." }] } },
    ]);
    expect(events).toEqual([
      { type: "text", text: "First." },
      { type: "text", text: "\n\nSecond." },
    ]);
  });

  it("skips output from sub-agents", () => {
    const { events } = replay([
      {
        type: "assistant",
        parent_tool_use_id: "toolu_x",
        message: { id: "m1", content: [{ type: "text", text: "inner" }] },
      },
    ]);
    expect(events).toEqual([]);
  });
});

describe("tool results", () => {
  const call = {
    type: "assistant",
    message: {
      id: "m1",
      content: [{ type: "tool_use", id: "t1", name: "mcp__dax__smart_cut", input: { a: 1 } }],
    },
  };

  it("shows the first line of a text result as the summary", () => {
    const { events } = replay([
      call,
      {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "t1",
              content: [{ type: "text", text: 'Removed 3 cuts.\n{"data":1}' }],
            },
          ],
        },
      },
    ]);
    expect(events[1]).toEqual({
      type: "tool_result",
      id: "t1",
      name: "smart_cut",
      ok: true,
      summary: "Removed 3 cuts.",
    });
  });

  it("keeps the whole message of a failure and marks it not ok", () => {
    const { events } = replay([
      call,
      {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "t1",
              is_error: true,
              content: "Clip c9 does not exist.\nTry get_project.",
            },
          ],
        },
      },
    ]);
    expect(events[1]).toMatchObject({
      ok: false,
      summary: "Clip c9 does not exist.\nTry get_project.",
    });
  });

  it("shortens very long summaries", () => {
    const long = "x".repeat(1000);
    const { events } = replay([
      call,
      {
        type: "user",
        message: { content: [{ type: "tool_result", tool_use_id: "t1", content: long }] },
      },
    ]);
    const result = events[1];
    expect(result?.type === "tool_result" && result.summary.length).toBeLessThanOrEqual(240);
  });

  it("copes with a result for a call it never saw", () => {
    const { events } = replay([
      {
        type: "user",
        message: { content: [{ type: "tool_result", tool_use_id: "zz", content: "ok" }] },
      },
    ]);
    expect(events).toEqual([
      { type: "tool_result", id: "zz", name: "unknown", ok: true, summary: "ok" },
    ]);
  });

  it("shows tools outside our server under their own name", () => {
    expect(displayToolName("Bash")).toBe("Bash");
    expect(displayToolName("mcp__dax__undo")).toBe("undo");
  });
});

describe("the result line", () => {
  const result = (extra: Record<string, unknown>) => ({
    type: "result",
    subtype: "success",
    is_error: false,
    num_turns: 2,
    ...extra,
  });

  it("turns a failed run into one error with a message a person can act on", () => {
    const signedOut = new ClaudeEventMapper().handle(
      result({ is_error: true, result: "Not logged in · Please run /login" }),
    );
    expect(signedOut.events).toEqual([
      {
        type: "error",
        message: expect.stringContaining("Run `claude` once in a terminal to sign in"),
      },
    ]);
    const turns = new ClaudeEventMapper().handle(
      result({ is_error: true, subtype: "error_max_turns", num_turns: 25 }),
    );
    expect(turns.events[0]).toMatchObject({
      type: "error",
      message: expect.stringContaining("25 steps"),
    });
    const budget = new ClaudeEventMapper().handle(
      result({ is_error: true, subtype: "error_max_budget_usd" }),
    );
    expect(budget.events[0]).toMatchObject({
      type: "error",
      message: expect.stringContaining("spending limit"),
    });
    const other = new ClaudeEventMapper().handle(
      result({ is_error: true, subtype: "error_during_execution", result: "Boom" }),
    );
    expect(other.events[0]).toEqual({ type: "error", message: "Boom" });
    const empty = new ClaudeEventMapper().handle(
      result({ is_error: true, subtype: "error_during_execution" }),
    );
    expect(empty.events[0]).toMatchObject({ type: "error" });
  });

  it("reports denied tools so the runner can log them", () => {
    const mapped = new ClaudeEventMapper().handle(
      result({ permission_denials: [{ tool_name: "Bash" }, { tool_name: "Write" }] }),
    );
    expect(mapped.result?.deniedTools).toEqual(["Bash", "Write"]);
  });

  it("flags a run that bills an API key", () => {
    const mapped = new ClaudeEventMapper().handle({
      type: "system",
      subtype: "init",
      apiKeySource: "ANTHROPIC_API_KEY",
      mcp_servers: [],
    });
    expect(mapped.init?.usesApiKey).toBe(true);
    expect(mapped.events[0]).toMatchObject({
      type: "status",
      text: expect.stringContaining("billed"),
    });
  });

  it("treats a missing server entry as 'not listed'", () => {
    const mapped = new ClaudeEventMapper().handle({
      type: "system",
      subtype: "init",
      mcp_servers: [{ name: "other", status: "connected" }],
    });
    expect(mapped.init?.mcpStatus).toBeUndefined();
  });
});
