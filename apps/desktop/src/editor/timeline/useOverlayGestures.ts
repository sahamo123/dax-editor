// Pointer gestures on overlay blocks (drag to move: move_overlay; drag an edge to resize: update_overlay) and the
// timeline's role as the drop target for presets dragged from the Presets panel (add_overlay).

import { type PointerEvent as ReactPointerEvent, useCallback, useEffect } from "react";
import { useEditActions } from "../actions";
import { previewOverlayMove, previewOverlayResize } from "../lib/overlay-layout";
import { MIN_OVERLAY_DURATION } from "../lib/project";
import { snapTargets, snapValue } from "../lib/snap";
import { round } from "../lib/time";
import { GUTTER, RULER_H } from "./constants";
import { startPointerDrag } from "./drag-session";
import type { GestureEnv } from "./gesture-env";

/** The overlay gesture handlers; pass them to the overlay blocks. */
export interface OverlayGestures {
  onOverlayDown(e: ReactPointerEvent, id: string): void;
  onOverlayEdgeDown(e: ReactPointerEvent, id: string, edge: "start" | "end"): void;
}

/** Longest overlay the commands accept, in seconds. */
const MAX_OVERLAY_DURATION = 120;

/** Build the stable overlay gesture handlers and register the timeline as the preset drop target. */
export function useOverlayGestures(env: GestureEnv): OverlayGestures {
  const { store, live, scrollerRef, setDrag, commit, threshold, timeAt } = env;
  const actions = useEditActions();

  const onOverlayDown = useCallback(
    (e: ReactPointerEvent, id: string) => {
      if (e.button !== 0) return;
      store.select({ kind: "overlay", id });
      const project = live.current.project;
      const ov = project.timeline.overlays.find((o) => o.id === id);
      if (!ov) return;
      const compute = (dx: number) =>
        previewOverlayMove({
          start: ov.start,
          duration: ov.duration,
          deltaSec: dx / live.current.zoom,
          targets: snapTargets(project, store.getState().playhead, { overlayId: id }),
          threshold: threshold(),
        });
      startPointerDrag(
        e,
        { scroller: scrollerRef.current, leftInset: GUTTER },
        {
          onMove: ({ dx }) => {
            const r = compute(dx);
            setDrag({
              type: "overlay",
              id,
              start: r.start,
              duration: r.duration,
              snappedTo: r.snappedTo,
            });
          },
          onEnd: ({ dx }, outcome) => {
            setDrag(null);
            if (outcome !== "commit") return;
            const r = compute(dx);
            if (Math.abs(r.start - ov.start) < 1e-4) return;
            void commit(
              { overlays: { [id]: { start: r.start, duration: ov.duration } } },
              "move_overlay",
              {
                overlayId: id,
                start: round(r.start),
              },
            );
          },
        },
      );
    },
    [store, live, scrollerRef, setDrag, commit, threshold],
  );

  const onOverlayEdgeDown = useCallback(
    (e: ReactPointerEvent, id: string, edge: "start" | "end") => {
      if (e.button !== 0) return;
      store.select({ kind: "overlay", id });
      const project = live.current.project;
      const ov = project.timeline.overlays.find((o) => o.id === id);
      if (!ov) return;
      const compute = (dx: number) => {
        const r = previewOverlayResize({
          start: ov.start,
          duration: ov.duration,
          deltaSec: dx / live.current.zoom,
          targets: snapTargets(project, store.getState().playhead, { overlayId: id }),
          threshold: threshold(),
          edge,
        });
        return {
          ...r,
          duration: Math.min(MAX_OVERLAY_DURATION, Math.max(MIN_OVERLAY_DURATION, r.duration)),
        };
      };
      startPointerDrag(
        e,
        { scroller: scrollerRef.current, leftInset: GUTTER, threshold: 0 },
        {
          onMove: ({ dx }) => {
            const r = compute(dx);
            setDrag({
              type: "overlay",
              id,
              start: r.start,
              duration: r.duration,
              snappedTo: r.snappedTo,
            });
          },
          onEnd: ({ dx }, outcome) => {
            setDrag(null);
            if (outcome === "cancel") return;
            const r = compute(dx);
            if (Math.abs(r.start - ov.start) < 1e-4 && Math.abs(r.duration - ov.duration) < 1e-4)
              return;
            const args: Record<string, unknown> =
              edge === "start"
                ? { overlayId: id, start: round(r.start), duration: round(r.duration) }
                : { overlayId: id, duration: round(r.duration) };
            void commit(
              { overlays: { [id]: { start: r.start, duration: r.duration } } },
              "update_overlay",
              args,
            );
          },
        },
      );
    },
    [store, live, scrollerRef, setDrag, commit, threshold],
  );

  // The timeline accepts presets dropped anywhere below the ruler and right of the lane labels.
  useEffect(() => {
    const dropTime = (clientX: number, clientY: number): number | null => {
      const el = scrollerRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (clientX < r.left + GUTTER || clientX > r.right) return null;
      if (clientY < r.top + RULER_H || clientY > r.bottom) return null;
      let t = Math.max(0, timeAt(clientX));
      const th = threshold();
      if (th > 0) {
        t = Math.max(
          0,
          snapValue(t, snapTargets(live.current.project, store.getState().playhead), th).time,
        );
      }
      return t;
    };
    return store.registerDropTarget({
      hitTest: dropTime,
      drop: (preset, time) => {
        void actions.addPreset(preset, time);
      },
    });
  }, [store, live, scrollerRef, timeAt, threshold, actions]);

  return { onOverlayDown, onOverlayEdgeDown };
}
