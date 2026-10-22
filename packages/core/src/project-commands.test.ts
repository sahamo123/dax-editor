// Word corrections preserve source timing and undo; unknown source replacements cannot affect project state.
import { describe, expect, it } from "vitest";
import { tryRunCommand } from "./commands.js";
import { Session } from "./session.js";
import { addAsset, emptyProject } from "./timeline.js";

describe("project recovery commands", () => {
  it("corrects one word while preserving timing and supports undo", async () => {
    const original = addAsset(emptyProject("Speech"), {
      id: "a1",
      path: process.platform === "win32" ? "C:\\media\\video.mp4" : "/media/video.mp4",
      kind: "video",
      duration: 3,
      hasAudio: true,
      transcript: { words: [{ text: "helo", start: 1, end: 1.5 }] },
    });
    const session = new Session(original);
    expect(
      (
        await tryRunCommand({ session }, "correct_transcript_word", {
          assetId: "a1",
          wordIndex: 0,
          text: "hello",
        })
      ).ok,
    ).toBe(true);
    expect(session.project.assets.a1?.transcript?.words[0]).toEqual({
      text: "hello",
      start: 1,
      end: 1.5,
    });
    await session.undo();
    expect(session.project).toEqual(original);
    expect(
      (
        await tryRunCommand({ session }, "correct_transcript_word", {
          assetId: "a1",
          wordIndex: 10,
          text: "hello",
        })
      ).ok,
    ).toBe(false);
    expect(session.project).toEqual(original);
  });
  it("refuses unknown media without creating history", async () => {
    const session = new Session(emptyProject("Empty"));
    expect(
      (
        await tryRunCommand({ session }, "relink_media", {
          assetId: "missing",
          path: "https://remote.invalid/video.mp4",
        })
      ).ok,
    ).toBe(false);
    expect(session.history()).toHaveLength(1);
  });
});
