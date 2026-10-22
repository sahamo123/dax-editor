// Context budgets for small models: limits derived from the window, the small-model tool set, trimmed history, and the
// notices that tell a model how to page through a long result.

import { type Asset, addAsset, appendClip, commandTools, emptyProject, Session } from "@dax/core";
import { describe, expect, it } from "vitest";
import { createAgent } from "./agent.js";
import { contextBudget, SMALL_MODEL_TOOL_NAMES, smallModelTools, trimHistory } from "./budget.js";
import { ScriptedProvider } from "./scripted.js";
import type { ChatMessage, ToolCall } from "./types.js";

describe("contextBudget", () => {
  it("keeps the long-standing limits when no window size is given", () => {
    const b = contextBudget();
    expect(b).toMatchObject({
      compact: false,
      maxContextChars: 60_000,
      maxToolResultChars: 6000,
      skillChars: 6000,
    });
  });

  it("gives a small window a compact prompt and smaller limits", () => {
    const small = contextBudget(8192);
    const big = contextBudget(32768);
    expect(small.compact).toBe(true);
    expect(big.compact).toBe(false);
    expect(small.maxContextChars).toBeLessThan(big.maxContextChars);
    expect(small.maxToolResultChars).toBeLessThan(big.maxToolResultChars);
    expect(small.skillChars).toBeLessThan(big.skillChars);
  });

  it("never gives a smaller window larger limits", () => {
    const sizes = [2048, 4096, 8192, 16384, 32768, 131072].map((t) => contextBudget(t));
    for (let i = 1; i < sizes.length; i++) {
      const prev = sizes[i - 1];
      const cur = sizes[i];
      if (!prev || !cur) throw new Error("missing budget");
      expect(cur.maxContextChars).toBeGreaterThanOrEqual(prev.maxContextChars);
      expect(cur.maxToolResultChars).toBeGreaterThanOrEqual(prev.maxToolResultChars);
      expect(cur.skillChars).toBeGreaterThanOrEqual(prev.skillChars);
    }
  });
});

describe("smallModelTools", () => {
  it("retains everyday steering tools and adds requested speech and motion capabilities", () => {
    expect(
      smallModelTools("make it portrait")
        .map((tool) => tool.name)
        .sort(),
    ).toEqual([...SMALL_MODEL_TOOL_NAMES].sort());
    expect(smallModelTools("add a Blender intro").map((tool) => tool.name)).toContain(
      "render_motion_template",
    );
    expect(smallModelTools("correct captions").map((tool) => tool.name)).toContain(
      "correct_transcript_word",
    );
    expect(smallModelTools("trim the clip and lower the volume").map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["trim_clip", "set_volume"]),
    );
  });
  it("offers only commands that exist, and a short list", () => {
    const tools = smallModelTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...SMALL_MODEL_TOOL_NAMES].sort());
    expect(tools.length).toBeLessThanOrEqual(25);
    expect(commandTools().length).toBeGreaterThan(tools.length);
  });
});

describe("trimHistory", () => {
  const user = (content: string): ChatMessage => ({ role: "user", content });
  const reply = (text: string): ChatMessage => ({ role: "assistant", text, toolCalls: [] });

  it("keeps the most recent part that fits, starting at a user message", () => {
    const messages = [
      user("old ".repeat(100)),
      reply("a"),
      user("newer"),
      reply("b"),
      user("newest"),
    ];
    // Within 60 characters the newest three messages fit; the cut lands on a user turn, so the reply "a" is dropped too.
    const kept = trimHistory(messages, 60);
    expect(kept[0]).toEqual(user("newer"));
    expect(kept.at(-1)).toEqual(user("newest"));
    expect(kept).toHaveLength(3);
  });

  it("keeps the newest request even when it alone is over the limit", () => {
    const huge = user("x".repeat(5000));
    expect(trimHistory([user("older"), reply("ok"), huge], 100)).toEqual([huge]);
  });

  it("keeps everything when it already fits", () => {
    const messages = [user("hi"), reply("hello")];
    expect(trimHistory(messages, 10_000)).toEqual(messages);
  });
});

describe("paged results", () => {
  const words = Array.from({ length: 500 }, (_, i) => ({
    text: `w${i}`,
    start: i * 0.5,
    end: i * 0.5 + 0.4,
  }));
  const asset: Asset = {
    id: "a1",
    path: "/x/a.mp4",
    kind: "video",
    duration: 260,
    hasAudio: true,
    transcript: { words },
  };
  const session = () => new Session(appendClip(addAsset(emptyProject("t"), asset), "a1"));
  const call = (name: string, args: unknown): ToolCall => ({ id: "c1", name, arguments: args });

  /** The tool result the model is sent after one call to `name`. */
  async function toolResult(name: string, args: unknown, options = {}): Promise<string> {
    const provider = new ScriptedProvider([{ toolCalls: [call(name, args)] }, { text: "ok" }]);
    const agent = createAgent({ provider, ...options });
    await agent.run("go", { session: session() });
    const msg = provider.requests[1]?.messages.find((m) => m.role === "tool");
    if (msg?.role !== "tool") throw new Error("no tool result was sent");
    return msg.content;
  }

  it("says where the next page of a transcript starts", async () => {
    const content = await toolResult("get_transcript", {}, { maxToolResultChars: 60_000 });
    expect(content).toContain("More: call get_transcript again with offset 300 for the rest.");
  });

  it("tells the model how to ask for less when a result is cut", async () => {
    const content = await toolResult("get_transcript", {}, { maxToolResultChars: 200 });
    expect(content).toContain(
      "more characters cut. Call get_transcript again with a smaller limit",
    );
    expect(content).toContain("offset 300");
  });
});
