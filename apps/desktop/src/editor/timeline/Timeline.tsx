// The timeline: ruler, overlay lanes, the main video lane, the playhead, and every direct-manipulation gesture
// (scrub, reorder, trim, fades, volume, overlay move/resize, preset drop). During a gesture the UI shows a local
// preview computed by the pure functions in lib/; on release the edit is sent through run() and the preview is held
// until the server state catches up. The timeline never changes project data itself.

import type { Asset } from "@dax/core";
import { mediaUrl } from "@dax/protocol";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useEditActions } from "../actions";
import {
  useEditorApi,
  useEditorSelector,
  useEditorStore,
  useExec,
  useProjectRevision,
} from "../context";
import {
  type PlacedClip,
  placeClips,
  previewReorder,
  previewTrim,
  type TrimPreview,
} from "../lib/clip-layout";
import { zoomAround } from "../lib/geometry";
import { assignRows, previewOverlayMove, previewOverlayResize } from "../lib/overlay-layout";
import { baseName, clipDur, contentExtent, MIN_OVERLAY_DURATION, mainClips } from "../lib/project";
import { SNAP_PX, snapTargets, snapValue } from "../lib/snap";
import { clamp, round } from "../lib/time";
import { ClipBlock } from "./ClipBlock";
import {
  CLIP_PAD,
  GUTTER,
  LANE_H,
  MAX_UI_VOLUME,
  RULER_H,
  TAIL_SECONDS,
  VIDEO_H,
  WAVE_H,
  WINDOW_MARGIN,
  WINDOW_QUANTUM,
} from "./constants";
import { startPointerDrag } from "./drag-session";
import { OverlayBlock } from "./OverlayBlock";
import { Playhead } from "./Playhead";
import { Ruler } from "./Ruler";

type Drag =
  | {
      type: "reorder";
      clipId: string;
      dxPx: number;
      starts: Map<string, number>;
      index: number;
      slotStart: number;
    }
  | { type: "trim"; clipId: string; edge: "start" | "end"; preview: TrimPreview }
  | { type: "fade"; clipId: string; side: "in" | "out"; value: number }
  | { type: "volume"; clipId: string; value: number }
  | {
      type: "overlay";
      id: string;
      start: number;
      duration: number;
      snappedTo: number | null;
    };

/** A preview held after a drop until the server state reflects the edit. */
interface Optimistic {
  revision: string;
  clips?: PlacedClip[];
  clipPatch?: Record<string, Partial<PlacedClip>>;
  overlays?: Record<string, { start: number; duration: number }>;
}

const CATEGORY_FALLBACK = "custom";

/** Props of {@link Timeline}. */
export interface TimelineProps {
  className?: string;
}

/**
 * The editing timeline. Fill its parent (it uses 100% width and height). Scrolls horizontally with the wheel,
 * zooms with Ctrl/Cmd + wheel or pinch, and accepts presets dragged from the Presets panel.
 */
export function Timeline({ className }: TimelineProps) {
  const api = useEditorApi();
  const store = useEditorStore();
  const exec = useExec();
  const actions = useEditActions();
  const project = api.state.project;
  const zoom = useEditorSelector((s) => s.zoom);
  const selection = useEditorSelector((s) => s.selection);
  const snapping = useEditorSelector((s) => s.snapping);
  const error = useEditorSelector((s) => s.error);
  const presetDrag = useEditorSelector((s) => s.presetDrag);
  const revision = useProjectRevision();

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(0);
  const [win, setWin] = useState({ from: 0, to: 1600 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [optimistic, setOptimistic] = useState<Optimistic | null>(null);
  const pendingScroll = useRef<number | null>(null);
  const prevZoom = useRef(zoom);

  // ---- derived layout ----
  const placed = useMemo(() => placeClips(mainClips(project)), [project]);
  const fps = project.timeline.fps;
  const aspect = project.timeline.width / project.timeline.height;
  const presetCategory = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of api.state.presets) m.set(p.id, p.category);
    return m;
  }, [api.state.presets]);

  const ghost = presetDrag && presetDrag.hoverTime !== null ? presetDrag : null;
  const overlayRows = useMemo(() => {
    const spans = project.timeline.overlays.map((o) => {
      const o2 = optimistic?.overlays?.[o.id];
      return {
        id: o.id,
        start: o2?.start ?? o.start,
        duration: o2?.duration ?? o.duration,
        lane: o.lane,
      };
    });
    if (ghost && ghost.hoverTime !== null) {
      spans.push({
        id: "__ghost",
        start: ghost.hoverTime,
        duration: ghost.preset.defaultDuration,
        lane: 0,
      });
    }
    return assignRows(spans);
  }, [project.timeline.overlays, optimistic, ghost]);
  const rowCount = overlayRows.rowCount;
  const lanesTop = RULER_H;
  const videoTop = lanesTop + rowCount * LANE_H;
  const contentHeight = videoTop + VIDEO_H + 6;

  // What each clip looks like right now: saved layout, then optimistic hold, then a live drag preview on top.
  const displayClips = useMemo(() => {
    let list: PlacedClip[] = optimistic?.clips ?? placed;
    if (optimistic?.clipPatch) {
      const patch = optimistic.clipPatch;
      list = list.map((c) => (patch[c.id] ? { ...c, ...patch[c.id] } : c));
    }
    if (drag?.type === "trim") list = drag.preview.clips;
    if (drag?.type === "fade" || drag?.type === "volume") {
      const d = drag;
      list = list.map((c) => {
        if (c.id !== d.clipId) return c;
        if (d.type === "volume") return { ...c, volume: d.value };
        return d.side === "in" ? { ...c, fadeIn: d.value } : { ...c, fadeOut: d.value };
      });
    }
    return list;
  }, [placed, optimistic, drag]);

  const extent = contentExtent(project);
  const trackW = Math.max(viewW - GUTTER, 600);
  const contentW = GUTTER + Math.max((extent + TAIL_SECONDS) * zoom, trackW);

  // Handlers read the latest values through a ref so they can be stable (keeps memoised blocks from re-rendering).
  const live = useRef({ project, placed, zoom, snapping, revision, fps });
  live.current = { project, placed, zoom, snapping, revision, fps };

  // ---- window / virtualisation ----
  const updateWindow = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const w = el.clientWidth || 1200;
    setViewW((prev) => (prev === w ? prev : w));
    const from = Math.floor((el.scrollLeft - WINDOW_MARGIN) / WINDOW_QUANTUM) * WINDOW_QUANTUM;
    const to = Math.ceil((el.scrollLeft + w + WINDOW_MARGIN) / WINDOW_QUANTUM) * WINDOW_QUANTUM;
    setWin((prev) => (prev.from === from && prev.to === to ? prev : { from, to }));
  }, []);

  useLayoutEffect(() => {
    updateWindow();
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(updateWindow);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateWindow]);

  // Zoom: keep the playhead (or the middle of the view) fixed on screen, unless the wheel handler already chose.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    const prev = prevZoom.current;
    prevZoom.current = zoom;
    if (!el || prev === zoom) return;
    if (pendingScroll.current !== null) {
      el.scrollLeft = pendingScroll.current;
      pendingScroll.current = null;
    } else {
      const track = el.clientWidth - GUTTER;
      const playheadX = store.getState().playhead * prev - el.scrollLeft;
      const anchorX = playheadX >= 0 && playheadX <= track ? playheadX : track / 2;
      const anchorTime = (el.scrollLeft + anchorX) / prev;
      el.scrollLeft = Math.max(0, anchorTime * zoom - anchorX);
    }
    updateWindow();
  }, [zoom, store, updateWindow]);

  // Expose the viewport to the toolbar (fit to window) and follow the playhead when it leaves the view.
  useEffect(() => {
    store.viewport = {
      trackWidth: () => Math.max(100, (scrollerRef.current?.clientWidth ?? 800) - GUTTER),
      scrollTo: (left) => {
        if (scrollerRef.current) scrollerRef.current.scrollLeft = left;
      },
    };
    let last = store.getState().playhead;
    const off = store.subscribe(() => {
      const el = scrollerRef.current;
      const s = store.getState();
      if (!el || s.playhead === last) return;
      last = s.playhead;
      const x = s.playhead * live.current.zoom;
      const visibleLeft = el.scrollLeft;
      const visibleRight = el.scrollLeft + el.clientWidth - GUTTER;
      if (x > visibleRight - 24 || x < visibleLeft) {
        el.scrollLeft = Math.max(0, x - 0.15 * (el.clientWidth - GUTTER));
      }
    });
    return () => {
      off();
      store.viewport = null;
    };
  }, [store]);

  // Wheel: Ctrl/Cmd (or a trackpad pinch) zooms around the pointer; a plain wheel scrolls sideways.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025));
        const r = zoomAround({
          zoom: live.current.zoom,
          factor,
          scrollLeft: el.scrollLeft,
          anchorViewportX: Math.max(0, e.clientX - rect.left - GUTTER),
        });
        if (r.zoom === live.current.zoom) return;
        pendingScroll.current = r.scrollLeft;
        store.setZoom(r.zoom);
        return;
      }
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY) && el.scrollHeight <= el.clientHeight + 1) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [store]);

  // ---- optimistic hold ----
  useEffect(() => {
    setOptimistic((prev) => (prev && prev.revision !== revision ? null : prev));
  }, [revision]);
  useEffect(() => {
    if (!optimistic) return;
    const id = setTimeout(() => setOptimistic(null), 3000);
    return () => clearTimeout(id);
  }, [optimistic]);
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => store.setError(null), 6000);
    return () => clearTimeout(id);
  }, [error, store]);

  /** Run an edit, holding `hold` on screen until the server state arrives. A failure drops the hold. */
  const commit = useCallback(
    async (
      hold: Omit<Optimistic, "revision"> | null,
      name: string,
      args: Record<string, unknown>,
    ) => {
      if (hold) setOptimistic({ ...hold, revision: live.current.revision });
      const res = await exec(name, args);
      if (!res.ok) setOptimistic(null);
      return res;
    },
    [exec],
  );

  // ---- coordinate helpers ----
  const timeAt = useCallback((clientX: number): number => {
    const el = scrollerRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return (clientX - rect.left + el.scrollLeft - GUTTER) / live.current.zoom;
  }, []);

  const threshold = useCallback(
    () => (live.current.snapping ? SNAP_PX / live.current.zoom : 0),
    [],
  );

  // ---- scrubbing ----
  const onRulerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      const scrubTo = (clientX: number) => {
        let t = Math.max(0, timeAt(clientX));
        const th = threshold();
        if (th > 0) t = snapValue(t, snapTargets(live.current.project, -1), th).time;
        store.setPlayhead(t);
      };
      scrubTo(e.clientX);
      startPointerDrag(
        e,
        { scroller: scrollerRef.current, leftInset: GUTTER, threshold: 0 },
        { onMove: (i) => scrubTo(i.clientX), onEnd: () => {} },
      );
    },
    [store, timeAt, threshold],
  );

  // ---- clip gestures ----
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
        const pv = previewReorder(base, clipId, startT + durSec / 2);
        return { startT, pv };
      };
      startPointerDrag(
        e,
        { scroller: scrollerRef.current, leftInset: GUTTER },
        {
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
            const ids = base.map((c) => c.id).filter((id) => id !== clipId);
            ids.splice(pv.index, 0, clipId);
            const byId = new Map(base.map((c) => [c.id, c]));
            const order = ids.flatMap((id) => {
              const c = byId.get(id);
              return c ? [c] : [];
            });
            void commit({ clips: relayout(order) }, "move_clip", { clipId, index: pv.index });
          },
        },
      );
    },
    [store, commit],
  );

  const onTrimDown = useCallback(
    (e: ReactPointerEvent, clipId: string, edge: "start" | "end") => {
      if (e.button !== 0) return;
      store.select({ kind: "clip", id: clipId });
      const { placed: base, zoom: z, project: proj, fps: f } = live.current;
      const clip = base.find((c) => c.id === clipId);
      const asset = clip ? proj.assets[clip.assetId] : undefined;
      if (!clip || !asset) return;
      const compute = (dx: number): TrimPreview => {
        const th = threshold();
        const targets = th > 0 ? trimTargets(proj, store.getState().playhead) : [];
        return previewTrim({
          clips: base,
          clipId,
          edge,
          deltaSec: dx / z,
          assetDuration: asset.duration,
          fps: f,
          targets,
          threshold: th,
          playhead: store.getState().playhead,
        });
      };
      startPointerDrag(
        e,
        { scroller: scrollerRef.current, leftInset: GUTTER, threshold: 0 },
        {
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
        },
      );
    },
    [store, commit, threshold],
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
      const max = Math.max(0, clipDur(clip) - other);
      const compute = (dx: number) => {
        let v = clamp(startValue + (side === "in" ? dx : -dx) / z, 0, max);
        if (v < 0.04) v = 0;
        return round(v, 2);
      };
      startPointerDrag(
        e,
        { scroller: scrollerRef.current, leftInset: GUTTER, threshold: 0 },
        {
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
        },
      );
    },
    [store, commit],
  );

  const onVolumeDown = useCallback(
    (e: ReactPointerEvent, clipId: string) => {
      if (e.button !== 0) return;
      store.select({ kind: "clip", id: clipId });
      const clip = live.current.placed.find((c) => c.id === clipId);
      if (!clip) return;
      const compute = (dy: number) => {
        let v = clamp(clip.volume - (dy / WAVE_H) * MAX_UI_VOLUME, 0, MAX_UI_VOLUME);
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
    [store, commit],
  );

  // ---- overlay gestures ----
  const onOverlayDown = useCallback(
    (e: ReactPointerEvent, id: string) => {
      if (e.button !== 0) return;
      store.select({ kind: "overlay", id });
      const { project: proj } = live.current;
      const ov = proj.timeline.overlays.find((o) => o.id === id);
      if (!ov) return;
      const compute = (dx: number) =>
        previewOverlayMove({
          start: ov.start,
          duration: ov.duration,
          deltaSec: dx / live.current.zoom,
          targets: snapTargets(proj, store.getState().playhead, { overlayId: id }),
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
              { overlayId: id, start: round(r.start) },
            );
          },
        },
      );
    },
    [store, commit, threshold],
  );

  const onOverlayEdgeDown = useCallback(
    (e: ReactPointerEvent, id: string, edge: "start" | "end") => {
      if (e.button !== 0) return;
      store.select({ kind: "overlay", id });
      const { project: proj } = live.current;
      const ov = proj.timeline.overlays.find((o) => o.id === id);
      if (!ov) return;
      const compute = (dx: number) => {
        const r = previewOverlayResize({
          start: ov.start,
          duration: ov.duration,
          deltaSec: dx / live.current.zoom,
          targets: snapTargets(proj, store.getState().playhead, { overlayId: id }),
          threshold: threshold(),
          edge,
        });
        return { ...r, duration: Math.min(120, Math.max(MIN_OVERLAY_DURATION, r.duration)) };
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
            const unchanged =
              Math.abs(r.start - ov.start) < 1e-4 && Math.abs(r.duration - ov.duration) < 1e-4;
            if (unchanged) return;
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
    [store, commit, threshold],
  );

  // ---- preset drop target ----
  useEffect(() => {
    const dropTime = (clientX: number, clientY: number): number | null => {
      const el = scrollerRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (clientX < r.left + GUTTER || clientX > r.right) return null;
      if (clientY < r.top + RULER_H || clientY > r.bottom) return null;
      let t = Math.max(0, timeAt(clientX));
      const th = threshold();
      if (th > 0)
        t = Math.max(
          0,
          snapValue(t, snapTargets(live.current.project, store.getState().playhead), th).time,
        );
      return t;
    };
    return store.registerDropTarget({
      hitTest: dropTime,
      drop: (preset, time) => {
        void actions.addPreset(preset, time);
      },
    });
  }, [store, timeAt, threshold, actions]);

  // ---- background click ----
  const onBackgroundDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target === e.currentTarget || target.classList.contains("dx-lane")) store.select(null);
  };

  // ---- render ----
  const dragClipId =
    drag &&
    (drag.type === "reorder" ||
      drag.type === "trim" ||
      drag.type === "fade" ||
      drag.type === "volume")
      ? drag.clipId
      : null;
  const reorder = drag?.type === "reorder" ? drag : null;
  const snapLineTime =
    drag?.type === "trim"
      ? drag.preview.snappedTo
      : drag?.type === "overlay"
        ? drag.snappedTo
        : null;

  const assetInfo = (c: PlacedClip): { asset: Asset | undefined; name: string } => {
    const asset = project.assets[c.assetId];
    return { asset, name: asset ? baseName(asset.path) : "Missing media" };
  };

  const empty = displayClips.length === 0;

  return (
    <div
      className={`dx-timeline${className ? ` ${className}` : ""}`}
      data-testid="timeline"
      style={
        {
          "--dx-gutter": `${GUTTER}px`,
          "--dx-ruler-h": `${RULER_H}px`,
          "--dx-lane-h": `${LANE_H}px`,
          "--dx-video-h": `${VIDEO_H}px`,
        } as CSSProperties
      }
    >
      <div
        ref={scrollerRef}
        className="dx-tl-scroll"
        data-testid="timeline-scroll"
        onScroll={updateWindow}
      >
        <div
          className="dx-tl-content"
          role="listbox"
          aria-label="Timeline"
          aria-orientation="horizontal"
          style={{ width: contentW, height: contentHeight }}
          onPointerDown={onBackgroundDown}
        >
          <div className="dx-corner" />
          <div className="dx-ruler-wrap" onPointerDown={onRulerDown} data-testid="ruler-hit">
            <Ruler zoom={zoom} fps={fps} fromPx={win.from} toPx={win.to} width={contentW} />
          </div>

          {Array.from({ length: rowCount }, (_, i) => rowCount - 1 - i).map((row) => (
            <div key={row} className="dx-lane dx-lane-overlay" style={{ height: LANE_H }}>
              <div className="dx-lane-label">T{row + 1}</div>
            </div>
          ))}
          <div className="dx-lane dx-lane-video" style={{ height: VIDEO_H }}>
            <div className="dx-lane-label">V1</div>
            {empty ? <div className="dx-lane-hint">Import a video to start</div> : null}
          </div>

          {project.timeline.overlays.map((o) => {
            const live2 = drag?.type === "overlay" && drag.id === o.id ? drag : null;
            const hold = optimistic?.overlays?.[o.id];
            const start = live2?.start ?? hold?.start ?? o.start;
            const duration = live2?.duration ?? hold?.duration ?? o.duration;
            const left = start * zoom;
            if (left + duration * zoom < win.from || left > win.to) {
              if (!live2) return null;
            }
            return (
              <OverlayBlock
                key={o.id}
                id={o.id}
                text={o.text}
                category={presetCategory.get(o.preset) ?? CATEGORY_FALLBACK}
                animation={o.animation}
                start={start}
                duration={duration}
                zoom={zoom}
                row={overlayRows.rows.get(o.id) ?? o.lane}
                rowCount={rowCount}
                lanesTop={lanesTop}
                selected={selection?.kind === "overlay" && selection.id === o.id}
                dragging={Boolean(live2)}
                onBodyDown={onOverlayDown}
                onEdgeDown={onOverlayEdgeDown}
              />
            );
          })}

          {ghost && ghost.hoverTime !== null ? (
            <div
              className={`dx-ovl dx-ovl--${ghost.preset.category} dx-ovl-ghost`}
              data-testid="drop-ghost"
              style={{
                left: GUTTER + ghost.hoverTime * zoom,
                width: Math.max(8, ghost.preset.defaultDuration * zoom),
                top:
                  lanesTop + (rowCount - 1 - (overlayRows.rows.get("__ghost") ?? 0)) * LANE_H + 3,
                height: LANE_H - 6,
              }}
            >
              <span className="dx-ovl-label">{ghost.preset.label}</span>
            </div>
          ) : null}

          {reorder ? (
            <div
              className="dx-slot"
              style={{
                left: GUTTER + reorder.slotStart * zoom,
                width: Math.max(
                  2,
                  clipDur(displayClips.find((c) => c.id === reorder.clipId) ?? { in: 0, out: 0 }) *
                    zoom,
                ),
                top: videoTop + CLIP_PAD,
                height: VIDEO_H - 2 * CLIP_PAD,
              }}
            />
          ) : null}

          {displayClips.map((c) => {
            const { asset, name } = assetInfo(c);
            const isDragged = dragClipId === c.id && drag?.type === "reorder";
            const start = reorder && !isDragged ? (reorder.starts.get(c.id) ?? c.start) : c.start;
            const leftPx = start * zoom;
            const widthPx = clipDur(c) * zoom;
            if (!isDragged && (leftPx + widthPx < win.from || leftPx > win.to)) return null;
            return (
              <ClipBlock
                key={c.id}
                id={c.id}
                name={name}
                start={start}
                in={c.in}
                out={c.out}
                volume={c.volume}
                fadeIn={c.fadeIn}
                fadeOut={c.fadeOut}
                assetDuration={asset?.duration ?? c.out}
                aspect={asset?.width && asset.height ? asset.width / asset.height : aspect}
                spriteUrl={
                  asset ? mediaUrl(api.serverUrl, api.token, c.assetId, "filmstrip.jpg") : null
                }
                thumbUrl={asset ? mediaUrl(api.serverUrl, api.token, c.assetId, "thumb.jpg") : null}
                waveformUrl={
                  asset ? mediaUrl(api.serverUrl, api.token, c.assetId, "waveform.json") : null
                }
                hasAudio={asset?.hasAudio ?? false}
                zoom={zoom}
                top={videoTop}
                windowFrom={win.from}
                windowTo={win.to}
                selected={selection?.kind === "clip" && selection.id === c.id}
                dragging={isDragged}
                animate={Boolean(reorder)}
                dragPx={isDragged && reorder ? reorder.dxPx : 0}
                onBodyDown={onClipDown}
                onEdgeDown={onTrimDown}
                onFadeDown={onFadeDown}
                onVolumeDown={onVolumeDown}
              />
            );
          })}

          {snapLineTime !== null ? (
            <div
              className="dx-snap-line"
              data-testid="snap-line"
              style={{ left: GUTTER + snapLineTime * zoom }}
            />
          ) : null}

          <Playhead zoom={zoom} />
        </div>
      </div>

      {error ? (
        <div className="dx-toast" role="alert" data-testid="editor-error">
          <span>{error}</span>
          <button type="button" aria-label="Dismiss" onClick={() => store.setError(null)}>
            x
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Re-pack clips back to back from zero (the gapless main track). */
function relayout(clips: readonly PlacedClip[]): PlacedClip[] {
  let t = 0;
  return clips.map((c) => {
    const next = { ...c, start: t };
    t += clipDur(c);
    return next;
  });
}

/** Snap targets for trimming: the playhead and overlay edges (clip edges move with the ripple, so they are excluded). */
function trimTargets(
  project: ReturnType<typeof useEditorApi>["state"]["project"],
  playhead: number,
): number[] {
  const t = [playhead];
  for (const o of project.timeline.overlays) t.push(o.start, o.start + o.duration);
  return t;
}
