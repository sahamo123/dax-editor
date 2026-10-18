// Pointer-drag helper for timeline interactions. Uses pointer capture plus window listeners so a drag keeps working
// even if React re-renders (or virtualises away) the element that started it, scrolls the track when the pointer
// nears an edge, and supports Escape to cancel. Not React; the caller owns all state.

import type { PointerEvent as ReactPointerEvent } from "react";

/** Pointer movement since the drag started, in pixels, including any scrolling done while dragging. */
export interface DragInfo {
  dx: number;
  dy: number;
  clientX: number;
  clientY: number;
}

/** How a drag ended: dropped, cancelled with Escape/pointer loss, or released without moving past the threshold. */
export type DragOutcome = "commit" | "cancel" | "click";

/** Callbacks for {@link startPointerDrag}. */
export interface DragHandlers {
  /** Called once, when the pointer first moves past the threshold. */
  onDragStart?(): void;
  /** Called on every move after the threshold (and while auto-scrolling). */
  onMove(info: DragInfo): void;
  /** Called exactly once at the end. */
  onEnd(info: DragInfo, outcome: DragOutcome): void;
}

/** Options for {@link startPointerDrag}. */
export interface DragOptions {
  /** Scroll container that should auto-scroll horizontally when the pointer is near its edge. */
  scroller?: HTMLElement | null;
  /** Width of a sticky column on the scroller's left that should not count as visible track area. */
  leftInset?: number;
  /** Pixels of movement before the drag begins; 0 starts immediately. Defaults to 4. */
  threshold?: number;
}

const EDGE_ZONE = 36;
const MAX_SCROLL_SPEED = 22;

/**
 * Start tracking a drag from a `pointerdown` event. Ends on pointer up, pointer cancel or Escape. Movement is
 * measured in content coordinates, so auto-scrolling makes `dx` keep growing while the pointer rests at the edge.
 */
export function startPointerDrag(
  e: ReactPointerEvent,
  options: DragOptions,
  handlers: DragHandlers,
): void {
  const { scroller } = options;
  const threshold = options.threshold ?? 4;
  const startX = e.clientX;
  const startY = e.clientY;
  const startScroll = scroller?.scrollLeft ?? 0;
  const pointerId = e.pointerId;
  let dragging = threshold === 0;
  let last: DragInfo = { dx: 0, dy: 0, clientX: startX, clientY: startY };
  let raf = 0;
  let done = false;

  try {
    (e.currentTarget as Element | null)?.setPointerCapture?.(pointerId);
  } catch {
    // Capture can fail if the pointer is already gone; window listeners still work.
  }
  if (dragging) handlers.onDragStart?.();

  const measure = (clientX: number, clientY: number): DragInfo => ({
    dx: clientX - startX + ((scroller?.scrollLeft ?? 0) - startScroll),
    dy: clientY - startY,
    clientX,
    clientY,
  });

  const autoScroll = () => {
    raf = 0;
    if (!scroller || done || !dragging) return;
    const rect = scroller.getBoundingClientRect();
    const left = rect.left + (options.leftInset ?? 0);
    let speed = 0;
    if (last.clientX < left + EDGE_ZONE) {
      speed = -Math.min(1, (left + EDGE_ZONE - last.clientX) / EDGE_ZONE) * MAX_SCROLL_SPEED;
    } else if (last.clientX > rect.right - EDGE_ZONE) {
      speed = Math.min(1, (last.clientX - (rect.right - EDGE_ZONE)) / EDGE_ZONE) * MAX_SCROLL_SPEED;
    }
    if (speed !== 0) {
      const before = scroller.scrollLeft;
      scroller.scrollLeft = before + speed;
      if (scroller.scrollLeft !== before) {
        last = measure(last.clientX, last.clientY);
        handlers.onMove(last);
      }
      raf = requestAnimationFrame(autoScroll);
    }
  };

  const finish = (outcome: DragOutcome) => {
    if (done) return;
    done = true;
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("keydown", onKey, true);
    handlers.onEnd(last, dragging ? outcome : outcome === "commit" ? "click" : outcome);
  };

  function onMove(ev: PointerEvent) {
    if (ev.pointerId !== pointerId || done) return;
    last = measure(ev.clientX, ev.clientY);
    if (!dragging) {
      if (Math.hypot(last.dx, last.dy) < threshold) return;
      dragging = true;
      handlers.onDragStart?.();
    }
    handlers.onMove(last);
    if (scroller && !raf) raf = requestAnimationFrame(autoScroll);
  }
  function onUp(ev: PointerEvent) {
    if (ev.pointerId !== pointerId) return;
    last = measure(ev.clientX, ev.clientY);
    finish("commit");
  }
  function onCancel(ev: PointerEvent) {
    if (ev.pointerId === pointerId) finish("cancel");
  }
  function onKey(ev: KeyboardEvent) {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      finish("cancel");
    }
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  window.addEventListener("keydown", onKey, true);
}
