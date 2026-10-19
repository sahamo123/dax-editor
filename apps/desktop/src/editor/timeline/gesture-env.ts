// Types shared by the timeline's gesture hooks: the live drag preview, the "hold until the server catches up"
// state, and the environment (store, refs, helpers) each gesture hook receives.

import type { Project } from "@dax/core";
import type { CommandResponse } from "@dax/protocol";
import type { MutableRefObject, RefObject } from "react";
import type { PlacedClip, TrimPreview } from "../lib/clip-layout";
import type { EditorStore } from "../store";

/** The gesture currently in progress, as the preview the timeline should draw. */
export type Drag =
  | {
      type: "reorder";
      clipId: string;
      /** Horizontal offset in pixels of the dragged block from its saved position. */
      dxPx: number;
      /** Start time of every other clip while a gap is held open at the drop slot. */
      starts: Map<string, number>;
      index: number;
      slotStart: number;
    }
  | { type: "trim"; clipId: string; edge: "start" | "end"; preview: TrimPreview }
  | { type: "fade"; clipId: string; side: "in" | "out"; value: number }
  | { type: "volume"; clipId: string; value: number }
  | { type: "overlay"; id: string; start: number; duration: number; snappedTo: number | null };

/** A preview kept on screen after a drop until the server state reflects the edit. */
export interface Optimistic {
  /** History revision when the edit was sent; the hold ends when it changes. */
  revision: string;
  /** A complete new clip layout (reorder, trim). */
  clips?: PlacedClip[];
  /** Per-clip field overrides (fades, volume). */
  clipPatch?: Record<string, Partial<PlacedClip>>;
  /** New position of overlays. */
  overlays?: Record<string, { start: number; duration: number }>;
}

/** Latest values the gesture handlers read at event time (so the handlers themselves can stay stable). */
export interface LiveValues {
  project: Project;
  /** Clips laid out as saved (before any preview). */
  placed: PlacedClip[];
  zoom: number;
  snapping: boolean;
  revision: string;
  fps: number;
}

/** Everything a gesture hook needs from the Timeline. */
export interface GestureEnv {
  store: EditorStore;
  live: MutableRefObject<LiveValues>;
  scrollerRef: RefObject<HTMLDivElement>;
  setDrag(drag: Drag | null): void;
  /** Send an edit, holding `hold` on screen until the server state arrives. A failure drops the hold. */
  commit(
    hold: Omit<Optimistic, "revision"> | null,
    name: string,
    args: Record<string, unknown>,
  ): Promise<CommandResponse>;
  /** Snap distance in seconds for the current zoom, or 0 when snapping is off. */
  threshold(): number;
  /** Timeline time under a viewport x coordinate. */
  timeAt(clientX: number): number;
}

/** Snap targets for trimming: the playhead and overlay edges (clip edges move with the ripple, so they are excluded). */
export function trimTargets(project: Project, playhead: number): number[] {
  const t = [playhead];
  for (const o of project.timeline.overlays) t.push(o.start, o.start + o.duration);
  return t;
}
