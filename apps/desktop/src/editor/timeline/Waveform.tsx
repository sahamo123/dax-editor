// Audio waveform of a clip, drawn on a canvas that covers only the visible window of the block (so a one-hour clip
// does not need a one-hour-wide canvas). Bars come from the asset's peak array over the clip's source range.

import { memo, useEffect, useRef } from "react";
import { type Peaks, peakInRange, useWaveform } from "../lib/media-cache";

/** Props of {@link Waveform}. */
export interface WaveformProps {
  url: string | null;
  assetDuration: number;
  sourceIn: number;
  zoom: number;
  /** Linear clip volume; scales bar height so the drawing reflects the gain. */
  volume: number;
  /** Visible part of the block, in pixels from its left edge. */
  fromPx: number;
  toPx: number;
  height: number;
}

const BAR = 2;
const STEP = 3;

/** Draw the bars for a window of a clip. Exported for tests. */
function drawWaveform(
  ctx: CanvasRenderingContext2D,
  peaks: Peaks,
  o: Pick<WaveformProps, "assetDuration" | "sourceIn" | "zoom" | "volume" | "height"> & {
    fromPx: number;
    width: number;
    color: string;
  },
): void {
  ctx.clearRect(0, 0, o.width, o.height);
  ctx.fillStyle = o.color;
  const mid = o.height / 2;
  for (let x = 0; x < o.width; x += STEP) {
    const t0 = o.sourceIn + (o.fromPx + x) / o.zoom;
    const t1 = o.sourceIn + (o.fromPx + x + STEP) / o.zoom;
    const peak = peakInRange(peaks, o.assetDuration, t0, t1);
    const h = Math.max(1, Math.min(o.height - 2, peak * o.volume * (o.height - 4)));
    ctx.fillRect(x, mid - h / 2, BAR, h);
  }
}

/** Waveform canvas for the visible window of a clip block. */
export const Waveform = memo(function Waveform(p: WaveformProps) {
  const peaks = useWaveform(p.url);
  const ref = useRef<HTMLCanvasElement>(null);
  const width = Math.max(1, Math.round(p.toPx - p.fromPx));

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !peaks) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return; // jsdom has no canvas
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(p.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWaveform(ctx, peaks, {
      assetDuration: p.assetDuration,
      sourceIn: p.sourceIn,
      zoom: p.zoom,
      volume: p.volume,
      height: p.height,
      fromPx: p.fromPx,
      width,
      color: getComputedStyle(canvas).color,
    });
  }, [peaks, width, p.assetDuration, p.sourceIn, p.zoom, p.volume, p.height, p.fromPx]);

  if (!peaks) return <div className="dx-wave dx-wave-empty" aria-hidden="true" />;
  return (
    <canvas ref={ref} className="dx-wave" style={{ left: p.fromPx, width, height: p.height }} />
  );
});
