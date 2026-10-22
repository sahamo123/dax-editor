// Word corrections preserve source timing and undo; unknown source replacements cannot affect project state.
import { describe, expect, it } from "vitest";
import { tryRunCommand } from "./commands.js";
import { Session } from "./session.js";
import { addAsset, emptyProject } from "./timeline.js";

describe("project recovery commands", () => {
  it("commits a successful batch as one undo step and leaves no partial edits after failure", async () => {
    const original = emptyProject("Batch");
    const session = new Session(original);
    expect(
      (
        await tryRunCommand({ session }, "apply_edit_batch", {
          operations: [
            { name: "set_format", args: { width: 1080, height: 1080 } },
            { name: "set_format", args: { fit: "cover" } },
          ],
        })
      ).ok,
    ).toBe(true);
    expect(session.history()).toHaveLength(2);
    await session.undo();
    expect(session.project).toEqual(original);
    expect(
      (
        await tryRunCommand({ session }, "apply_edit_batch", {
          operations: [
            { name: "set_format", args: { width: 720, height: 1280 } },
            { name: "trim_clip", args: { clipId: "missing", in: 1 } },
          ],
        })
      ).ok,
    ).toBe(false);
    expect(session.project).toEqual(original);
    expect(
      (
        await tryRunCommand({ session }, "apply_edit_batch", {
          operations: [{ name: "export_video", args: { path: "bad.mp4" } }],
        })
      ).ok,
    ).toBe(false);
  });
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
