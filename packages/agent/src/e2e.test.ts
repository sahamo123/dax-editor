// End to end: the agent drives the REAL core Session and a real FFmpeg-generated video through a scripted
// provider that behaves like a good model, and has to pass the same three tasks as the eval suite
// (packages/evals/tasks). Skipped automatically when FFmpeg is missing. No network.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addAsset,
  appendClip,
  detectSilence,
  emptyProject,
  exportProject,
  ffmpegBin,
  mainClips,
  probe,
  Session,
  timelineDuration,
} from "@dax/core";
import type { AgentEvent } from "@dax/protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Agent, createAgent } from "./agent.js";
import type { AgentProvider, ChatMessage, ProviderResponse } from "./types.js";

function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const toolResults = (messages: ChatMessage[]) => messages.filter((m) => m.role === "tool");
const usage = { inputTokens: 500, outputTokens: 40 };

/**
 * A scripted stand-in for a capable model. It looks at the project first, picks the high-level command
 * that fits the request, and then reports what the tool result said. It decides from the conversation it
 * is shown, like a model would; nothing is hard-wired to a call count except "look, act, report".
 */
function goodModel(): AgentProvider {
  return {
    name: "good-model",
    async chat(req): Promise<ProviderResponse> {
      // Only the current request counts: everything after the user's latest real message.
      const isRequest = (m: ChatMessage) =>
        m.role === "user" && !m.content.startsWith("Please tell");
      const start = req.messages.map(isRequest).lastIndexOf(true);
      const current = req.messages.slice(start);
      const first = current[0];
      const request = first?.role === "user" ? first.content : "";
      const results = toolResults(current);
      const call = (name: string, args: unknown): ProviderResponse => ({
        text: "",
        toolCalls: [{ id: `call_${results.length + 1}`, name, arguments: args }],
        stopReason: "tool_use",
        usage,
      });

      if (results.length === 0) return call("get_project", {});

      if (results.length === 1) {
        const seconds = /first (\d+) seconds/i.exec(request);
        const range = /from (\d+) seconds to (\d+) seconds/i.exec(request);
        if (/silen/i.test(request)) return call("remove_silences", {});
        if (seconds) return call("keep_only", { ranges: [{ start: 0, end: Number(seconds[1]) }] });
        if (range) return call("delete_range", { from: Number(range[1]), to: Number(range[2]) });
        return { text: "Which part do you mean?", toolCalls: [], stopReason: "end", usage };
      }

      const last = results[results.length - 1];
      const said = last?.role === "tool" ? last.content.split("\n")[0] : "";
      return { text: `Done. ${said}`, toolCalls: [], stopReason: "end", usage };
    },
  };
}

describe.skipIf(!hasFfmpeg())("agent end to end with the real engine (needs ffmpeg)", () => {
  let dir: string;
  let fixture: string;
  let agent: Agent;

  // Same footage as packages/evals: 6 s, tone 0-2 s, silence 2-4 s, tone 4-6 s.
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "dax-agent-e2e-"));
    fixture = join(dir, "tone-silence-tone.mp4");
    execFileSync(ffmpegBin(), [
      ...["-y", "-hide_banner", "-loglevel", "error"],
      ...["-f", "lavfi", "-i", "testsrc=d=6:s=320x240:r=30"],
      ...["-f", "lavfi", "-i", "sine=f=440:d=2"],
      ...["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=2"],
      ...["-f", "lavfi", "-i", "sine=f=440:d=2"],
      ...["-filter_complex", "[1:a][2:a][3:a]concat=n=3:v=0:a=1[a]"],
      ...["-map", "0:v", "-map", "[a]", "-c:v", "mpeg4", "-c:a", "aac", "-shortest"],
      fixture,
    ]);
    agent = createAgent({ provider: goodModel() });
  }, 60_000);

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  async function attempt(prompt: string) {
    const asset = await probe(fixture);
    const session = new Session(appendClip(addAsset(emptyProject("e2e"), asset), asset.id));
    const events: AgentEvent[] = [];
    const result = await agent.run(prompt, { session, onEvent: (e) => events.push(e) });
    return { session, events, result };
  }

  it("delete-middle-2s: deletes 2 to 4 seconds and closes the gap", async () => {
    const { session, result, events } = await attempt(
      "Delete the part from 2 seconds to 4 seconds.",
    );
    expect(result.stopReason).toBe("done");
    expect(timelineDuration(session.project)).toBeGreaterThan(3.9);
    expect(timelineDuration(session.project)).toBeLessThan(4.1);
    expect(mainClips(session.project)).toHaveLength(2);
    expect(session.history().map((h) => h.source)).toEqual(["system", "ai"]);
    expect(events.map((e) => e.type)).toContain("tool_call");
    expect(events[events.length - 1]).toMatchObject({ type: "done", turns: 3 });
  }, 60_000);

  it("keep-first-3-seconds: cuts down to the first 3 seconds", async () => {
    const { session, result } = await attempt("Cut the video down to just the first 3 seconds.");
    expect(result.stopReason).toBe("done");
    expect(timelineDuration(session.project)).toBeGreaterThan(2.9);
    expect(timelineDuration(session.project)).toBeLessThan(3.1);
    expect(mainClips(session.project).length).toBeLessThanOrEqual(1);
    expect(result.toolCalls).toMatchObject({ total: 2, invalid: 0, failed: 0 });
  }, 60_000);

  it("remove-silences: leaves no silent stretch in the rendered result", async () => {
    const { session, result } = await attempt("Remove all the silent parts of this video.");
    expect(result.stopReason).toBe("done");
    expect(result.text).toMatch(/^Done\. Removed \d+ silence/);
    expect(timelineDuration(session.project)).toBeGreaterThan(3.6);
    expect(timelineDuration(session.project)).toBeLessThan(4.6);

    // Same check the eval harness makes: render, then look for silences of 0.5 s or more.
    const out = join(dir, "silences-removed.mp4");
    await exportProject(session.project, out);
    const rendered = await probe(out);
    expect(await detectSilence(out, rendered.duration, { minDuration: 0.5 })).toHaveLength(0);
  }, 120_000);

  it("asks a question instead of editing when the request is unclear, then undo restores the project", async () => {
    const asset = await probe(fixture);
    const session = new Session(appendClip(addAsset(emptyProject("e2e"), asset), asset.id));
    const first = await agent.run("Make it better", { session });
    expect(first.text).toBe("Which part do you mean?");
    expect(session.history()).toHaveLength(1);

    // An edit, then undo through the same registry the UI uses.
    await agent.run("Cut the video down to just the first 3 seconds.", {
      session,
      history: first.messages,
    });
    expect(timelineDuration(session.project)).toBeLessThan(3.1);
    await session.undo();
    expect(timelineDuration(session.project)).toBeGreaterThan(5.9);
  }, 60_000);
});
