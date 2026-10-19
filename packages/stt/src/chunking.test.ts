import { describe, expect, it } from "vitest";
import { mergeChunkWords, planChunks } from "./chunking.js";
import type { RawWord } from "./whisper-json.js";

const w = (text: string, start: number, end: number): RawWord => ({ text, start, end });

describe("planChunks", () => {
  it("keeps a short file whole", () => {
    expect(planChunks(300)).toEqual([{ start: 0, end: 300, ownStart: 0, ownEnd: 300 }]);
  });

  it("keeps a file up to 1.25 chunks whole instead of leaving a tiny tail", () => {
    expect(planChunks(740, [], { chunkSec: 600 })).toHaveLength(1);
    expect(planChunks(760, [], { chunkSec: 600 })).toHaveLength(2);
  });

  it("cuts in the middle of the longest silence before the target, with no overlap", () => {
    const chunks = planChunks(
      1500,
      [
        { start: 570, end: 575 },
        { start: 595, end: 597 },
      ],
      { chunkSec: 600, searchSec: 60 },
    );
    // 570-575 is longer than 595-597, so the cut lands at 572.5.
    expect(chunks[0]).toEqual({ start: 0, end: 572.5, ownStart: 0, ownEnd: 572.5 });
    expect(chunks[1]?.start).toBe(572.5);
  });

  it("covers the whole file exactly: each chunk starts where the previous one ends", () => {
    const sil = [
      { start: 590, end: 592 },
      { start: 1190, end: 1192 },
      { start: 1790, end: 1793 },
    ];
    const chunks = planChunks(2400, sil, { chunkSec: 600 });
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]?.start).toBe(chunks[i - 1]?.end);
    }
    expect(chunks[0]?.start).toBe(0);
    expect(chunks.at(-1)?.end).toBe(2400);
  });

  it("makes a hard cut with overlap when there is no silence, and owns the cut point on both sides", () => {
    const chunks = planChunks(1300, [], { chunkSec: 600, overlapSec: 3 });
    expect(chunks).toEqual([
      { start: 0, end: 603, ownStart: 0, ownEnd: 600 },
      { start: 597, end: 1300, ownStart: 600, ownEnd: 1300 },
    ]);
  });

  it("ignores silences that are too short to cut in", () => {
    const chunks = planChunks(1500, [{ start: 595, end: 595.2 }], {
      chunkSec: 600,
      minSilenceSec: 0.4,
    });
    expect(chunks[0]?.ownEnd).toBe(600);
  });

  it("never cuts earlier than half a chunk", () => {
    const chunks = planChunks(1500, [{ start: 100, end: 110 }], { chunkSec: 600, searchSec: 1000 });
    expect(chunks[0]?.ownEnd).toBe(600);
  });

  it("rejects nonsense input with a clear message", () => {
    expect(() => planChunks(0)).toThrow(/durationSec must be positive/);
    expect(() => planChunks(100, [], { chunkSec: -1 })).toThrow(/chunkSec must be positive/);
  });
});

describe("mergeChunkWords", () => {
  it("shifts each chunk's words by the chunk start", () => {
    const chunks = [
      { start: 0, end: 100, ownStart: 0, ownEnd: 100 },
      { start: 100, end: 200, ownStart: 100, ownEnd: 200 },
    ];
    const merged = mergeChunkWords(chunks, [[w("a", 1, 2)], [w("b", 1, 2)]]);
    expect(merged).toEqual([w("a", 1, 2), w("b", 101, 102)]);
  });

  it("keeps a word from exactly one chunk when chunks overlap", () => {
    const chunks = [
      { start: 0, end: 603, ownStart: 0, ownEnd: 600 },
      { start: 597, end: 1200, ownStart: 600, ownEnd: 1200 },
    ];
    // "x" at 598-599 is seen by both chunks; "y" at 601-602 too. Midpoints 598.5 and 601.5 decide.
    const merged = mergeChunkWords(chunks, [
      [w("x", 598, 599), w("y", 601, 602)],
      [w("x", 1, 2), w("y", 4, 5)],
    ]);
    expect(merged.map((m) => m.text)).toEqual(["x", "y"]);
    expect(merged[0]?.start).toBe(598);
    expect(merged[1]?.start).toBe(601);
  });

  it("lets the last chunk keep timestamps that overshoot the file end", () => {
    const chunks = [{ start: 0, end: 10, ownStart: 0, ownEnd: 10 }];
    expect(mergeChunkWords(chunks, [[w("z", 9.9, 10.4)]])).toHaveLength(1);
  });

  it("requires one word list per chunk", () => {
    expect(() => mergeChunkWords([{ start: 0, end: 1, ownStart: 0, ownEnd: 1 }], [])).toThrow(
      /expected words for 1 chunks/,
    );
  });
});
