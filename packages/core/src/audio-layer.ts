// The music and sound-effect layer: pure edit operations on the audio track (`a1`) and the FFmpeg graph that mixes it
// under the main track's own sound, with automatic ducking.
//
// Design in one paragraph. Audio clips sit on the timeline at `start` (timeline seconds) and may overlap. Music
// clips are trimmed or looped to `length`, faded, and mixed into one music bus. That bus is lowered while
// someone speaks on the main track (FFmpeg `sidechaincompress`, keyed by a levelled copy of the main audio so the
// depth does not depend on how loud the speaker is). Sound effects bypass the ducking. The main audio, the ducked
// music and the effects meet in one `amix`, followed by a limiter, so the result cannot clip.
// Music is anchored to the timeline, not to footage (see `shiftAudioForDelete`). Recipes: docs/research/ffmpeg-animation-recipes.md, section 3.

import { newId } from "./ids.js";
import type { Asset, Clip, Ducking, Project, Track } from "./schema.js";
import { ClipSchema, DuckingSchema } from "./schema.js";

const EPS = 1e-6;

/** Id of the audio track. It is created by the first audio clip that is added. */
export const AUDIO_TRACK = "a1";

/** The ducking used when a project has not set any: 12 dB down under speech, 0.4 s to recover. */
export const DEFAULT_DUCKING: Ducking = DuckingSchema.parse({});

/** Default music loudness (linear gain). With a typical loud master this sits about 12 dB below the voice. */
export const DEFAULT_MUSIC_VOLUME = 0.25;

/** The ducking settings in force for a project. */
export function duckingOf(p: Project): Ducking {
  return p.timeline.ducking ?? DEFAULT_DUCKING;
}

/** The clips on the audio track, earliest first. Empty when there is no audio track. */
export function audioClips(p: Project): Clip[] {
  const track = p.timeline.tracks.find((t) => t.id === AUDIO_TRACK);
  return [...(track?.clips ?? [])].sort((a, b) => a.start - b.start);
}

/** How long an audio clip lasts on the timeline, in seconds. */
export function audioClipLength(c: Clip): number {
  return c.length ?? c.out - c.in;
}

/** Timeline time, in seconds, at which an audio clip ends. */
export function audioClipEnd(c: Clip): number {
  return c.start + audioClipLength(c);
}

/** True for assets whose sound can be placed on the audio track: audio files and videos that have a sound track. */
export function isAudioSource(asset: Asset): boolean {
  return asset.kind === "audio" || (asset.kind === "video" && asset.hasAudio);
}

function withAudio(p: Project, clips: Clip[]): Project {
  const next = structuredClone(p);
  const sorted = clips.sort((a, b) => a.start - b.start);
  const track = next.timeline.tracks.find((t) => t.id === AUDIO_TRACK);
  if (track) track.clips = sorted;
  else next.timeline.tracks.push({ id: AUDIO_TRACK, kind: "audio", clips: sorted });
  return next;
}

/**
 * Fill in and check an audio clip against its asset: the slice must lie inside the file, a clip that does not
 * loop cannot be longer than its slice, and the two fades must fit inside the clip.
 * Returns the clip with `role`, `loop` and `length` always set.
 */
function normalize(c: Clip, asset: Asset): Clip {
  if (!isAudioSource(asset)) {
    throw new Error(`Asset ${asset.path} has no sound, so it cannot go on the audio track.`);
  }
  if (c.in >= asset.duration - EPS) {
    throw new Error(
      `The slice starts at ${c.in}s but the file is only ${Number(asset.duration.toFixed(2))}s long.`,
    );
  }
  const out = Math.min(c.out, asset.duration);
  if (out - c.in <= EPS) throw new Error("The audio slice would be empty");
  const loop = c.loop ?? false;
  const wanted = c.length ?? out - c.in;
  const length = loop ? wanted : Math.min(wanted, out - c.in);
  if (c.fadeIn + c.fadeOut > length + EPS) {
    throw new Error(`Fades (${c.fadeIn + c.fadeOut}s) are longer than the clip (${length}s)`);
  }
  return { ...c, out, loop, length, role: c.role ?? "music" };
}

/**
 * Add an audio clip, creating the audio track if needed. The clip is validated and normalised (see
 * {@link AudioPatch}). Throws if the asset is unknown or has no sound, the id exists, or the values are invalid.
 */
export function addAudioClip(p: Project, clip: Clip): Project {
  const valid = ClipSchema.parse(clip);
  const asset = p.assets[valid.assetId];
  if (!asset) throw new Error(`Unknown asset "${valid.assetId}"`);
  if (audioClips(p).some((c) => c.id === valid.id)) {
    throw new Error(`Audio clip "${valid.id}" already exists`);
  }
  return withAudio(p, [...audioClips(p), normalize(valid, asset)]);
}

/** Fields of an audio clip that {@link updateAudioClip} can change. Timeline fields are in timeline seconds; `in` and `out` are source seconds. */
export interface AudioPatch {
  start?: number;
  length?: number;
  in?: number;
  out?: number;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  loop?: boolean;
  role?: Clip["role"];
}

/** Change an audio clip's place, length, source slice, loudness, fades, looping or role. Throws for an unknown id or invalid values. */
export function updateAudioClip(p: Project, id: string, patch: AudioPatch): Project {
  const all = audioClips(p);
  const current = all.find((c) => c.id === id);
  if (!current) throw new Error(`Unknown audio clip "${id}"`);
  const asset = p.assets[current.assetId];
  if (!asset) throw new Error(`Audio clip "${id}" references missing asset "${current.assetId}"`);
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const merged = ClipSchema.parse({ ...current, ...defined });
  return withAudio(
    p,
    all.map((c) => (c.id === id ? normalize(merged, asset) : c)),
  );
}

/** Remove an audio clip. Throws if it does not exist. The audio track stays (it may be empty). */
export function removeAudioClip(p: Project, id: string): Project {
  const all = audioClips(p);
  if (!all.some((c) => c.id === id)) throw new Error(`Unknown audio clip "${id}"`);
  return withAudio(
    p,
    all.filter((c) => c.id !== id),
  );
}

/** Change the ducking settings (only the fields given). Throws for values out of range. */
export function setDucking(p: Project, patch: Partial<Ducking>): Project {
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const next = structuredClone(p);
  next.timeline.ducking = DuckingSchema.parse({ ...duckingOf(p), ...defined });
  return next;
}

/** Build an audio clip from loose parameters. `length` defaults to the whole slice; ids come from {@link newId}. */
export function audioClipFrom(opts: {
  assetId: string;
  start: number;
  role?: Clip["role"];
  sourceStart?: number;
  sourceEnd?: number;
  length?: number;
  loop?: boolean;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  assetDuration: number;
}): Clip {
  const role = opts.role ?? "music";
  const clip: Clip = {
    id: newId("aud"),
    assetId: opts.assetId,
    start: opts.start,
    in: opts.sourceStart ?? 0,
    out: opts.sourceEnd ?? opts.assetDuration,
    volume: opts.volume ?? (role === "music" ? DEFAULT_MUSIC_VOLUME : 1),
    fadeIn: opts.fadeIn ?? 0,
    fadeOut: opts.fadeOut ?? 0,
    role,
    loop: opts.loop ?? false,
  };
  if (opts.length !== undefined) clip.length = opts.length;
  return clip;
}

/**
 * Keep the audio layer sensible after the timeline range [from, to) is deleted and the gap closed.
 *
 * - **Music** is anchored to the timeline, not to footage, so a ripple delete never cuts into it (many small
 *   cuts would chop a song into pieces). A music clip that starts after the range slides earlier by its
 *   length; one that starts inside the range moves to `from`; one that spans it is untouched. If the music now
 *   runs past the end of the shorter video, the renderer ends it there with its fade-out.
 * - **Sound effects** belong to a moment in the footage: one that starts inside the deleted range is removed,
 *   one after it slides earlier, one before it is untouched.
 *
 * Returns new tracks and never mutates its input.
 */
export function shiftAudioForDelete(tracks: readonly Track[], from: number, to: number): Track[] {
  const gap = to - from;
  return tracks.map((t) => {
    if (t.id !== AUDIO_TRACK) return t;
    const clips: Clip[] = [];
    for (const c of t.clips) {
      if (c.start >= to - EPS) {
        clips.push({ ...c, start: c.start - gap });
      } else if (c.start > from + EPS) {
        // Starts inside the deleted range.
        if (c.role === "sfx") continue;
        clips.push({ ...c, start: from });
      } else {
        clips.push(c);
      }
    }
    return { ...t, clips };
  });
}

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

/** A number as FFmpeg filter text: fixed precision, no exponent, no trailing zeros. */
const num = (x: number) => Number(x.toFixed(6)).toString();

/** Highest level the mix may reach, as a linear sample value (about -1 dBFS). Leaves room for AAC overshoot. */
export const MIX_CEILING = 0.89;

/**
 * The ducking compressor's settings for a depth of `amountDb`. The key is levelled to a constant plateau of
 * 0.5 (see `keyConditioning`), so the depth depends only on these numbers: with the threshold
 * `amountDb + 6` dB below the plateau and ratio `(amountDb + 6) / 6`, the gain reduction at the plateau is `amountDb`.
 */
export function duckingCompressor(d: Ducking): { threshold: number; ratio: number } {
  const over = d.amountDb + 6;
  return { threshold: 0.5 * 10 ** (-over / 20), ratio: Math.min(20, over / 6) };
}

/**
 * Filters that turn a copy of the main audio into the ducking key: a gate removes background noise, a large gain
 * and a limiter flatten everything above it to one constant level. Quiet and loud speakers then duck the music
 * by the same amount (measured: within 1 dB at 12 dB and 20 dB depth, for voices 24 dB apart).
 */
function keyConditioning(): string {
  return "agate=threshold=0.01:range=0:attack=5:release=50,volume=40dB,alimiter=limit=0.5:level=disabled:attack=1:release=10";
}

/** Input and output of {@link audioLayerFilters}. */
export interface AudioLayerRequest {
  project: Project;
  /** Pad of the joined main audio, e.g. `[outa]`. */
  mainLabel: string;
  /** Length of the finished video in seconds. */
  total: number;
  /** Returns the FFmpeg input index that reads an asset's file, adding the input if it is new. */
  inputFor: (assetId: string) => number;
}

/**
 * Filter fragments that mix the audio track under the main audio. Returns the label of the mixed audio and the
 * fragments, or null when there is nothing to mix (no audio clips, or none inside the video), in which case
 * the caller keeps the main audio as it is.
 *
 * Each clip is cut to its source slice, resampled to 48 kHz stereo, looped if asked, trimmed to its length
 * (and to the end of the video), set to its volume, faded, and delayed to its start. Music clips are mixed
 * into one bus and ducked by the key from the main audio (when ducking is enabled); effects are added after
 * the ducking. The final `amix` takes its length from the main audio, and a limiter at {@link MIX_CEILING}
 * stops clipping. Needs FFmpeg 4.4 or newer (`amix normalize`).
 */
export function audioLayerFilters(
  req: AudioLayerRequest,
): { filters: string[]; label: string } | null {
  const { project, mainLabel, total } = req;
  const filters: string[] = [];
  const musicLabels: string[] = [];
  const sfxLabels: string[] = [];

  audioClips(project).forEach((c, i) => {
    // The video ends at `total`: nothing is heard after it, and a fade-out lands on the real end.
    const length = Math.min(audioClipLength(c), total - c.start);
    if (length < 0.02) return;
    const asset = project.assets[c.assetId];
    if (!asset) throw new Error(`Audio clip ${c.id} references missing asset ${c.assetId}`);
    const k = req.inputFor(c.assetId);
    const sliceLength = c.out - c.in;
    const fadeIn = Math.min(c.fadeIn, length);
    const fadeOut = Math.min(c.fadeOut, length - fadeIn);
    const chain = [
      `atrim=start=${num(c.in)}:end=${num(c.out)}`,
      "asetpts=PTS-STARTPTS",
      "aresample=48000",
      "aformat=sample_fmts=fltp:channel_layouts=stereo",
    ];
    // Repeat the slice only when the clip is longer than it. The size is a cap, not an allocation.
    if (c.loop && length > sliceLength + EPS) chain.push("aloop=loop=-1:size=2147483647");
    chain.push(`atrim=duration=${num(length)}`, "asetpts=PTS-STARTPTS", `volume=${num(c.volume)}`);
    if (fadeIn > EPS) chain.push(`afade=t=in:st=0:d=${num(fadeIn)}`);
    if (fadeOut > EPS) chain.push(`afade=t=out:st=${num(length - fadeOut)}:d=${num(fadeOut)}`);
    const delayMs = Math.round(c.start * 1000);
    if (delayMs > 0) chain.push(`adelay=${delayMs}|${delayMs}`);
    const label = `[al${i}]`;
    filters.push(`[${k}:a]${chain.join(",")}${label}`);
    (c.role === "sfx" ? sfxLabels : musicLabels).push(label);
  });
  if (musicLabels.length + sfxLabels.length === 0) return null;

  const ducking = duckingOf(project);
  let main = mainLabel;
  let music: string | undefined;
  if (musicLabels.length === 1) music = musicLabels[0];
  else if (musicLabels.length > 1) {
    music = "[almusic]";
    filters.push(
      `${musicLabels.join("")}amix=inputs=${musicLabels.length}:duration=longest:normalize=0:dropout_transition=0${music}`,
    );
  }
  if (music && ducking.enabled) {
    const { threshold, ratio } = duckingCompressor(ducking);
    filters.push(
      `${mainLabel}asplit=2[alvox][alkey]`,
      `[alkey]${keyConditioning()}[alkeyc]`,
      `${music}[alkeyc]sidechaincompress=threshold=${num(threshold)}:ratio=${num(ratio)}:attack=10:release=${num(ducking.releaseSeconds * 1000)}:makeup=1[alducked]`,
    );
    main = "[alvox]";
    music = "[alducked]";
  }

  const parts = [main, ...(music ? [music] : []), ...sfxLabels];
  // duration=first: the main audio is as long as the video, so the mix ends with it. normalize=0 keeps levels
  // as set (the default divides every input by the input count); the limiter below makes it safe.
  filters.push(
    `${parts.join("")}amix=inputs=${parts.length}:duration=first:normalize=0:dropout_transition=0,alimiter=limit=${MIX_CEILING}:level=disabled,aresample=48000[almix]`,
  );
  return { filters, label: "[almix]" };
}
