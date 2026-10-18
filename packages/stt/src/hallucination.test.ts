import { describe, expect, it } from "vitest";
import { collapseRepeatLoops, dropWordsInSilence } from "./hallucination.js";
import type { RawWord } from "./whisper-json.js";

const words = (texts: string[], step = 0.5): RawWord[] =>
  texts.map((text, i) => ({ text, start: i * step, end: i * step + step }));

describe("collapseRepeatLoops", () => {
  it("reduces a single word repeated many times to one", () => {
    const r = collapseRepeatLoops(words(["so", ...Array(40).fill("the"), "end"]));
    expect(r.words.map((x) => x.text)).toEqual(["so", "the", "end"]);
    expect(r.removed).toBe(39);
  });

  it("reduces a repeated sentence to its first occurrence", () => {
    const sentence = "thank you for watching this video".split(" ");
    const r = collapseRepeatLoops(
      words(["intro", ...sentence, ...sentence, ...sentence, ...sentence, "outro"]),
    );
    expect(r.words.map((x) => x.text)).toEqual(["intro", ...sentence, "outro"]);
    expect(r.removed).toBe(sentence.length * 3);
  });

  it("ignores case and punctuation when comparing", () => {
    const r = collapseRepeatLoops(words(["Okay,", "okay", "OKAY.", "okay", "Okay", "okay!"]));
    expect(r.words).toHaveLength(1);
  });

  it("leaves natural repetition alone", () => {
    const natural = words("it is very very very good and no no no I mean it".split(" "));
    expect(collapseRepeatLoops(natural).words).toHaveLength(natural.length);
  });

  it("leaves short phrase repeats alone (a chorus said three times)", () => {
    const t = words("la la la la la".split(" ").slice(0, 4));
    expect(collapseRepeatLoops(t).words).toHaveLength(4);
  });

  it("can be tuned", () => {
    const t = words(["go", "go", "go"]);
    expect(collapseRepeatLoops(t, { minWordRepeats: 3 }).words).toHaveLength(1);
  });

  it("keeps the first occurrence's timing", () => {
    const r = collapseRepeatLoops(words(Array(10).fill("hey")));
    expect(r.words[0]).toMatchObject({ start: 0, end: 0.5 });
  });
});

describe("dropWordsInSilence", () => {
  const silences = [{ start: 10, end: 20 }];

  it("drops words that lie inside a silence (the classic 'Thank you.' over nothing)", () => {
    const t: RawWord[] = [
      { text: "hello", start: 8, end: 8.6 },
      { text: "Thank", start: 12, end: 12.4 },
      { text: "you.", start: 12.4, end: 12.9 },
    ];
    expect(dropWordsInSilence(t, silences).map((x) => x.text)).toEqual(["hello"]);
  });

  it("keeps a word that only touches a silence", () => {
    const t: RawWord[] = [{ text: "edge", start: 9.5, end: 10.5 }];
    expect(dropWordsInSilence(t, silences)).toHaveLength(1);
  });

  it("keeps everything when there are no silences", () => {
    const t = words(["a", "b"]);
    expect(dropWordsInSilence(t, [])).toBe(t);
  });

  it("treats a zero-length word inside a silence as inside", () => {
    expect(dropWordsInSilence([{ text: "x", start: 15, end: 15 }], silences)).toEqual([]);
  });
});
