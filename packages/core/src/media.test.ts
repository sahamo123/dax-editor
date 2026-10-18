import { describe, expect, it } from "vitest";
import {
  invertRanges,
  padSilences,
  parseProbe,
  parseSceneChanges,
  parseSilenceDetect,
} from "./media.js";
import { DEFAULT_FILLERS, findFillerRanges, formatTranscript } from "./transcript.js";

describe("parseSilenceDetect", () => {
  it("pairs starts and ends", () => {
    const log = `
[silencedetect @ 0x1] silence_start: 2.001
[silencedetect @ 0x1] silence_end: 4.0035 | silence_duration: 2.0025
[silencedetect @ 0x1] silence_start: 7.5
[silencedetect @ 0x1] silence_end: 8.25 | silence_duration: 0.75`;
    expect(parseSilenceDetect(log, 10)).toEqual([
      { start: 2.001, end: 4.0035 },
      { start: 7.5, end: 8.25 },
    ]);
  });

  it("closes a trailing silence at the end of the file", () => {
    expect(parseSilenceDetect("[silencedetect @ 0x1] silence_start: 8", 10)).toEqual([
      { start: 8, end: 10 },
    ]);
  });

  it("clamps a negative start to zero", () => {
    const log = "silence_start: -0.02\nsilence_end: 1 | silence_duration: 1";
    expect(parseSilenceDetect(log, 5)[0]!.start).toBe(0);
  });
});

describe("range helpers", () => {
  it("inverts silences into speech", () => {
    expect(invertRanges([{ start: 2, end: 4 }], 10)).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 10 },
    ]);
  });

  it("pads silences inward and drops tiny ones", () => {
    const out = padSilences(
      [
        { start: 2, end: 4 },
        { start: 6, end: 6.1 },
      ],
      0.1,
    );
    expect(out).toEqual([{ start: 2.1, end: 3.9 }]);
  });
});

describe("parseSceneChanges", () => {
  it("reads pts_time from showinfo lines", () => {
    const log = `[Parsed_showinfo_1 @ 0x1] n:   0 pts:  90000 pts_time:3.5 pos: 1
[Parsed_showinfo_1 @ 0x1] n:   1 pts: 180000 pts_time:7 pos: 2
frame= 10 something pts_time:99`;
    expect(parseSceneChanges(log)).toEqual([3.5, 7]);
  });
});

describe("parseProbe", () => {
  it("describes a video with audio", () => {
    const a = parseProbe(
      {
        format: { duration: "12.5" },
        streams: [
          { codec_type: "video", width: 1280, height: 720, r_frame_rate: "30000/1001" },
          { codec_type: "audio" },
        ],
      },
      "/x/clip.mp4",
    );
    expect(a).toMatchObject({
      kind: "video",
      duration: 12.5,
      width: 1280,
      height: 720,
      hasAudio: true,
    });
    expect(a.fps).toBeCloseTo(29.97, 2);
  });

  it("treats audio-only files as audio", () => {
    const a = parseProbe(
      { format: { duration: "3" }, streams: [{ codec_type: "audio" }] },
      "/x/a.wav",
    );
    expect(a.kind).toBe("audio");
  });

  it("rejects files with no media streams", () => {
    expect(() => parseProbe({ streams: [] }, "/x/none")).toThrow();
  });
});

describe("transcript helpers", () => {
  const t = {
    words: [
      { text: "So,", start: 0, end: 0.3 },
      { text: "um", start: 0.4, end: 0.7 },
      { text: "hello", start: 0.8, end: 1.2 },
      { text: "Uh...", start: 1.3, end: 1.6 },
    ],
  };

  it("finds filler words regardless of case and punctuation", () => {
    const r = findFillerRanges(t, DEFAULT_FILLERS, 0);
    expect(r).toEqual([
      { start: 0.4, end: 0.7 },
      { start: 1.3, end: 1.6 },
    ]);
  });

  it("formats a timestamped transcript", () => {
    expect(formatTranscript(t)).toBe("[00:00] So, um hello Uh...");
  });
});
