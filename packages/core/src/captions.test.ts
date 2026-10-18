import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildAss,
  CAPTION_STYLE_DEFAULTS,
  captionLines,
  captionWords,
  hasCaptionSource,
  setCaptions,
} from "./captions.js";
import { runCommand } from "./commands.js";
import { probe } from "./media.js";
import { exportProject } from "./render.js";
import { type Asset, CaptionSettingsSchema, type Word } from "./schema.js";
import { Session } from "./session.js";
import { addAsset, appendClip, deleteRange, emptyProject } from "./timeline.js";

const words = (...pieces: string[]): Word[] =>
  pieces.map((p) => {
    const [text = "", range = ""] = p.split("@");
    const [s = "0", e = "0"] = range.split("-");
    return { text, start: Number(s), end: Number(e) };
  });

const asset = (w: Word[], duration = 10): Asset => ({
  id: "a1",
  path: "/x/a.mp4",
  kind: "video",
  duration,
  hasAudio: true,
  transcript: { words: w },
});

const project = (w: Word[], duration = 10) =>
  appendClip(
    addAsset(emptyProject("t", { width: 640, height: 360, fps: 30 }), asset(w, duration)),
    "a1",
  );

const talk = words(
  "Hello@1-1.4",
  "brave@1.5-1.9",
  "new@2-2.3",
  "world.@2.4-2.9",
  "Second@4-4.4",
  "sentence@4.5-5",
);

describe("captionWords", () => {
  it("places words on the timeline and drops the ones that were cut", () => {
    const cut = deleteRange(project(talk), 3, 3.8);
    const ws = captionWords(cut);
    expect(ws.map((w) => w.text)).toEqual([
      "Hello",
      "brave",
      "new",
      "world.",
      "Second",
      "sentence",
    ]);
    expect(ws[4]?.start).toBeCloseTo(4 - 0.8, 3); // later words slide left with the footage
    const cutThroughWords = captionWords(deleteRange(project(talk), 1.45, 2.1));
    expect(cutThroughWords.map((w) => w.text)).not.toContain("brave");
  });

  it("is empty without transcripts", () => {
    const p = appendClip(
      addAsset(emptyProject("t"), { ...asset([]), transcript: undefined }),
      "a1",
    );
    expect(captionWords(p)).toEqual([]);
    expect(hasCaptionSource(p)).toBe(false);
    expect(hasCaptionSource(project(talk))).toBe(true);
  });
});

describe("captionLines", () => {
  it("breaks at sentence ends, long pauses and the word limit", () => {
    const lines = captionLines(project(talk), 4);
    expect(lines.map((l) => l.words.map((w) => w.text).join(" "))).toEqual([
      "Hello brave new world.",
      "Second sentence",
    ]);
    expect(captionLines(project(talk), 2).map((l) => l.words.length)).toEqual([2, 2, 2]);
  });

  it("lets a line linger without running into the next one", () => {
    const lines = captionLines(project(talk), 4);
    const [a, b] = lines;
    expect((a?.end ?? 0) - 2.9).toBeGreaterThan(0.2);
    expect(a?.end ?? 99).toBeLessThan(b?.start ?? 0);
  });
});

describe("buildAss", () => {
  const settings = CaptionSettingsSchema.parse({ style: "bold-pop", maxWords: 3, uppercase: true });
  const lines = captionLines(project(talk), 3);

  it("writes a valid header sized to the video", () => {
    const ass = buildAss(lines, settings, 1080, 1920);
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("PlayResY: 1920");
    expect(ass).toContain("[V4+ Styles]");
    expect(ass).toMatch(/Style: Default,Inter,144,/); // 7.5% of 1920
  });

  it("highlights the spoken word in BGR colour, one event per word", () => {
    const ass = buildAss(lines, settings, 640, 360);
    const events = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
    expect(events.length).toBeGreaterThanOrEqual(talk.length);
    // #facc15 (yellow) is &H0015CCFA in ASS BGR order.
    expect(events[0]).toContain("{\\c&H0015CCFA}HELLO");
    expect(events[0]).toContain("0:00:01.00");
  });

  it("shows a whole line at once for the classic look and strips formatting characters", () => {
    const c = CaptionSettingsSchema.parse({ style: "classic" });
    const odd = captionLines(project(words("a{b}@0-0.4", "c\\d@0.5-0.9")), 4);
    const ass = buildAss(odd, c, 640, 360);
    const events = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatch(/,ab cd$/);
  });
});

describe("setCaptions", () => {
  it("applies the style's defaults, keeps overrides, and turns off with null", () => {
    const on = setCaptions(project(talk), { style: "bold-pop" });
    expect(on.timeline.captions).toMatchObject({
      style: "bold-pop",
      ...CAPTION_STYLE_DEFAULTS["bold-pop"],
    });
    const tweaked = setCaptions(on, { maxWords: 2, highlight: "#ff0000" });
    expect(tweaked.timeline.captions).toMatchObject({
      style: "bold-pop",
      maxWords: 2,
      highlight: "#ff0000",
    });
    const restyled = setCaptions(tweaked, { style: "minimal" });
    expect(restyled.timeline.captions).toMatchObject({ style: "minimal", maxWords: 6 });
    expect(setCaptions(restyled, null).timeline.captions).toBeUndefined();
  });

  it("rejects bad colours", () => {
    expect(() => setCaptions(project(talk), { color: "red" })).toThrow();
  });
});

describe("set_captions command", () => {
  it("needs a transcript, then turns captions on and off as undoable edits", async () => {
    const bare = new Session(
      appendClip(addAsset(emptyProject("t"), { ...asset([]), transcript: undefined }), "a1"),
    );
    await expect(
      runCommand({ session: bare }, "set_captions", { style: "bold-pop" }),
    ).rejects.toThrow(/Run transcribe first/);

    const session = new Session(project(talk));
    const r = await runCommand({ session }, "set_captions", { style: "bold-pop" });
    expect(r.summary).toMatch(/Captions on \(bold-pop\), 3 line/);
    expect(session.project.timeline.captions?.style).toBe("bold-pop");
    const state = (await runCommand({ session }, "get_project", {})).data as {
      captions: { lines: number } | null;
    };
    expect(state.captions?.lines).toBeGreaterThan(0);
    await runCommand({ session }, "set_captions", { enabled: false });
    expect(session.project.timeline.captions).toBeUndefined();
    await runCommand({ session }, "undo", {});
    expect(session.project.timeline.captions?.style).toBe("bold-pop");
  });
});

function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function frameAt(file: string, t: number): Buffer {
  return execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-ss",
      String(t),
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      "scale=320:180",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { maxBuffer: 10_000_000 },
  );
}

function changedFraction(buf: Buffer): number {
  const [r, g, b] = [buf[0] ?? 0, buf[1] ?? 0, buf[2] ?? 0];
  let n = 0;
  for (let i = 0; i < buf.length; i += 3) {
    if (
      Math.abs((buf[i] ?? 0) - r) +
        Math.abs((buf[i + 1] ?? 0) - g) +
        Math.abs((buf[i + 2] ?? 0) - b) >
      60
    )
      n++;
  }
  return n / (buf.length / 3);
}

describe.skipIf(!hasFfmpeg())("captions burned into video (needs ffmpeg)", () => {
  let dir: string;
  let src: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "dax-cap-"));
    src = join(dir, "bg.mp4");
    execFileSync("ffmpeg", [
      ...["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=0x224466:s=640x360:r=30:d=8"],
      ...["-f", "lavfi", "-i", "sine=f=300:d=8", "-shortest", "-c:v", "mpeg4", "-c:a", "aac", src],
    ]);
  }, 30_000);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const render = async (style: "classic" | "bold-pop" | "minimal") => {
    const a = await probe(src);
    let p = appendClip(
      addAsset(emptyProject("t", { width: 640, height: 360, fps: 30 }), {
        ...a,
        transcript: { words: talk },
      }),
      a.id,
    );
    p = setCaptions(p, { style });
    const out = join(dir, `${style}.mp4`);
    await exportProject(p, out);
    return out;
  };

  it.each(["classic", "bold-pop", "minimal"] as const)(
    "%s captions appear while words are spoken and not before or after",
    async (style) => {
      const out = await render(style);
      expect(changedFraction(frameAt(out, 0.5))).toBeLessThan(0.0005); // before any speech
      expect(changedFraction(frameAt(out, 1.7))).toBeGreaterThan(0.002); // mid first sentence
      expect(changedFraction(frameAt(out, 4.6))).toBeGreaterThan(0.002); // second sentence
      expect(changedFraction(frameAt(out, 7.5))).toBeLessThan(0.0005); // after the last word
    },
    60_000,
  );
});
