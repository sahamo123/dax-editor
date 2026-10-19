// The timeline: ruler, overlay lanes, the main video lane and the playhead. Layout and rendering live here; the
// gestures live in the use*Gestures hooks, which preview live using the pure functions in lib/ and send one command
// on release. The preview is held until the server state catches up. The timeline never changes project data itself.

import { mediaUrl } from "@dax/protocol";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useEditorApi,
  useEditorSelector,
  useEditorStore,
  useExec,
  useProjectRevision,
} from "../context";
import { type PlacedClip, placeClips } from "../lib/clip-layout";
import { assignRows } from "../lib/overlay-layout";
import { baseName, clipDur, contentExtent, mainClips } from "../lib/project";
import { SNAP_PX, snapTargets, snapValue } from "../lib/snap";
import { ClipBlock, type ClipBlockProps } from "./ClipBlock";
import { CLIP_PAD, GUTTER, LANE_H, RULER_H, TAIL_SECONDS, VIDEO_H } from "./constants";
import { displayClips } from "./display";
import { startPointerDrag } from "./drag-session";
import type { Drag, GestureEnv, LiveValues, Optimistic } from "./gesture-env";
import { OverlayBlock } from "./OverlayBlock";
import { Playhead } from "./Playhead";
import { Ruler } from "./Ruler";
import { useClipGestures } from "./useClipGestures";
import { useOverlayGestures } from "./useOverlayGestures";
import { useTimelineView } from "./useTimelineView";

const CATEGORY_FALLBACK = "custom";

/** Props of {@link Timeline}. */
export interface TimelineProps {
  className?: string;
}

/**
 * The editing timeline. Fill its parent (it uses 100% width and height; the parent must allow it to shrink, for
 * example `min-width: 0` on a grid or flex item). Scrolls horizontally with the wheel, zooms with Ctrl/Cmd + wheel
 * or pinch, and accepts presets dragged from the Presets panel.
 */
export function Timeline({ className }: TimelineProps) {
  const api = useEditorApi();
  const store = useEditorStore();
  const exec = useExec();
  const project = api.state.project;
  const zoom = useEditorSelector((s) => s.zoom);
  const selection = useEditorSelector((s) => s.selection);
  const snapping = useEditorSelector((s) => s.snapping);
  const error = useEditorSelector((s) => s.error);
  const presetDrag = useEditorSelector((s) => s.presetDrag);
  const revision = useProjectRevision();

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [optimistic, setOptimistic] = useState<Optimistic | null>(null);

  const placed = useMemo(() => placeClips(mainClips(project)), [project]);
  const fps = project.timeline.fps;

  // Handlers read the latest values through a ref so they can be stable (keeps memoised blocks from re-rendering).
  const live = useRef<LiveValues>({ project, placed, zoom, snapping, revision, fps });
  live.current = { project, placed, zoom, snapping, revision, fps };
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const view = useTimelineView(scrollerRef, store, zoom, zoomRef);
  const { win, viewW, timeAt } = view;

  // ---- optimistic hold: keep a dropped edit on screen until the server state shows it ----
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

  const commit = useCallback<GestureEnv["commit"]>(
    async (hold, name, args) => {
      if (hold) setOptimistic({ ...hold, revision: live.current.revision });
      const res = await exec(name, args);
      if (!res.ok) setOptimistic(null);
      return res;
    },
    [exec],
  );
  const threshold = useCallback(
    () => (live.current.snapping ? SNAP_PX / live.current.zoom : 0),
    [],
  );

  const env: GestureEnv = { store, live, scrollerRef, setDrag, commit, threshold, timeAt };
  const clipGestures = useClipGestures(env);
  const overlayGestures = useOverlayGestures(env);

  const selectClip = useCallback((id: string) => store.select({ kind: "clip", id }), [store]);
  const selectOverlay = useCallback((id: string) => store.select({ kind: "overlay", id }), [store]);

  // ---- scrubbing: press or drag on the ruler ----
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

  const onBackgroundDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target === e.currentTarget || target.classList.contains("dx-lane")) store.select(null);
  };

  // ---- derived layout ----
  const presetCategory = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of api.state.presets) m.set(p.id, p.category);
    return m;
  }, [api.state.presets]);

  const ghost = presetDrag && presetDrag.hoverTime !== null ? presetDrag : null;
  const overlayRows = useMemo(() => {
    const spans = project.timeline.overlays.map((o) => {
      const held = optimistic?.overlays?.[o.id];
      return {
        id: o.id,
        start: held?.start ?? o.start,
        duration: held?.duration ?? o.duration,
        lane: o.lane,
      };
    });
    // The drop preview takes part in row assignment so lanes open up before the drop.
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

  const clips = useMemo(() => displayClips(placed, optimistic, drag), [placed, optimistic, drag]);
  const trackW = Math.max(viewW - GUTTER, 600);
  const contentW = GUTTER + Math.max((contentExtent(project) + TAIL_SECONDS) * zoom, trackW);

  const reorder = drag?.type === "reorder" ? drag : null;
  const snapLineTime =
    drag?.type === "trim"
      ? drag.preview.snappedTo
      : drag?.type === "overlay"
        ? drag.snappedTo
        : null;

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
        onScroll={view.updateWindow}
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
            {clips.length === 0 ? (
              <div className="dx-lane-hint">Import a video to start</div>
            ) : null}
          </div>

          {project.timeline.overlays.map((o) => {
            const live2 = drag?.type === "overlay" && drag.id === o.id ? drag : null;
            const held = optimistic?.overlays?.[o.id];
            const start = live2?.start ?? held?.start ?? o.start;
            const duration = live2?.duration ?? held?.duration ?? o.duration;
            const left = start * zoom;
            const offscreen = left + duration * zoom < win.from || left > win.to;
            if (offscreen && !live2) return null;
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
                onBodyDown={overlayGestures.onOverlayDown}
                onSelect={selectOverlay}
                onEdgeDown={overlayGestures.onOverlayEdgeDown}
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
                  clipDur(clips.find((c) => c.id === reorder.clipId) ?? { in: 0, out: 0 }) * zoom,
                ),
                top: videoTop + CLIP_PAD,
                height: VIDEO_H - 2 * CLIP_PAD,
              }}
            />
          ) : null}

          {clips.map((c) => (
            <ClipItem
              key={c.id}
              clip={c}
              start={
                reorder && reorder.clipId !== c.id ? (reorder.starts.get(c.id) ?? c.start) : c.start
              }
              reorder={reorder}
              api={api}
              zoom={zoom}
              win={win}
              top={videoTop}
              selected={selection?.kind === "clip" && selection.id === c.id}
              handlers={{ ...clipGestures, onSelect: selectClip }}
            />
          ))}

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

/** One clip on the lane: resolves its asset and URLs, culls it when off screen, and wires the handlers. */
function ClipItem(props: {
  clip: PlacedClip;
  start: number;
  reorder: Extract<Drag, { type: "reorder" }> | null;
  api: ReturnType<typeof useEditorApi>;
  zoom: number;
  win: { from: number; to: number };
  top: number;
  selected: boolean;
  handlers: {
    onClipDown: ClipBlockProps["onBodyDown"];
    onTrimDown: ClipBlockProps["onEdgeDown"];
    onFadeDown: ClipBlockProps["onFadeDown"];
    onVolumeDown: ClipBlockProps["onVolumeDown"];
    onSelect: (id: string) => void;
  };
}) {
  const { clip: c, api, zoom, win, reorder } = props;
  const asset = api.state.project.assets[c.assetId];
  const isDragged = reorder?.clipId === c.id;
  const leftPx = props.start * zoom;
  const widthPx = clipDur(c) * zoom;
  if (!isDragged && (leftPx + widthPx < win.from || leftPx > win.to)) return null;
  const url = (kind: "filmstrip.jpg" | "thumb.jpg" | "waveform.json") =>
    asset ? mediaUrl(api.serverUrl, api.token, c.assetId, kind) : null;
  return (
    <ClipBlock
      id={c.id}
      name={asset ? baseName(asset.path) : "Missing media"}
      start={props.start}
      in={c.in}
      out={c.out}
      volume={c.volume}
      fadeIn={c.fadeIn}
      fadeOut={c.fadeOut}
      assetDuration={asset?.duration ?? c.out}
      spriteUrl={url("filmstrip.jpg")}
      thumbUrl={url("thumb.jpg")}
      waveformUrl={url("waveform.json")}
      hasAudio={asset?.hasAudio ?? false}
      zoom={zoom}
      top={props.top}
      windowFrom={win.from}
      windowTo={win.to}
      selected={props.selected}
      dragging={isDragged}
      animate={Boolean(reorder)}
      dragPx={isDragged && reorder ? reorder.dxPx : 0}
      onBodyDown={props.handlers.onClipDown}
      onSelect={props.handlers.onSelect}
      onEdgeDown={props.handlers.onTrimDown}
      onFadeDown={props.handlers.onFadeDown}
      onVolumeDown={props.handlers.onVolumeDown}
    />
  );
}
