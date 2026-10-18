// Read-only helpers over the project JSON. They mirror the small parts of @dax/core that the UI needs
// (the core package cannot be imported at runtime in a browser because it pulls in Node APIs).

import type { Clip, Overlay, Project } from "@dax/core";

/** Id of the main video track that v0.1 edits (mirrors `MAIN_TRACK` in @dax/core). */
export const MAIN_TRACK_ID = "v1";

/** Smallest timeline length, in seconds, the UI lets a clip or overlay shrink to. */
export const MIN_OVERLAY_DURATION = 0.2;

/** Length of a clip on the timeline, in seconds. */
export function clipDur(c: Pick<Clip, "in" | "out">): number {
  return c.out - c.in;
}

/** Timeline second at which a clip ends. */
export function clipEndTime(c: Pick<Clip, "start" | "in" | "out">): number {
  return c.start + clipDur(c);
}

/** The clips of the main video track in timeline order; empty when the project has none. */
export function mainClips(p: Project): Clip[] {
  const track =
    p.timeline.tracks.find((t) => t.id === MAIN_TRACK_ID) ??
    p.timeline.tracks.find((t) => t.kind === "video");
  return track ? track.clips : [];
}

/** Length of the video on the timeline in seconds; 0 when empty. */
export function videoDuration(p: Project): number {
  const clips = mainClips(p);
  const last = clips[clips.length - 1];
  return last ? clipEndTime(last) : 0;
}

/** Furthest timeline second occupied by a clip or an overlay (what the timeline view must be able to show). */
export function contentExtent(p: Project): number {
  let end = videoDuration(p);
  for (const o of p.timeline.overlays) end = Math.max(end, o.start + o.duration);
  return end;
}

/**
 * Index of the clip playing at timeline time `t`. A time at or past the end resolves to the last clip so
 * the final frame can be shown; returns -1 only when there are no clips.
 */
export function clipIndexAt(
  clips: readonly Pick<Clip, "start" | "in" | "out">[],
  t: number,
): number {
  if (clips.length === 0) return -1;
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    if (c && t >= c.start && t < clipEndTime(c)) return i;
  }
  return t < 0 ? 0 : clips.length - 1;
}

/** Find an overlay by id. */
export function findOverlay(p: Project, id: string): Overlay | undefined {
  return p.timeline.overlays.find((o) => o.id === id);
}

/** Find a main-track clip by id. */
export function findClip(p: Project, id: string): Clip | undefined {
  return mainClips(p).find((c) => c.id === id);
}

/** Last path segment of a file path, for labels. Handles `/` and `\` separators. */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
