import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixturePath } from "../test-support/helpers.js";
import { isSpecialToken, parseWhisperJson, stripNonSpeechTags } from "./whisper-json.js";

const load = (name: string) => readFileSync(fixturePath(name), "utf8");

/** Build a minimal -ojf document from [text, fromMs, toMs] triples. */
function doc(tokens: [string, number, number][], language = "en"): string {
  return JSON.stringify({
    result: { language },
    transcription: [
      {
        offsets: { from: 0, to: 10000 },
        text: tokens.map((t) => t[0]).join(""),
        tokens: tokens.map(([text, from, to]) => ({ text, offsets: { from, to }, p: 0.9 })),
      },
    ],
  });
}

describe("parseWhisperJson on real whisper-cli output", () => {
  it("reads the JFK sample captured from tiny.en: 22 words in order with times in seconds", () => {
    const r = parseWhisperJson(load("jfk.tiny.en.full.json"));
    expect(r.language).toBe("en");
    expect(r.words.map((w) => w.text).join(" ")).toBe(
      "and so my fellow Americans ask not what your country can do for you ask what you can do for your country",
    );
    expect(r.words[0]?.start).toBeCloseTo(0.32, 2);
    expect(r.words.at(-1)?.end).toBeCloseTo(10.35, 2);
    for (const w of r.words) expect(w.end).toBeGreaterThanOrEqual(w.start);
  });

  it("drops special tokens such as [_BEG_] and [_TT_380]", () => {
    const r = parseWhisperJson(load("phrases-disfluencies.tiny.en.full.json"));
    expect(r.words.some((w) => w.text.startsWith("[_"))).toBe(false);
  });

  it("keeps the disfluencies the engine wrote and attaches punctuation to the previous word", () => {
    const r = parseWhisperJson(load("phrases-disfluencies.tiny.en.full.json"));
    const texts = r.words.map((w) => w.text);
    expect(texts).toContain("Um,");
    expect(texts).toContain("uh,");
    expect(texts).toContain("um,");
    expect(texts).toContain("channel.");
  });

  it("does not stretch a word over the punctuation token that follows it", () => {
    const r = parseWhisperJson(load("phrases-disfluencies.tiny.en.full.json"));
    const channel = r.words.find((w) => w.text === "channel.");
    // The engine stamps "." with the pause after the sentence (ends at 5.0 s); the word ends at 4.35 s.
    expect(channel?.end).toBeCloseTo(4.35, 2);
  });

  it("returns no words for silence, where the engine writes [BLANK_AUDIO]", () => {
    const r = parseWhisperJson(load("silence.tiny.en.full.json"));
    expect(r.words).toEqual([]);
    expect(r.language).toBe("en");
  });

  it("falls back to spreading words across the segment when the file has no tokens (-oj)", () => {
    const r = parseWhisperJson(load("jfk.tiny.en.segments-only.json"));
    expect(r.words).toHaveLength(22);
    expect(r.words[0]?.start).toBe(0);
    expect(r.words.at(-1)?.end).toBeCloseTo(10.36, 1);
    for (let i = 1; i < r.words.length; i++) {
      expect(r.words[i]?.start).toBeGreaterThanOrEqual(r.words[i - 1]?.start ?? 0);
    }
  });
});

describe("token merging", () => {
  it("joins sub-word tokens into words; a leading space starts a new word", () => {
    const r = parseWhisperJson(
      doc([
        [" Vid", 0, 100],
        ["il", 100, 250],
        [" Ed", 300, 400],
        ["d", 400, 450],
        ["ings", 450, 600],
      ]),
    );
    expect(r.words.map((w) => w.text)).toEqual(["Vidil", "Eddings"]);
    expect(r.words[0]).toMatchObject({ start: 0, end: 0.25 });
    expect(r.words[1]).toMatchObject({ start: 0.3, end: 0.6 });
  });

  it("averages token probabilities into a word confidence", () => {
    const r = parseWhisperJson(doc([[" ok", 0, 100]]));
    expect(r.words[0]?.probability).toBeCloseTo(0.9);
  });

  it("keeps apostrophes inside words", () => {
    const r = parseWhisperJson(
      doc([
        [" I", 0, 50],
        ["'m", 50, 120],
      ]),
    );
    expect(r.words.map((w) => w.text)).toEqual(["I'm"]);
  });

  it("starts a word at an opening quote and keeps the quote on it", () => {
    const r = parseWhisperJson(
      doc([
        [' "', 0, 10],
        ["Vid", 10, 200],
        ['"', 200, 210],
      ]),
    );
    expect(r.words.map((w) => w.text)).toEqual(['"Vid"']);
  });

  it("never lets an end time precede its start", () => {
    const r = parseWhisperJson(doc([[" odd", 500, 400]]));
    expect(r.words[0]?.end).toBeGreaterThanOrEqual(r.words[0]?.start ?? 0);
  });
});

describe("non-speech tags", () => {
  it.each([["[BLANK_AUDIO]"], ["[Music]"], ["(applause)"], ["*laughs*"], ["♪"]])(
    "removes %s",
    (tag) => {
      const words = [
        { text: "hi", start: 0, end: 1 },
        { text: tag, start: 1, end: 2 },
        { text: "there", start: 2, end: 3 },
      ];
      expect(stripNonSpeechTags(words).map((w) => w.text)).toEqual(["hi", "there"]);
    },
  );

  it("removes a tag that spans several words", () => {
    const words = ["a", "[", "Silence", "]", "b"].map((text, i) => ({
      text,
      start: i,
      end: i + 1,
    }));
    expect(stripNonSpeechTags(words).map((w) => w.text)).toEqual(["a", "b"]);
  });

  it("keeps an opening bracket that never closes", () => {
    const words = ["see", "(note", "this", "carefully"].map((text, i) => ({
      text,
      start: i,
      end: i + 1,
    }));
    expect(stripNonSpeechTags(words)).toHaveLength(4);
  });

  it("recognises special tokens", () => {
    expect(isSpecialToken("[_BEG_]")).toBe(true);
    expect(isSpecialToken("[_TT_891]")).toBe(true);
    expect(isSpecialToken("<|endoftext|>")).toBe(true);
    expect(isSpecialToken(" [BLANK_AUDIO]")).toBe(false);
    expect(isSpecialToken(" hello")).toBe(false);
  });
});

describe("bad input", () => {
  it("explains non-JSON output", () => {
    expect(() => parseWhisperJson("{ nope")).toThrow(/not valid JSON/);
  });

  it("names the missing field when the shape is wrong", () => {
    expect(() => parseWhisperJson(JSON.stringify({ result: {} }))).toThrow(
      /unexpected shape.*transcription/,
    );
  });
});
