// One text overlay on an overlay lane: a coloured bar with the overlay's text, a body that drags to move it, and
// resize handles at both ends. Like ClipBlock it is presentational; the Timeline owns the drag logic.

import { memo, type PointerEvent as ReactPointerEvent } from "react";
import { GUTTER, LANE_H } from "./constants";

/** What an overlay block shows. */
export interface OverlayBlockProps {
  id: string;
  text: string;
  /** Category used for the colour: title, lower-third, caption, callout, or custom. */
  category: string;
  animation: string;
  start: number;
  duration: number;
  zoom: number;
  /** Display row, 0 = the row nearest the video. */
  row: number;
  /** Total rows, to compute the vertical position. */
  rowCount: number;
  /** Top offset of the first overlay lane within the timeline content. */
  lanesTop: number;
  selected: boolean;
  dragging: boolean;
  onBodyDown(e: ReactPointerEvent, id: string): void;
  onEdgeDown(e: ReactPointerEvent, id: string, edge: "start" | "end"): void;
}

/** An overlay block. */
export const OverlayBlock = memo(function OverlayBlock(p: OverlayBlockProps) {
  const width = Math.max(6, p.duration * p.zoom);
  const top = p.lanesTop + (p.rowCount - 1 - p.row) * LANE_H + 3;
  const cls = [
    "dx-ovl",
    `dx-ovl--${p.category}`,
    p.selected ? "is-selected" : "",
    p.dragging ? "is-dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={cls}
      role="option"
      aria-selected={p.selected}
      aria-label={`Text overlay "${p.text}"`}
      tabIndex={0}
      data-testid="overlay"
      data-overlay-id={p.id}
      data-start={p.start.toFixed(3)}
      data-duration={p.duration.toFixed(3)}
      style={{
        left: GUTTER + p.start * p.zoom,
        width,
        top,
        height: LANE_H - 6,
        zIndex: p.dragging ? 20 : p.selected ? 4 : 3,
      }}
      onPointerDown={(e) => p.onBodyDown(e, p.id)}
    >
      <span className="dx-ovl-label">
        <span className="dx-ovl-glyph" aria-hidden="true">
          T
        </span>
        {p.text}
      </span>
      <div
        className="dx-trim dx-trim-ovl dx-trim-start"
        data-testid="overlay-trim-start"
        title="Drag to change the start"
        onPointerDown={(e) => {
          e.stopPropagation();
          p.onEdgeDown(e, p.id, "start");
        }}
      />
      <div
        className="dx-trim dx-trim-ovl dx-trim-end"
        data-testid="overlay-trim-end"
        title="Drag to change the length"
        onPointerDown={(e) => {
          e.stopPropagation();
          p.onEdgeDown(e, p.id, "end");
        }}
      />
    </div>
  );
});
