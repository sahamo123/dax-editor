// Cut joins must not drift: after 60 joins, the picture and the sound both end within one frame of the timeline.
// Media is generated with FFmpeg (lavfi) and the stream ends are read back with ffprobe, so nothing is measured
// from the filter graph itself.

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { probe } from "./media.js";
import { exportProject } from "./render.js";
import type { Project } from "./schema.js";
import { ff, hasFfmpeg, makeTempDir, removeTempDir } from "./test-utils.js";
import { addAsset, appendClip, emptyProject, keepRanges, timelineDuration } from "./timeline.js";

/** Project rate used by every case: the picture is converted to this grid, so one frame is 1/30 s. */
const PROJECT_FPS = 30;
const FRAME = 1 / PROJECT_FPS;

/** Number of joins each render makes (one more kept segment than joins). */
const JOINS = 60;

/** Length of the generated source in seconds. Long enough to hold every kept segment with its gap. */
const SOURCE_SECONDS = 120;

/** Deterministic pseudo-random numbers (mulberry32), so the cut list is the same on every run. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Kept source ranges with off-grid edges: each segment is 0.4 to 2.0 s, separated by gaps of 0.1 to 0.6 s. The
 * result has `JOINS + 1` segments, so cutting everything else leaves exactly `JOINS` joins.
 */
function cutList(): { start: number; end: number }[] {
  const rnd = seeded(7);
  const out: { start: number; end: number }[] = [];
  let t = 0.3;
  for (let i = 0; i <= JOINS; i++) {
    const start = t + 0.1 + rnd() * 0.5;
    const end = start + 0.4 + rnd() * 1.6;
    if (end > SOURCE_SECONDS - 0.5) throw new Error("Cut list does not fit in the source");
    out.push({ start, end });
    t = end;
  }
  return out;
}

/**
 * When the picture and the sound of a file end, in seconds: `start_time + duration` of each stream as ffprobe reports
 * them (the container's own numbers, after any edit list).
 */
function streamEnds(path: string): { video: number; audio: number } {
  const raw = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "stream=codec_type,start_time,duration", "-of", "json", path],
    { encoding: "utf8" },
  );
  const streams = (
    JSON.parse(raw) as { streams: { codec_type: string; start_time: string; duration: string }[] }
  ).streams;
  const end = (kind: string): number => {
    const s = streams.find((x) => x.codec_type === kind);
    if (!s) throw new Error(`${path} has no ${kind} stream`);
    return Number(s.start_time) + Number(s.duration);
  };
  return { video: end("video"), audio: end("audio") };
}

describe.skipIf(!hasFfmpeg())("cut joins keep picture and sound in step (needs ffmpeg)", () => {
  let dir: string;
  let cfrPath: string;
  let vfrPath: string;

  beforeAll(() => {
    dir = makeTempDir("dax-avsync-");
    cfrPath = join(dir, "cfr-59.94.mp4");
    vfrPath = join(dir, "vfr-avg24.mp4");
    // 59.94 fps constant frame rate, with a 1 kHz tone so the audio has a known pitch.
    ff([
      ...["-f", "lavfi", "-i", `testsrc2=s=320x180:r=60000/1001:d=${SOURCE_SECONDS}`],
      ...["-f", "lavfi", "-i", `sine=f=1000:d=${SOURCE_SECONDS}`],
      ...["-c:v", "mpeg4", "-q:v", "3", "-c:a", "aac", "-b:a", "128k", "-shortest", cfrPath],
    ]);
    // Variable frame rate: 30 fps timestamps with every fifth frame dropped. The average rate is 24 fps while the
    // stream's nominal rate is still 30, so a probe that trusts either number alone would be wrong about it.
    ff([
      ...["-f", "lavfi", "-i", `testsrc2=s=320x180:r=30:d=${SOURCE_SECONDS}`],
      ...["-f", "lavfi", "-i", `sine=f=1000:d=${SOURCE_SECONDS}`],
      ...["-vf", "select=not(mod(n\\,5))", "-fps_mode", "passthrough"],
      ...["-c:v", "mpeg4", "-q:v", "3", "-c:a", "aac", "-b:a", "128k", "-shortest", vfrPath],
    ]);
  }, 120_000);
  afterAll(() => removeTempDir(dir));

  /** Cut `file` down to the join list, render it, and return the timeline length and the measured stream ends. */
  async function renderJoins(file: string, name: string) {
    const asset = await probe(file);
    const whole = appendClip(
      addAsset(emptyProject(name, { width: 320, height: 180, fps: PROJECT_FPS }), asset),
      asset.id,
    );
    const project: Project = keepRanges(whole, cutList());
    const out = join(dir, `${name}.mp4`);
    await exportProject(project, out, { encoder: "mpeg4" });
    const timeline = timelineDuration(project);
    const ends = streamEnds(out);
    return {
      timeline,
      video: ends.video,
      audio: ends.audio,
      videoError: ends.video - timeline,
      audioError: ends.audio - timeline,
      avError: ends.video - ends.audio,
      joins: mainJoins(project),
    };
  }

  it("ends picture and sound within one frame of the timeline after 60 joins (59.94 CFR source)", async () => {
    const r = await renderJoins(cfrPath, "cfr");
    expect(r.joins).toBe(JOINS);
    expect(Math.abs(r.videoError), `picture end error ${r.videoError}s`).toBeLessThanOrEqual(FRAME);
    expect(Math.abs(r.audioError), `sound end error ${r.audioError}s`).toBeLessThanOrEqual(FRAME);
    expect(Math.abs(r.avError), `picture minus sound ${r.avError}s`).toBeLessThanOrEqual(FRAME);
  }, 120_000);

  it("ends picture and sound within one frame of the timeline after 60 joins (VFR source, 24 fps average)", async () => {
    const r = await renderJoins(vfrPath, "vfr");
    expect(r.joins).toBe(JOINS);
    expect(Math.abs(r.videoError), `picture end error ${r.videoError}s`).toBeLessThanOrEqual(FRAME);
    expect(Math.abs(r.audioError), `sound end error ${r.audioError}s`).toBeLessThanOrEqual(FRAME);
    expect(Math.abs(r.avError), `picture minus sound ${r.avError}s`).toBeLessThanOrEqual(FRAME);
  }, 120_000);
});

/** Number of joins on the main track: clips minus one, since a join sits between each pair of neighbours. */
function mainJoins(p: Project): number {
  return Math.max(0, (p.timeline.tracks.find((t) => t.id === "v1")?.clips.length ?? 0) - 1);
}
