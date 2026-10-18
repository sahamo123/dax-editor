// Timeline edit operations. Pure functions (Project in, Project out) with no filesystem or FFmpeg access.

import type { Asset, Clip, Project, Range } from "./schema.js";

/**
 * Pure edit operations. Each takes a project and returns a new one; the input
 * is never mutated, which is what makes undo/redo a simple snapshot stack.
 *
 * v0.1 edits a single gapless "main" video track (id `v1`): every operation
 * ripples, i.e. later clips slide left to close any hole.
 */

/** Id of the single track that v0.1 edits. */
export const MAIN_TRACK = "v1";
const EPS = 1e-6;

let counter = 0;
/** Generate a short id such as `clip_lx3k2a1`. Unique within a process; not meant to be unguessable. */
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

/** Create a project with no assets and one empty main track. Defaults to 1920x1080 at 30 fps. */
export function emptyProject(
  name: string,
  opts: { width?: number; height?: number; fps?: number } = {},
): Project {
  return {
    version: 1,
    name,
    assets: {},
    timeline: {
      width: opts.width ?? 1920,
      height: opts.height ?? 1080,
      fps: opts.fps ?? 30,
      tracks: [{ id: MAIN_TRACK, kind: "video", clips: [] }],
    },
  };
}

/** Length of the clip on the timeline, in seconds. */
export function clipDuration(c: Clip): number {
  return c.out - c.in;
}

/** Timeline time, in seconds, at which the clip ends. */
export function clipEnd(c: Clip): number {
  return c.start + clipDuration(c);
}

function mainTrack(p: Project) {
  const t = p.timeline.tracks.find((t) => t.id === MAIN_TRACK);
  if (!t) throw new Error(`Project has no main track "${MAIN_TRACK}"`);
  return t;
}

/** The clips on the main track in timeline order. Throws if the main track is missing. */
export function mainClips(p: Project): Clip[] {
  return mainTrack(p).clips;
}

/** Total length of the main track in seconds; 0 when empty. */
export function timelineDuration(p: Project): number {
  const clips = mainClips(p);
  const last = clips[clips.length - 1];
  return last ? clipEnd(last) : 0;
}

/** Re-lay clips back to back starting at 0. */
function relayout(clips: Clip[]): Clip[] {
  let t = 0;
  return clips.map((c) => {
    const placed = { ...c, start: t };
    t += clipDuration(c);
    return placed;
  });
}

function withClips(p: Project, clips: Clip[]): Project {
  const next = structuredClone(p);
  mainTrack(next).clips = relayout(clips).filter((c) => clipDuration(c) > EPS);
  return next;
}

/** Register a probed media file with the project so clips can reference it. */
export function addAsset(p: Project, asset: Asset): Project {
  const next = structuredClone(p);
  next.assets[asset.id] = asset;
  return next;
}

/** Append (a slice of) an asset to the end of the main track. */
export function appendClip(
  p: Project,
  assetId: string,
  slice: { in?: number; out?: number } = {},
): Project {
  const asset = p.assets[assetId];
  if (!asset) throw new Error(`Unknown asset "${assetId}"`);
  const inPoint = slice.in ?? 0;
  const outPoint = Math.min(slice.out ?? asset.duration, asset.duration);
  if (outPoint - inPoint <= EPS) throw new Error("Clip would be empty");
  const clip: Clip = {
    id: newId("clip"),
    assetId,
    start: timelineDuration(p),
    in: inPoint,
    out: outPoint,
    volume: 1,
  };
  return withClips(p, [...mainClips(p), clip]);
}

/** Split whichever clip contains timeline time `t` into two. */
export function splitAt(p: Project, t: number): Project {
  const clips = mainClips(p);
  const idx = clips.findIndex((c) => t > c.start + EPS && t < clipEnd(c) - EPS);
  const c = clips[idx];
  if (!c) throw new Error(`No clip can be split at ${t}s`);
  const cut = c.in + (t - c.start);
  const left: Clip = { ...c, out: cut };
  const right: Clip = { ...c, id: newId("clip"), in: cut };
  return withClips(p, [...clips.slice(0, idx), left, right, ...clips.slice(idx + 1)]);
}

/** Remove the timeline range [from, to) and close the gap. */
export function deleteRange(p: Project, from: number, to: number): Project {
  if (to <= from) throw new Error("Range end must be after start");
  const out: Clip[] = [];
  for (const c of mainClips(p)) {
    const s = c.start;
    const e = clipEnd(c);
    if (e <= from + EPS || s >= to - EPS) {
      out.push(c);
      continue;
    }
    if (s < from - EPS) out.push({ ...c, out: c.in + (from - s) });
    if (e > to + EPS) out.push({ ...c, id: newId("clip"), in: c.in + (to - s) });
  }
  return withClips(p, out);
}

/** Remove several timeline ranges at once (ranges refer to the *current* timeline). */
export function deleteRanges(p: Project, ranges: Range[]): Project {
  const sorted = [...ranges].sort((a, b) => b.start - a.start);
  return sorted.reduce((acc, r) => deleteRange(acc, r.start, r.end), p);
}

/** Keep only the given timeline ranges, deleting everything between them. */
export function keepRanges(p: Project, keep: Range[]): Project {
  const dur = timelineDuration(p);
  const sorted = [...keep].sort((a, b) => a.start - b.start);
  const remove: Range[] = [];
  let cursor = 0;
  for (const r of sorted) {
    if (r.start > cursor + EPS) remove.push({ start: cursor, end: r.start });
    cursor = Math.max(cursor, r.end);
  }
  if (cursor < dur - EPS) remove.push({ start: cursor, end: dur });
  return deleteRanges(p, remove);
}

/** Sort and merge overlapping or touching ranges. */
export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + EPS) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/**
 * Translate ranges expressed in an asset's own time (e.g. silences or filler
 * words detected on the source file) into timeline ranges, covering every
 * clip that currently uses that asset.
 */
export function assetRangesToTimeline(p: Project, assetId: string, ranges: Range[]): Range[] {
  const out: Range[] = [];
  for (const c of mainClips(p)) {
    if (c.assetId !== assetId) continue;
    for (const r of ranges) {
      const s = Math.max(r.start, c.in);
      const e = Math.min(r.end, c.out);
      if (e - s > EPS) out.push({ start: c.start + (s - c.in), end: c.start + (e - c.in) });
    }
  }
  return mergeRanges(out);
}

/** Delete source-time ranges of an asset wherever the timeline uses them. */
export function removeAssetRanges(p: Project, assetId: string, ranges: Range[]): Project {
  return deleteRanges(p, assetRangesToTimeline(p, assetId, ranges));
}

/** Remove one clip and close the gap behind it. */
export function removeClip(p: Project, clipId: string): Project {
  const clips = mainClips(p);
  if (!clips.some((c) => c.id === clipId)) throw new Error(`Unknown clip "${clipId}"`);
  return withClips(
    p,
    clips.filter((c) => c.id !== clipId),
  );
}

/** Change a clip's source in/out points. */
export function trimClip(p: Project, clipId: string, trim: { in?: number; out?: number }): Project {
  const clips = mainClips(p);
  const c = clips.find((c) => c.id === clipId);
  if (!c) throw new Error(`Unknown clip "${clipId}"`);
  const asset = p.assets[c.assetId];
  if (!asset) throw new Error(`Clip "${clipId}" references missing asset "${c.assetId}"`);
  const inPoint = Math.max(0, trim.in ?? c.in);
  const outPoint = Math.min(asset.duration, trim.out ?? c.out);
  if (outPoint - inPoint <= EPS) throw new Error("Trim would make the clip empty");
  return withClips(
    p,
    clips.map((x) => (x.id === clipId ? { ...x, in: inPoint, out: outPoint } : x)),
  );
}

/** Move a clip to a new position in the main track's order (0-based). */
export function moveClip(p: Project, clipId: string, index: number): Project {
  const clips = [...mainClips(p)];
  const from = clips.findIndex((c) => c.id === clipId);
  if (from === -1) throw new Error(`Unknown clip "${clipId}"`);
  const [moved] = clips.splice(from, 1);
  if (!moved) throw new Error(`Unknown clip "${clipId}"`);
  clips.splice(Math.max(0, Math.min(index, clips.length)), 0, moved);
  return withClips(p, clips);
}

/** Set a clip's linear gain (1 = unchanged, 0 = muted). */
export function setClipVolume(p: Project, clipId: string, volume: number): Project {
  const clips = mainClips(p);
  if (!clips.some((c) => c.id === clipId)) throw new Error(`Unknown clip "${clipId}"`);
  return withClips(
    p,
    clips.map((c) => (c.id === clipId ? { ...c, volume } : c)),
  );
}
