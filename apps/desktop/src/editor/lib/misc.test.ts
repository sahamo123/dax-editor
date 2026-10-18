// Small pure helpers: time formatting, project helpers, fade envelope, waveform parsing, preset samples.

import { describe, expect, it } from "vitest";
import { fadeFactor } from "../playback/fades";
import { chipLoopLength, presetSample, presetStyle } from "../presets/preset-style";
import { clip, defaultProject, makeProject, overlay, PRESETS } from "../test-utils";
import { filmstripFrames, parseWaveform, peakInRange } from "./media-cache";
import {
  baseName,
  clipIndexAt,
  contentExtent,
  findClip,
  findOverlay,
  mainClips,
  videoDuration,
} from "./project";
import { clamp, formatDuration, formatTimecode, round, snapToFrame } from "./time";

describe("time", () => {
  it("clamps and rounds", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(round(1.23456, 2)).toBe(1.23);
    expect(snapToFrame(1.017, 30)).toBeCloseTo(1.0333, 3);
  });

  it("formats timecode as mm:ss:ff and adds hours from one hour", () => {
    expect(formatTimecode(0, 30)).toBe("00:00:00");
    expect(formatTimecode(1.5, 30)).toBe("00:01:15");
    expect(formatTimecode(61 + 1 / 30, 30)).toBe("01:01:01");
    expect(formatTimecode(3600, 30)).toBe("1:00:00:00");
    expect(formatTimecode(-3, 30)).toBe("00:00:00");
    // Floating point must not drop a frame: 29/30 s is frame 29, not 28.
    expect(formatTimecode(29 / 30, 30)).toBe("00:00:29");
  });

  it("formats durations compactly", () => {
    expect(formatDuration(4.2)).toBe("4.2s");
    expect(formatDuration(12.34)).toBe("12.3s");
    expect(formatDuration(65)).toBe("1:05");
  });
});

describe("project helpers", () => {
  const p = defaultProject([overlay("o1", 10, 5)]);

  it("reads the main track, its duration and the overall extent", () => {
    expect(mainClips(p)).toHaveLength(3);
    expect(videoDuration(p)).toBe(12);
    expect(contentExtent(p)).toBe(15); // an overlay runs past the video
  });

  it("copes with a project without clips", () => {
    const empty = makeProject([]);
    expect(videoDuration(empty)).toBe(0);
    expect(clipIndexAt(mainClips(empty), 1)).toBe(-1);
  });

  it("finds the clip at a time; the end resolves to the last clip", () => {
    const clips = mainClips(p);
    expect(clipIndexAt(clips, 0)).toBe(0);
    expect(clipIndexAt(clips, 3.99)).toBe(0);
    expect(clipIndexAt(clips, 4)).toBe(1);
    expect(clipIndexAt(clips, 12)).toBe(2);
    expect(clipIndexAt(clips, 99)).toBe(2);
    expect(clipIndexAt(clips, -1)).toBe(0);
  });

  it("finds items by id and names files", () => {
    expect(findClip(p, "c2")?.id).toBe("c2");
    expect(findClip(p, "zzz")).toBeUndefined();
    expect(findOverlay(p, "o1")?.id).toBe("o1");
    expect(baseName("/a/b/c.mp4")).toBe("c.mp4");
    expect(baseName("C:\\clips\\x.mov")).toBe("x.mov");
  });
});

describe("fadeFactor", () => {
  it("ramps linearly in and out", () => {
    expect(fadeFactor(0, 4, 1, 1)).toBe(0);
    expect(fadeFactor(0.5, 4, 1, 1)).toBeCloseTo(0.5);
    expect(fadeFactor(2, 4, 1, 1)).toBe(1);
    expect(fadeFactor(3.5, 4, 1, 1)).toBeCloseTo(0.5);
    expect(fadeFactor(4, 4, 1, 1)).toBe(0);
  });

  it("is 1 with no fades and never leaves 0..1", () => {
    expect(fadeFactor(0, 4, 0, 0)).toBe(1);
    expect(fadeFactor(-1, 4, 1, 0)).toBe(0);
    expect(fadeFactor(9, 4, 0, 1)).toBe(0);
  });

  it("scales overlong fades down proportionally", () => {
    // 3 s + 3 s of fade in a 4 s clip -> 2 s each: up to full level at 2 s, then straight back down.
    expect(fadeFactor(1, 4, 3, 3)).toBeCloseTo(0.5);
    expect(fadeFactor(2, 4, 3, 3)).toBeCloseTo(1, 6);
    expect(fadeFactor(3, 4, 3, 3)).toBeCloseTo(0.5);
  });

  it("is 0 for a zero-length clip", () => {
    expect(fadeFactor(0, 0, 0, 0)).toBe(0);
  });
});

describe("waveform parsing", () => {
  it("accepts a bare array, and objects with peaks, data or samples", () => {
    expect(parseWaveform([0, 0.5, 1])).toEqual([0, 0.5, 1]);
    expect(parseWaveform({ peaks: [0.5, 1] })).toEqual([0.5, 1]);
    expect(parseWaveform({ data: [0.25, 0.5] })).toEqual([0.5, 1]);
    expect(parseWaveform({ samples: [1, 1] })).toEqual([1, 1]);
  });

  it("folds negatives to magnitudes and normalises to 1", () => {
    expect(parseWaveform([-2, 1, 0])).toEqual([1, 0.5, 0]);
  });

  it("rejects unusable data and keeps silence as zeros", () => {
    expect(parseWaveform(null)).toBeNull();
    expect(parseWaveform({})).toBeNull();
    expect(parseWaveform([])).toBeNull();
    expect(parseWaveform([0, 0])).toEqual([0, 0]);
    expect(parseWaveform(["a", 1])).toEqual([0, 1]);
  });

  it("finds the highest peak in a source-time range", () => {
    const peaks = [0.1, 0.9, 0.2, 0.3]; // 4 slices over a 4 s asset -> 1 s each
    expect(peakInRange(peaks, 4, 0, 1)).toBe(0.1);
    expect(peakInRange(peaks, 4, 0, 2)).toBe(0.9);
    expect(peakInRange(peaks, 4, 2.2, 3.9)).toBe(0.3);
    expect(peakInRange(peaks, 4, 3.99, 99)).toBe(0.3);
    expect(peakInRange([], 4, 0, 1)).toBe(0);
  });

  it("infers filmstrip frame count from the sprite size and aspect ratio", () => {
    expect(filmstripFrames({ width: 1920, height: 90 }, 16 / 9)).toBe(12);
    expect(filmstripFrames({ width: 160, height: 90 }, 16 / 9)).toBe(1);
    expect(filmstripFrames({ width: 0, height: 0 }, 16 / 9)).toBe(1);
  });
});

describe("preset chips", () => {
  const find = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) throw new Error(id);
    return p;
  };

  it("derives each category's look and lets a server-provided style win", () => {
    expect(presetStyle(find("title-fade")).position).toBe("center");
    expect(presetStyle(find("lower-third-slide")).position).toBe("lower-third");
    expect(presetStyle(find("caption-bottom")).box?.opacity).toBe(0.6);
    expect(
      presetStyle({ ...find("title-fade"), style: { fontSize: 20, color: "#ff0000" } }),
    ).toMatchObject({ fontSize: 20, color: "#ff0000", bold: true });
  });

  it("builds a short looping sample that keeps the preset's text and animation", () => {
    const sample = presetSample(find("lower-third-slide"));
    expect(sample).toMatchObject({
      text: "Speaker name",
      subtitle: "Role",
      animation: "slide-left",
    });
    expect(sample.duration).toBeLessThanOrEqual(2.6);
    expect(chipLoopLength(sample)).toBeGreaterThan(sample.start + sample.duration);
  });
});

describe("fixtures", () => {
  it("clip() defaults", () => {
    expect(clip("x", "a", 0, 1)).toMatchObject({ volume: 1, fadeIn: 0, fadeOut: 0 });
  });
});
