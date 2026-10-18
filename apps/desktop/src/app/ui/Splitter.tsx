// A draggable, keyboard-operable divider between two panels (WAI-ARIA "window splitter"). It only reports a
// new size; the parent decides how to lay out. Also holds the hook that remembers sizes between launches.

import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  useCallback,
  useState,
} from "react";

/** Props of {@link Splitter}. */
export interface SplitterProps {
  /** `vertical` is a vertical bar that resizes widths; `horizontal` is a horizontal bar that resizes heights. */
  orientation: "vertical" | "horizontal";
  /** Current size in pixels of the panel being resized. */
  value: number;
  min: number;
  max: number;
  /** Receives the new size in pixels (already clamped). */
  onChange(size: number): void;
  /**
   * True if dragging towards the start of the axis (left/up) should GROW the panel, which is the case when the
   * panel sits after the bar (the right-hand drawer, the timeline below the preview).
   */
  grow?: "toward-start" | "toward-end";
  /** Accessible name, e.g. "Resize chat panel". */
  label: string;
}

/** The divider. Arrow keys resize by 16 px (64 with Shift); Home/End jump to the limits. */
export function Splitter({
  orientation,
  value,
  min,
  max,
  onChange,
  grow = "toward-end",
  label,
}: SplitterProps): ReactElement {
  const vertical = orientation === "vertical";
  const clamp = useCallback((n: number) => Math.min(max, Math.max(min, Math.round(n))), [min, max]);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startPos = vertical ? e.clientX : e.clientY;
    const startSize = value;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    setDragging(true);
    const sign = grow === "toward-end" ? 1 : -1;
    const move = (ev: globalThis.PointerEvent) => {
      const pos = vertical ? ev.clientX : ev.clientY;
      onChange(clamp(startSize + sign * (pos - startPos)));
    };
    const up = () => {
      setDragging(false);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16;
    const sign = grow === "toward-end" ? 1 : -1;
    const [more, less] = vertical ? ["ArrowRight", "ArrowLeft"] : ["ArrowDown", "ArrowUp"];
    if (e.key === more) onChange(clamp(value + sign * step));
    else if (e.key === less) onChange(clamp(value - sign * step));
    else if (e.key === "Home") onChange(min);
    else if (e.key === "End") onChange(max);
    else return;
    e.preventDefault();
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable, draggable splitter needs role=separator on a div; <hr> is not interactive
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      className={`splitter splitter--${orientation}${dragging ? " is-dragging" : ""}`}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}

/** A number that survives restarts (per-viewer layout preference). Falls back to `fallback` if storage fails. */
export function useStoredNumber(key: string, fallback: number): [number, (n: number) => void] {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      const n = raw === null ? Number.NaN : Number(raw);
      return Number.isFinite(n) ? n : fallback;
    } catch {
      return fallback;
    }
  });
  const set = useCallback(
    (n: number) => {
      setValue(n);
      try {
        window.localStorage.setItem(key, String(n));
      } catch {
        // Not fatal: the size just will not be remembered.
      }
    },
    [key],
  );
  return [value, set];
}
