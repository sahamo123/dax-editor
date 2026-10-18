// The timeline's scrolling viewport: which part of the track is visible (so only nearby blocks are rendered),
// zooming around the pointer or playhead, following the playhead during playback, and the pixel/time conversion.

import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { zoomAround } from "../lib/geometry";
import type { EditorStore } from "../store";
import { GUTTER, WINDOW_MARGIN, WINDOW_QUANTUM } from "./constants";

/** The visible window in pixels from the time origin, quantised so scrolling rarely changes it. */
export interface ViewWindow {
  from: number;
  to: number;
}

/** What {@link useTimelineView} returns. */
export interface TimelineView {
  /** Width in pixels of the scroll container (a sensible default before layout). */
  viewW: number;
  win: ViewWindow;
  /** Call from the container's `onScroll`. */
  updateWindow(): void;
  /** Timeline time under a viewport x coordinate. */
  timeAt(clientX: number): number;
}

/**
 * Manage the scroll container. `zoomRef` must always hold the current zoom (pixels per second).
 * Also registers the viewport on the store so the toolbar can "fit to window".
 */
export function useTimelineView(
  scrollerRef: RefObject<HTMLDivElement>,
  store: EditorStore,
  zoom: number,
  zoomRef: { current: number },
): TimelineView {
  const [viewW, setViewW] = useState(0);
  const [win, setWin] = useState<ViewWindow>({ from: 0, to: 1600 });
  const pendingScroll = useRef<number | null>(null);
  const prevZoom = useRef(zoom);

  const updateWindow = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const w = el.clientWidth || 1200;
    setViewW((prev) => (prev === w ? prev : w));
    const from = Math.floor((el.scrollLeft - WINDOW_MARGIN) / WINDOW_QUANTUM) * WINDOW_QUANTUM;
    const to = Math.ceil((el.scrollLeft + w + WINDOW_MARGIN) / WINDOW_QUANTUM) * WINDOW_QUANTUM;
    setWin((prev) => (prev.from === from && prev.to === to ? prev : { from, to }));
  }, [scrollerRef]);

  useLayoutEffect(() => {
    updateWindow();
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(updateWindow);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollerRef, updateWindow]);

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
  }, [zoom, scrollerRef, store, updateWindow]);

  // Expose the viewport to the toolbar, and scroll to keep the playhead visible when it moves out of view.
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
      const x = s.playhead * zoomRef.current;
      const visibleRight = el.scrollLeft + el.clientWidth - GUTTER;
      if (x > visibleRight - 24 || x < el.scrollLeft) {
        el.scrollLeft = Math.max(0, x - 0.15 * (el.clientWidth - GUTTER));
      }
    });
    return () => {
      off();
      store.viewport = null;
    };
  }, [store, scrollerRef, zoomRef]);

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
          zoom: zoomRef.current,
          factor,
          scrollLeft: el.scrollLeft,
          anchorViewportX: Math.max(0, e.clientX - rect.left - GUTTER),
        });
        if (r.zoom === zoomRef.current) return;
        pendingScroll.current = r.scrollLeft;
        store.setZoom(r.zoom);
        return;
      }
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY) && el.scrollHeight <= el.clientHeight + 1) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    // Not passive: wheel zoom must be able to cancel the browser's own page zoom / scroll.
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [scrollerRef, store, zoomRef]);

  const timeAt = useCallback(
    (clientX: number): number => {
      const el = scrollerRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      return (clientX - rect.left + el.scrollLeft - GUTTER) / zoomRef.current;
    },
    [scrollerRef, zoomRef],
  );

  return { viewW, win, updateWindow, timeAt };
}
