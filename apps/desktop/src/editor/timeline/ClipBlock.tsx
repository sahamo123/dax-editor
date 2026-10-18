// One clip on the main video lane: filmstrip, waveform, name label, fade ramps and handles (trim at both ends,
// fade at the top corners, a volume line across the waveform). It only reports pointer-downs; the Timeline owns the
// drag logic and passes in the already-previewed geometry, so this component stays presentational and memoisable.

import { memo, type PointerEvent as ReactPointerEvent } from "react";
import { clipDur } from "../lib/project";
import { formatDuration } from "../lib/time";
import { CLIP_PAD, GUTTER, MAX_UI_VOLUME, THUMB_H, VIDEO_H, WAVE_H } from "./constants";
import { Filmstrip } from "./Filmstrip";
import { Waveform } from "./Waveform";

/** What a clip block shows. All times are seconds; `top` is the block's offset in the timeline content. */
export interface ClipBlockProps {
  id: string;
  name: string;
  /** Timeline start of the block as drawn (may differ from the saved value during a drag). */
  start: number;
  in: number;
  out: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  assetDuration: number;
  spriteUrl: string | null;
  thumbUrl: string | null;
  waveformUrl: string | null;
  hasAudio: boolean;
  zoom: number;
  top: number;
  /** Visible window in pixels from the time origin; blocks crop their media to it. */
  windowFrom: number;
  windowTo: number;
  selected: boolean;
  dragging: boolean;
  /** Animate position changes (used while neighbours slide aside during a reorder). */
  animate: boolean;
  /** Pixel offset applied while the block is being dragged freely. */
  dragPx: number;
  onBodyDown(e: ReactPointerEvent, id: string): void;
  /** Keyboard selection (Enter on a focused block). */
  onSelect(id: string): void;
  onEdgeDown(e: ReactPointerEvent, id: string, edge: "start" | "end"): void;
  onFadeDown(e: ReactPointerEvent, id: string, side: "in" | "out"): void;
  onVolumeDown(e: ReactPointerEvent, id: string): void;
}

/** A clip block. */
export const ClipBlock = memo(function ClipBlock(p: ClipBlockProps) {
  const dur = clipDur(p);
  const width = Math.max(2, dur * p.zoom);
  const left = GUTTER + p.start * p.zoom + p.dragPx;
  const clipLeftPx = p.start * p.zoom + p.dragPx;
  const fromPx = Math.max(0, p.windowFrom - clipLeftPx);
  const toPx = Math.min(width, p.windowTo - clipLeftPx);
  const fadeInPx = Math.min(width, p.fadeIn * p.zoom);
  const fadeOutPx = Math.min(width, p.fadeOut * p.zoom);
  const roomy = width > 56;
  const volumeFrac = 1 - Math.min(MAX_UI_VOLUME, p.volume) / MAX_UI_VOLUME;

  const cls = [
    "dx-clip",
    p.selected ? "is-selected" : "",
    p.dragging ? "is-dragging" : "",
    p.animate && !p.dragging ? "is-animated" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      role="option"
      aria-selected={p.selected}
      aria-label={`Clip ${p.name}, ${formatDuration(dur)}`}
      tabIndex={0}
      data-testid="clip"
      data-clip-id={p.id}
      data-start={p.start.toFixed(3)}
      data-duration={dur.toFixed(3)}
      style={{
        left,
        width,
        top: p.top + CLIP_PAD,
        height: VIDEO_H - 2 * CLIP_PAD,
        zIndex: p.dragging ? 20 : p.selected ? 3 : 2,
      }}
      onPointerDown={(e) => p.onBodyDown(e, p.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") p.onSelect(p.id);
      }}
    >
      <div className="dx-clip-media" style={{ height: THUMB_H }}>
        {toPx > fromPx ? (
          <Filmstrip
            spriteUrl={p.spriteUrl}
            thumbUrl={p.thumbUrl}
            assetDuration={p.assetDuration}
            sourceIn={p.in}
            zoom={p.zoom}
            fromPx={fromPx}
            toPx={toPx}
          />
        ) : null}
      </div>
      <div className="dx-clip-audio" style={{ height: WAVE_H }}>
        {p.hasAudio && toPx > fromPx ? (
          <Waveform
            url={p.waveformUrl}
            assetDuration={p.assetDuration}
            sourceIn={p.in}
            zoom={p.zoom}
            volume={Math.min(p.volume, MAX_UI_VOLUME)}
            fromPx={fromPx}
            toPx={toPx}
            height={WAVE_H}
          />
        ) : null}
        {p.hasAudio && roomy ? (
          <div
            className="dx-volume"
            style={{ top: `${volumeFrac * 100}%` }}
            data-testid="volume-line"
            title={`Volume ${Math.round(p.volume * 100)}% (drag up or down)`}
            onPointerDown={(e) => {
              e.stopPropagation();
              p.onVolumeDown(e, p.id);
            }}
          >
            <span className="dx-volume-label">{Math.round(p.volume * 100)}%</span>
          </div>
        ) : null}
      </div>

      {fadeInPx > 0 ? (
        <div className="dx-fade dx-fade-in" style={{ width: fadeInPx, height: THUMB_H }} />
      ) : null}
      {fadeOutPx > 0 ? (
        <div className="dx-fade dx-fade-out" style={{ width: fadeOutPx, height: THUMB_H }} />
      ) : null}

      {roomy ? (
        <div className="dx-clip-label">
          <span className="dx-clip-name">{p.name}</span>
          <span className="dx-clip-dur">{formatDuration(dur)}</span>
        </div>
      ) : null}

      {roomy ? (
        <>
          <div
            className="dx-fade-handle dx-fade-handle-in"
            data-testid="fade-in-handle"
            title={`Fade in ${Number(p.fadeIn.toFixed(2))}s (drag)`}
            style={{ left: Math.min(Math.max(fadeInPx, 0), width - 14) }}
            onPointerDown={(e) => {
              e.stopPropagation();
              p.onFadeDown(e, p.id, "in");
            }}
          />
          <div
            className="dx-fade-handle dx-fade-handle-out"
            data-testid="fade-out-handle"
            title={`Fade out ${Number(p.fadeOut.toFixed(2))}s (drag)`}
            style={{ right: Math.min(Math.max(fadeOutPx, 0), width - 14) }}
            onPointerDown={(e) => {
              e.stopPropagation();
              p.onFadeDown(e, p.id, "out");
            }}
          />
        </>
      ) : null}

      <div
        className="dx-trim dx-trim-start"
        data-testid="trim-start"
        title="Drag to trim the start"
        onPointerDown={(e) => {
          e.stopPropagation();
          p.onEdgeDown(e, p.id, "start");
        }}
      />
      <div
        className="dx-trim dx-trim-end"
        data-testid="trim-end"
        title="Drag to trim the end"
        onPointerDown={(e) => {
          e.stopPropagation();
          p.onEdgeDown(e, p.id, "end");
        }}
      />
    </div>
  );
});
