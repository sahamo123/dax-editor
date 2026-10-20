// The transcript logic: streaming, tool steps, stopped runs, and when "Undo this change" is safe.

import { describe, expect, it } from "vitest";
import {
  aiStepsSince,
  applyChatEvent,
  type ChatItem,
  markCancelled,
  setCancelling,
} from "./chat-model";
import { historyItem } from "./test-utils";

const run = (items: ChatItem[]) =>
  items.find((i) => i.kind === "run") as Extract<ChatItem, { kind: "run" }>;

describe("applyChatEvent", () => {
  it("streams text into one paragraph and pairs tool calls with their results", () => {
    let items: ChatItem[] = [];
    items = applyChatEvent(items, "r1", { type: "status", text: "Thinking..." }, 4);
    items = applyChatEvent(items, "r1", { type: "text", text: "Cutting " }, 4);
    items = applyChatEvent(items, "r1", { type: "text", text: "pauses." }, 4);
    items = applyChatEvent(
      items,
      "r1",
      { type: "tool_call", id: "t1", name: "remove_silences", args: {} },
      4,
    );
    expect(run(items).steps.map((s) => s.kind)).toEqual(["text", "tool"]);
    expect(run(items).steps[0]).toMatchObject({ text: "Cutting pauses." });

    items = applyChatEvent(
      items,
      "r1",
      { type: "tool_result", id: "t1", name: "remove_silences", ok: true, summary: "Removed 3" },
      4,
    );
    items = applyChatEvent(items, "r1", { type: "done", turns: 1 }, 4);
    const r = run(items);
    expect(r.status).toBe("done");
    expect(r.startStateId).toBe(4);
    expect(r.steps[1]).toMatchObject({ kind: "tool", result: { ok: true, summary: "Removed 3" } });
  });

  it("replaces status lines instead of stacking them and drops them when the run ends", () => {
    let items: ChatItem[] = [];
    items = applyChatEvent(items, "r", { type: "status", text: "one" }, null);
    items = applyChatEvent(items, "r", { type: "status", text: "two" }, null);
    expect(run(items).steps).toHaveLength(1);
    items = applyChatEvent(items, "r", { type: "error", message: "boom" }, null);
    expect(run(items)).toMatchObject({ status: "error", error: "boom", steps: [] });
  });

  it("starts a separate run for a new run id", () => {
    let items = applyChatEvent([], "a", { type: "done", turns: 1 }, 1);
    items = applyChatEvent(items, "b", { type: "text", text: "x" }, 2);
    expect(items.filter((i) => i.kind === "run")).toHaveLength(2);
  });

  it("keeps a stopped run stopped even if the server later sends done", () => {
    let items = applyChatEvent([], "r", { type: "status", text: "Working" }, 1);
    items = markCancelled(items);
    items = applyChatEvent(items, "r", { type: "done", turns: 1 }, 1);
    expect(run(items).status).toBe("cancelled");
  });

  it("reads a closing event as stopped when the user already pressed Stop", () => {
    let items = applyChatEvent([], "r", { type: "status", text: "Working" }, 1);
    items = setCancelling(items, true);
    items = applyChatEvent(items, "r", { type: "done", turns: 1 }, 1);
    expect(run(items).status).toBe("cancelled");
  });
});

describe("aiStepsSince", () => {
  const history = [
    historyItem({ id: 0, source: "system" }),
    historyItem({ id: 1, source: "manual" }),
    historyItem({ id: 2, source: "ai", label: "a" }),
    historyItem({ id: 3, source: "ai", label: "b", current: true }),
  ];

  it("counts the AI steps back to the undo point", () => {
    expect(aiStepsSince(history, 1)).toBe(2);
    expect(aiStepsSince(history, 2)).toBe(1);
    expect(aiStepsSince(history, 3)).toBe(0);
  });

  it("refuses when manual work lies in between, or the start is unknown", () => {
    expect(aiStepsSince(history, 0)).toBe(-1);
    expect(aiStepsSince(history, null)).toBe(-1);
    expect(aiStepsSince(history, 99)).toBe(-1);
  });
});
