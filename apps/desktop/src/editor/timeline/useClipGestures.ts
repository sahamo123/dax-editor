// Pointer gestures on clip blocks: drag to reorder (move_clip), drag an edge to trim (trim_clip), drag the corner
// handles to set fades (set_fades) and drag the volume line (set_volume). Each previews live via `setDrag` using the
// pure functions in lib/clip-layout.ts, and sends exactly one command when released.

import { type PointerEvent as ReactPointerEvent, useCallback } from "react";
import {
  type PlacedClip,
  previewReorder,
  previewTrim,
  repack,
  type TrimPreview,
} from "../lib/clip-layout";
import { clipDur } from "../lib/project";
import { clamp, round } from "../lib/time";
import { GUTTER, MAX_UI_VOLUME, WAVE_H } from "./constants";
import { startPointerDrag } from "./drag-session";
import { type GestureEnv, trimTargets } from "./gesture-env";

/** The clip gesture handlers; pass them to the clip blocks. */
export interface ClipGestures {
  onClipDown(e: ReactPointerEvent, clipId: string): void;
  onTrimDown(e: ReactPointerEvent, clipId: string, edge: "start" | "end"): void;
  onFadeDown(e: ReactPointerEvent, clipId: string, side: "in" | "out"): void;
  onVolumeDown(e: ReactPointerEvent, clipId: string): void;
}

/** Build the stable clip gesture handlers for a timeline. */
export function useClipGestures(env: GestureEnv): ClipGestures {
  const { store, live, scrollerRef, setDrag, commit, threshold } = env;

  const onClipDown = useCallback(
    (e: ReactPointerEvent, clipId: string) => {
      if (e.button !== 0) return;
      store.select({ kind: "clip", id: clipId });
      const { placed: base, zoom: z } = live.current;
      const dragged = base.find((c) => c.id === clipId);
      if (!dragged) return;
      const originalIndex = base.findIndex((c) => c.id === clipId);
      const durSec = clipDur(dragged);
      const evaluate = (dx: number) => {
        const startT = Math.max(0, dragged.start + dx / z);
        return { startT, pv: previewReorder(base, clipId, startT + durSec / 2) };
      };
      startPointerDrag(e, dragOptions(scrollerRef), {
        onMove: ({ dx }) => {
          const { startT, pv } = evaluate(dx);
          setDrag({
            type: "reorder",
            clipId,
            dxPx: (startT - dragged.start) * z,
            starts: pv.starts,
            index: pv.index,
            slotStart: pv.slotStart,
          });
        },
        onEnd: ({ dx }, outcome) => {
          setDrag(null);
          if (outcome !== "commit") return;
          const { pv } = evaluate(dx);
          if (pv.index === originalIndex) return;
          void commit({ clips: reordered(base, clipId, pv.index) }, "move_clip", {
            clipId,
            index: pv.index,
          });
        },
      });
    },
    [store, live, scrollerRef, setDrag, commit],
  );

  const onTrimDown = useCallback(
    (e: ReactPointerEvent, clipId: string, edge: "start" | "end") => {
      if (e.button !== 0) return;
      store.select({ kind: "clip", id: clipId });
      const { placed: base, zoom: z, project, fps } = live.current;
      const clip = base.find((c) => c.id === clipId);
      const asset = clip ? project.assets[clip.assetId] : undefined;
      if (!clip || !asset) return;
      const compute = (dx: number): TrimPreview => {
        const th = threshold();
        const playhead = store.getState().playhead;
        return previewTrim({
          clips: base,
          clipId,
          edge,
          deltaSec: dx / z,
          assetDuration: asset.duration,
          fps,
          targets: th > 0 ? trimTargets(project, playhead) : [],
          threshold: th,
          playhead,
        });
      };
      startPointerDrag(e, dragOptions(scrollerRef, 0), {
        onMove: ({ dx }) => setDrag({ type: "trim", clipId, edge, preview: compute(dx) }),
        onEnd: ({ dx }, outcome) => {
          setDrag(null);
          if (outcome === "cancel") return;
          const pv = compute(dx);
          if (pv.unchanged) return;
          const args =
            edge === "start" ? { clipId, in: round(pv.in) } : { clipId, out: round(pv.out) };
          void commit({ clips: pv.clips }, "trim_clip", args);
        },
      });
    },
    [store, live, scrollerRef, setDrag, commit, threshold],
  );

  const onFadeDown = useCallback(
    (e: ReactPointerEvent, clipId: string, side: "in" | "out") => {
      if (e.button !== 0) return;
      store.select({ kind: "clip", id: clipId });
      const { placed: base, zoom: z } = live.current;
      const clip = base.find((c) => c.id === clipId);
      if (!clip) return;
      const startValue = side === "in" ? clip.fadeIn : clip.fadeOut;
      const other = side === "in" ? clip.fadeOut : clip.fadeIn;
      // Both fades together cannot be longer than the clip.
      const max = Math.max(0, clipDur(clip) - other);
      const compute = (dx: number) => {
        let v = clamp(startValue + (side === "in" ? dx : -dx) / z, 0, max);
        if (v < 0.04) v = 0;
        return round(v, 2);
      };
      startPointerDrag(e, dragOptions(scrollerRef, 0), {
        onMove: ({ dx }) => setDrag({ type: "fade", clipId, side, value: compute(dx) }),
        onEnd: ({ dx }, outcome) => {
          setDrag(null);
          if (outcome === "cancel") return;
          const v = compute(dx);
          if (v === startValue) return;
          const patch = side === "in" ? { fadeIn: v } : { fadeOut: v };
          void commit(
            { clipPatch: { [clipId]: patch } },
            "set_fades",
            side === "in" ? { clipId, fadeIn: v } : { clipId, fadeOut: v },
          );
        },
      });
    },
    [store, live, scrollerRef, setDrag, commit],
  );

  const onVolumeDown = useCallback(
    (e: ReactPointerEvent, clipId: string) => {
      if (e.button !== 0) return;
      store.select({ kind: "clip", id: clipId });
      const clip = live.current.placed.find((c) => c.id === clipId);
      if (!clip) return;
      const compute = (dy: number) => {
        let v = clamp(clip.volume - (dy / WAVE_H) * MAX_UI_VOLUME, 0, MAX_UI_VOLUME);
        // A magnet at 100% so "unchanged" is easy to restore.
        if (Math.abs(v - 1) < 0.05) v = 1;
        return round(v, 2);
      };
      startPointerDrag(
        e,
        { threshold: 0 },
        {
          onMove: ({ dy }) => setDrag({ type: "volume", clipId, value: compute(dy) }),
          onEnd: ({ dy }, outcome) => {
            setDrag(null);
            if (outcome === "cancel") return;
            const v = compute(dy);
            if (v === clip.volume) return;
            void commit({ clipPatch: { [clipId]: { volume: v } } }, "set_volume", {
              clipId,
              volume: v,
            });
          },
        },
      );
    },
    [store, live, setDrag, commit],
  );

  return { onClipDown, onTrimDown, onFadeDown, onVolumeDown };
}

/** Drag options that auto-scroll the timeline near its edges, keeping the sticky lane labels out of the way. */
function dragOptions(scrollerRef: GestureEnv["scrollerRef"], threshold?: number) {
  return {
    scroller: scrollerRef.current,
    leftInset: GUTTER,
    ...(threshold === undefined ? {} : { threshold }),
  };
}

/** The clip layout after moving `clipId` to `index`, re-packed back to back (what the server will produce). */
function reordered(base: readonly PlacedClip[], clipId: string, index: number): PlacedClip[] {
  const dragged = base.find((c) => c.id === clipId);
  const rest = base.filter((c) => c.id !== clipId);
  if (dragged) rest.splice(clamp(index, 0, rest.length), 0, dragged);
  return repack(rest);
}
