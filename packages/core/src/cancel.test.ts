// Cancelling a command: it must not start after the cancel, and must not apply its edit once the cancel has happened.

import { describe, expect, it } from "vitest";
import { tryRunCommand } from "./commands.js";
import type { Asset } from "./schema.js";
import { Session } from "./session.js";
import { addAsset, appendClip, emptyProject } from "./timeline.js";
import type { Transcriber } from "./transcript.js";

const asset: Asset = { id: "a1", path: "/x/a.mp4", kind: "video", duration: 10, hasAudio: true };
const fresh = () => new Session(appendClip(addAsset(emptyProject("t"), asset), "a1"));

describe("cancelling a command", () => {
  it("does not run an edit that was cancelled before it started", async () => {
    const session = fresh();
    const before = session.project;
    const ac = new AbortController();
    ac.abort();
    const r = await tryRunCommand({ session, signal: ac.signal }, "split", { at: 4 });
    expect(r.ok).toBe(false);
    expect(session.project).toBe(before);
    expect(session.history()).toHaveLength(1);
  });

  it("does not apply a transcript when the user cancels while speech recognition is running", async () => {
    // The transcriber is cancelled mid-run but still hands back a result, as a provider that ignores the signal would.
    const session = fresh();
    const before = session.project;
    const ac = new AbortController();
    const transcriber: Transcriber = {
      transcribe: async () => {
        ac.abort();
        return { words: [{ text: "hi", start: 0, end: 0.5 }] };
      },
    };
    const r = await tryRunCommand({ session, transcriber, signal: ac.signal }, "transcribe", {});
    // Before the fix the transcript was applied after the cancel, so the project changed.
    expect(r.ok).toBe(false);
    expect(session.project).toBe(before);
    expect(session.history()).toHaveLength(1);
  });

  it("runs normally when no signal is given", async () => {
    const session = fresh();
    const r = await tryRunCommand({ session }, "split", { at: 4 });
    expect(r.ok).toBe(true);
    expect(session.history()).toHaveLength(2);
  });
});
