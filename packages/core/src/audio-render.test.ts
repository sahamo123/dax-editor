// Renders the music and sound-effect layer with real FFmpeg and measures the sound. The "voice" is a 1500 Hz tone that
// is on for 0.8 s and off for 0.6 s; music is a 220 Hz tone and effects are 880 Hz, so each can be measured on its own
// with a narrow band-pass even while they play together.

import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addAudioClip, audioClipFrom, setDucking } from "./audio-layer.js";
import { probe } from "./media.js";
import { exportProject } from "./render.js";
import type { Asset, Project } from "./schema.js";
import {
  audioDuration,
  audioLevels,
  hasFfmpeg,
  makeSpeechVideo,
  makeTempDir,
  makeTone,
  removeTempDir,
} from "./test-utils.js";
import { addAsset, appendClip, emptyProject } from "./timeline.js";

/** Voice bursts last from 0 to 0.8 s of every 1.4 s; these are windows well inside a burst and inside the gap after it. */
const SPEECH = [0.2, 0.4] as const; // start, length
const GAP = [1.1, 0.25] as const; // late in the gap, after the music has had time to recover

describe.skipIf(!hasFfmpeg())("music and sound effects (needs ffmpeg)", () => {
  let dir: string;
  let voiceLoud: Asset;
  let voiceQuiet: Asset;
  let music: Asset;
  let sfx: Asset;
  let voiceLoudPath: string;
  let voiceQuietPath: string;
  let n = 0;

  beforeAll(async () => {
    dir = makeTempDir("dax-audio-");
    voiceLoudPath = join(dir, "voice-loud.mp4");
    voiceQuietPath = join(dir, "voice-quiet.mp4");
    makeSpeechVideo(voiceLoudPath, 8, 0.5);
    makeSpeechVideo(voiceQuietPath, 8, 0.03);
    makeTone(join(dir, "music.wav"), 220, 4, 0.5);
    makeTone(join(dir, "sfx.wav"), 880, 0.5, 0.5);
    voiceLoud = await probe(voiceLoudPath);
    voiceQuiet = await probe(voiceQuietPath);
    music = await probe(join(dir, "music.wav"));
    sfx = await probe(join(dir, "sfx.wav"));
  }, 60_000);
  afterAll(() => removeTempDir(dir));

  function project(voice: Asset): Project {
    return appendClip(
      addAsset(
        addAsset(addAsset(emptyProject("a", { width: 640, height: 360, fps: 30 }), voice), music),
        sfx,
      ),
      voice.id,
    );
  }

  async function render(p: Project): Promise<string> {
    const out = join(dir, `out-${n++}.mp4`);
    await exportProject(p, out);
    return out;
  }

  /** Add the 4 s music clip (looped to 8 s unless told otherwise) with the given overrides. */
  function withMusic(p: Project, opts: Partial<Parameters<typeof audioClipFrom>[0]> = {}): Project {
    return addAudioClip(
      p,
      audioClipFrom({
        assetId: music.id,
        start: 0,
        loop: true,
        length: 8,
        volume: 1,
        assetDuration: music.duration,
        ...opts,
      }),
    );
  }

  const level = (file: string, window: readonly [number, number], hz: number) =>
    audioLevels(file, window[0], window[1], hz).rmsDb;

  it("lowers music under speech by about the set amount and brings it back in the gaps", async () => {
    let p = project(voiceLoud);
    p = withMusic(p);
    const ducked = await render(setDucking(p, { releaseSeconds: 0.1 }));
    const flat = await render(setDucking(p, { enabled: false }));

    const drop = level(flat, SPEECH, 220) - level(ducked, SPEECH, 220);
    expect(drop, `drop under speech: ${drop.toFixed(1)} dB`).toBeGreaterThan(9);
    expect(drop).toBeLessThan(15);
    const gapDiff = Math.abs(level(flat, GAP, 220) - level(ducked, GAP, 220));
    expect(gapDiff, `difference in the gap: ${gapDiff.toFixed(1)} dB`).toBeLessThan(1.5);
  }, 90_000);

  it("ducks a quiet speaker as deeply as a loud one", async () => {
    const dropFor = async (voice: Asset) => {
      const p = withMusic(project(voice));
      const on = await render(setDucking(p, { releaseSeconds: 0.1 }));
      const off = await render(setDucking(p, { enabled: false }));
      return level(off, SPEECH, 220) - level(on, SPEECH, 220);
    };
    const loud = await dropFor(voiceLoud);
    const quiet = await dropFor(voiceQuiet);
    expect(
      Math.abs(loud - quiet),
      `loud ${loud.toFixed(1)} dB, quiet ${quiet.toFixed(1)} dB`,
    ).toBeLessThan(3);
    expect(quiet).toBeGreaterThan(9);
  }, 120_000);

  it("follows a different ducking depth", async () => {
    const p = withMusic(project(voiceLoud));
    const off = await render(setDucking(p, { enabled: false }));
    const deep = await render(setDucking(p, { amountDb: 24, releaseSeconds: 0.1 }));
    const drop = level(off, SPEECH, 220) - level(deep, SPEECH, 220);
    expect(drop, `drop ${drop.toFixed(1)} dB`).toBeGreaterThan(17);
  }, 90_000);

  it("never lowers sound effects, even while someone speaks", async () => {
    // Quiet enough that the limiter stays out of it: the comparison is about ducking only.
    let p = project(voiceLoud);
    p = withMusic(p, { volume: 0.3 });
    p = addAudioClip(
      p,
      audioClipFrom({
        assetId: sfx.id,
        start: 0.2,
        role: "sfx",
        volume: 0.5,
        assetDuration: sfx.duration,
      }),
    );
    const ducked = await render(p);
    const flat = await render(setDucking(p, { enabled: false }));
    const at = [0.25, 0.3] as const;
    expect(Math.abs(level(ducked, at, 880) - level(flat, at, 880))).toBeLessThan(1);
    expect(level(ducked, at, 880)).toBeGreaterThan(-25); // and it is audible
  }, 90_000);

  it("starts music where asked: silent before, present after", async () => {
    const p = withMusic(project(voiceLoud), { start: 3, length: 4 });
    const out = await render(setDucking(p, { enabled: false }));
    expect(level(out, [1.0, 0.8], 220)).toBeLessThan(-40); // silent (the voice leaks about -45 dB into this band)
    expect(level(out, [3.3, 0.5], 220)).toBeGreaterThan(-25);
  }, 60_000);

  it("loops a short file to fill the length, and plays a non-looping one once", async () => {
    const looped = await render(setDucking(withMusic(project(voiceLoud)), { enabled: false }));
    expect(level(looped, [5.5, 1], 220)).toBeGreaterThan(-25);
    expect(level(looped, [7.0, 0.8], 220)).toBeGreaterThan(-25);

    const once = await render(
      setDucking(withMusic(project(voiceLoud), { loop: false, length: undefined }), {
        enabled: false,
      }),
    );
    expect(level(once, [1, 1], 220)).toBeGreaterThan(-25);
    expect(level(once, [5, 2], 220)).toBeLessThan(-40); // the 4 s file has ended
  }, 90_000);

  it("fades music in and out", async () => {
    const p = setDucking(withMusic(project(voiceLoud), { fadeIn: 2, fadeOut: 2 }), {
      enabled: false,
    });
    const out = await render(p);
    const early = level(out, [0, 0.4], 220);
    const mid = level(out, [3.5, 0.5], 220);
    const late = level(out, [7.6, 0.4], 220);
    expect(mid - early, `fade in: ${early.toFixed(1)} -> ${mid.toFixed(1)}`).toBeGreaterThan(8);
    expect(mid - late, `fade out: ${mid.toFixed(1)} -> ${late.toFixed(1)}`).toBeGreaterThan(8);
  }, 60_000);

  it("keeps the video's length and ends longer music at the end of the video with its fade-out", async () => {
    const p = setDucking(withMusic(project(voiceLoud), { length: 60, fadeOut: 2 }), {
      enabled: false,
    });
    const out = await render(p);
    expect(audioDuration(out)).toBeGreaterThan(7.9);
    expect(audioDuration(out)).toBeLessThan(8.15);
    expect(level(out, [7.6, 0.3], 220)).toBeLessThan(level(out, [5.5, 0.5], 220) - 8);
  }, 60_000);

  it("keeps the voice in time (the limiter and mix add no delay)", async () => {
    const out = await render(withMusic(project(voiceLoud)));
    // The voice stops at 0.8 s. 40 ms before that it is on; 40 ms after, it is off.
    expect(level(out, [0.72, 0.04], 1500)).toBeGreaterThan(-12);
    expect(level(out, [0.86, 0.04], 1500)).toBeLessThan(-40);
    expect(level(out, [2.12, 0.04], 1500)).toBeGreaterThan(-12); // the same at the next burst's end (2.2 s)
  }, 60_000);

  it("never clips: loud voice, loud music and a loud effect together stay under full scale", async () => {
    let p = project(voiceLoud);
    p = withMusic(p, { volume: 2 });
    p = addAudioClip(
      p,
      audioClipFrom({
        assetId: sfx.id,
        start: 0.1,
        role: "sfx",
        volume: 2,
        assetDuration: sfx.duration,
      }),
    );
    const out = await render(setDucking(p, { enabled: false }));
    const { peakDb } = audioLevels(out, 0, 8);
    expect(peakDb, `peak ${peakDb.toFixed(2)} dBFS`).toBeLessThan(-0.3);
    expect(peakDb).toBeGreaterThan(-6); // the limiter holds the level near the ceiling, it does not crush it
  }, 60_000);

  it("leaves a project without an audio layer exactly as it was (no limiter, no extra inputs)", async () => {
    const out = await render(project(voiceLoud));
    const { peakDb } = audioLevels(out, 0, 8);
    expect(peakDb).toBeLessThan(-4); // 0.5 amplitude voice, untouched
    expect(peakDb).toBeGreaterThan(-8);
  }, 30_000);
});
