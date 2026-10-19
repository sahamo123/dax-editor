import { describe, expect, it } from "vitest";
import {
  AUDIO_TRACK,
  addAudioClip,
  audioClipEnd,
  audioClipFrom,
  audioClips,
  audioLayerFilters,
  DEFAULT_DUCKING,
  duckingCompressor,
  duckingOf,
  MIX_CEILING,
  removeAudioClip,
  setDucking,
  updateAudioClip,
} from "./audio-layer.js";
import type { Asset, Clip, Project } from "./schema.js";
import { addAsset, appendClip, deleteRange, emptyProject, keepRanges } from "./timeline.js";

const video: Asset = { id: "v", path: "/x/talk.mp4", kind: "video", duration: 60, hasAudio: true };
const mute: Asset = { id: "m", path: "/x/mute.mp4", kind: "video", duration: 10, hasAudio: false };
const song: Asset = { id: "s", path: "/x/song.mp3", kind: "audio", duration: 20, hasAudio: true };
const pic: Asset = { id: "p", path: "/x/logo.png", kind: "image", duration: 0, hasAudio: false };

const base: Project = appendClip(
  addAsset(addAsset(addAsset(addAsset(emptyProject("t"), video), mute), song), pic),
  "v",
);

const clip = (over: Partial<Parameters<typeof audioClipFrom>[0]> = {}): Clip =>
  audioClipFrom({ assetId: "s", start: 0, assetDuration: 20, ...over });

describe("audio clip edit operations", () => {
  it("creates the audio track on first use and fills in defaults, without mutating the input", () => {
    const frozen = structuredClone(base);
    const p = addAudioClip(base, clip());
    expect(base).toEqual(frozen);
    expect(p.timeline.tracks.map((t) => t.id)).toEqual(["v1", AUDIO_TRACK]);
    expect(audioClips(p)[0]).toMatchObject({
      assetId: "s",
      role: "music",
      loop: false,
      length: 20,
      volume: 0.25,
    });
  });

  it("gives effects full volume and music a quiet default", () => {
    expect(clip({ role: "sfx" }).volume).toBe(1);
    expect(clip({ role: "music" }).volume).toBe(0.25);
  });

  it("caps a clip that does not loop at its slice, and lets a looping one be longer", () => {
    expect(audioClips(addAudioClip(base, clip({ length: 90 })))[0]?.length).toBe(20);
    expect(audioClips(addAudioClip(base, clip({ length: 90, loop: true })))[0]?.length).toBe(90);
    expect(audioClips(addAudioClip(base, clip({ sourceStart: 5, length: 90 })))[0]?.length).toBe(
      15,
    );
  });

  it("allows a video that has sound, and rejects silent videos, pictures and unknown assets", () => {
    expect(() => addAudioClip(base, clip({ assetId: "v", assetDuration: 60 }))).not.toThrow();
    expect(() => addAudioClip(base, clip({ assetId: "m", assetDuration: 10 }))).toThrow(/no sound/);
    expect(() => addAudioClip(base, clip({ assetId: "p", assetDuration: 1 }))).toThrow(/no sound/);
    expect(() => addAudioClip(base, clip({ assetId: "nope" }))).toThrow(/Unknown asset/);
  });

  it("rejects slices outside the file, and fades longer than the clip", () => {
    expect(() => addAudioClip(base, clip({ sourceStart: 25 }))).toThrow(/only 20/);
    expect(() => addAudioClip(base, clip({ length: 2, fadeIn: 1.5, fadeOut: 1.5 }))).toThrow(
      /Fades/,
    );
  });

  it("updates fields and rechecks them", () => {
    const p = addAudioClip(base, clip({ length: 10 }));
    const id = audioClips(p)[0]?.id ?? "";
    const q = updateAudioClip(p, id, { start: 4, volume: 0.5, fadeOut: 3 });
    expect(audioClips(q)[0]).toMatchObject({ start: 4, volume: 0.5, fadeOut: 3, length: 10 });
    expect(() => updateAudioClip(p, id, { fadeIn: 8, fadeOut: 8 })).toThrow(/Fades/);
    expect(() => updateAudioClip(p, "nope", { volume: 1 })).toThrow(/Unknown audio clip/);
    // Looping can be switched on afterwards to lengthen it.
    const looped = updateAudioClip(p, id, { loop: true, length: 45 });
    expect(audioClips(looped)[0]?.length).toBe(45);
  });

  it("removes a clip and keeps the (empty) track", () => {
    const p = addAudioClip(base, clip());
    const q = removeAudioClip(p, audioClips(p)[0]?.id ?? "");
    expect(audioClips(q)).toHaveLength(0);
    expect(() => removeAudioClip(q, "nope")).toThrow(/Unknown audio clip/);
  });

  it("keeps clips in time order and rejects a repeated id", () => {
    let p = addAudioClip(base, clip({ start: 9 }));
    p = addAudioClip(p, clip({ start: 2, role: "sfx", length: 1 }));
    expect(audioClips(p).map((c) => c.start)).toEqual([2, 9]);
    const first = audioClips(p)[0];
    if (!first) throw new Error("expected a clip");
    expect(() => addAudioClip(p, first)).toThrow(/already exists/);
  });

  it("reports where a clip ends on the timeline", () => {
    const c = audioClips(addAudioClip(base, clip({ start: 3, length: 7 })))[0];
    if (!c) throw new Error("expected a clip");
    expect(audioClipEnd(c)).toBe(10);
  });
});

describe("ducking settings", () => {
  it("defaults to on, 12 dB, and validates changes", () => {
    expect(duckingOf(base)).toEqual(DEFAULT_DUCKING);
    expect(DEFAULT_DUCKING).toMatchObject({ enabled: true, amountDb: 12 });
    const q = setDucking(base, { amountDb: 20 });
    expect(duckingOf(q)).toMatchObject({ enabled: true, amountDb: 20, releaseSeconds: 0.4 });
    expect(duckingOf(setDucking(q, { enabled: false })).enabled).toBe(false);
    expect(duckingOf(setDucking(q, { enabled: false })).amountDb).toBe(20);
    expect(() => setDucking(base, { amountDb: 80 })).toThrow();
    expect(base.timeline.ducking).toBeUndefined();
  });

  it("maps depth to compressor settings that give that depth at the key's plateau", () => {
    const c = duckingCompressor({ enabled: true, amountDb: 12, releaseSeconds: 0.4 });
    // Gain reduction at the 0.5 plateau = (dB above threshold) x (1 - 1/ratio) = 12.
    const above = 20 * Math.log10(0.5 / c.threshold);
    expect(above * (1 - 1 / c.ratio)).toBeCloseTo(12, 6);
    expect(
      duckingCompressor({ enabled: true, amountDb: 30, releaseSeconds: 0.4 }).ratio,
    ).toBeLessThanOrEqual(20);
  });
});

describe("the audio layer and ripple deletes", () => {
  const tracksOf = (p: Project) =>
    audioClips(p).map((c) => ({ id: c.role, start: c.start, length: c.length }));
  let p = addAudioClip(base, clip({ start: 0, length: 20, loop: true })); // music spanning everything
  p = addAudioClip(p, clip({ start: 15, role: "sfx", length: 1 })); // whoosh inside the cut
  p = addAudioClip(p, clip({ start: 30, role: "sfx", length: 1 })); // whoosh after the cut
  p = addAudioClip(p, clip({ start: 5, role: "sfx", length: 1 })); // whoosh before the cut
  p = addAudioClip(p, clip({ start: 40, length: 10, loop: false })); // an outro bed after the cut
  p = addAudioClip(p, clip({ start: 12, length: 6 })); // music that starts inside the cut

  it("does not cut into music that spans a deleted range, and moves later music earlier", () => {
    const cut = deleteRange(p, 10, 20);
    const byStart = tracksOf(cut);
    expect(byStart.find((c) => c.id === "music" && c.start === 0)?.length).toBe(20); // untouched
    expect(byStart.find((c) => c.id === "music" && c.start === 30)).toBeDefined(); // 40 - 10
    expect(byStart.find((c) => c.id === "music" && c.start === 10)).toBeDefined(); // started inside, now at the cut
  });

  it("removes a sound effect whose moment was deleted, and moves later ones earlier", () => {
    const cut = deleteRange(p, 10, 20);
    const sfx = tracksOf(cut)
      .filter((c) => c.id === "sfx")
      .map((c) => c.start)
      .sort((a, b) => a - b);
    expect(sfx).toEqual([5, 20]); // 15 is gone, 30 -> 20
  });

  it("applies the same rules through keepRanges and many small deletes", () => {
    const kept = keepRanges(p, [
      { start: 0, end: 10 },
      { start: 20, end: 60 },
    ]);
    expect(
      tracksOf(kept)
        .filter((c) => c.id === "sfx")
        .map((c) => c.start)
        .sort((a, b) => a - b),
    ).toEqual([5, 20]);
  });

  it("leaves projects without an audio track alone", () => {
    const cut = deleteRange(base, 10, 20);
    expect(cut.timeline.tracks.map((t) => t.id)).toEqual(["v1"]);
  });
});

describe("the audio layer filter graph", () => {
  const request = (project: Project, total = 60) => ({
    project,
    mainLabel: "[outa]",
    total,
    inputFor: (assetId: string) => (assetId === "s" ? 1 : 2),
  });

  it("returns null when there is nothing to mix", () => {
    expect(audioLayerFilters(request(base))).toBeNull();
    const late = addAudioClip(base, clip({ start: 60 }));
    expect(audioLayerFilters(request(late))).toBeNull();
  });

  it("ducks music with a keyed compressor, mixes with the main audio's length and limits the result", () => {
    const g = audioLayerFilters(request(addAudioClip(base, clip({ length: 20, fadeOut: 2 }))));
    const text = g?.filters.join(";") ?? "";
    expect(g?.label).toBe("[almix]");
    expect(text).toContain("[outa]asplit=2[alvox][alkey]");
    expect(text).toContain("sidechaincompress=");
    expect(text).toContain("amix=inputs=2:duration=first:normalize=0");
    expect(text).toContain(`alimiter=limit=${MIX_CEILING}:level=disabled`);
    expect(text).toContain("afade=t=out:st=18:d=2");
  });

  it("does not duck when ducking is off or when there is only a sound effect", () => {
    const off = audioLayerFilters(
      request(setDucking(addAudioClip(base, clip()), { enabled: false })),
    );
    expect(off?.filters.join(";")).not.toContain("sidechaincompress");
    const sfxOnly = audioLayerFilters(
      request(addAudioClip(base, clip({ role: "sfx", length: 1 }))),
    );
    expect(sfxOnly?.filters.join(";")).not.toContain("sidechaincompress");
  });

  it("loops only when the clip is longer than its slice, and delays by the start", () => {
    const longer = audioLayerFilters(
      request(addAudioClip(base, clip({ start: 2.5, length: 50, loop: true }))),
    );
    expect(longer?.filters.join(";")).toContain("aloop=loop=-1");
    expect(longer?.filters.join(";")).toContain("adelay=2500|2500");
    const same = audioLayerFilters(request(addAudioClip(base, clip({ loop: true }))));
    expect(same?.filters.join(";")).not.toContain("aloop");
  });

  it("trims music to the end of the video and puts its fade-out there", () => {
    const g = audioLayerFilters(request(addAudioClip(base, clip({ length: 20, fadeOut: 3 })), 8));
    const text = g?.filters.join(";") ?? "";
    expect(text).toContain("atrim=duration=8");
    expect(text).toContain("afade=t=out:st=5:d=3");
  });

  it("mixes several music clips into one bus before ducking", () => {
    let p = addAudioClip(base, clip({ start: 0, length: 10 }));
    p = addAudioClip(p, clip({ start: 12, length: 10 }));
    const text = audioLayerFilters(request(p))?.filters.join(";") ?? "";
    expect(text).toContain("amix=inputs=2:duration=longest:normalize=0");
    expect(text.match(/sidechaincompress/g)).toHaveLength(1);
  });
});
