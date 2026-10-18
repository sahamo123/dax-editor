// Small time utilities: clamping, frame rounding and timecode text. Times are seconds unless a name says otherwise.

/** Clamp `v` into [lo, hi]. If `hi < lo`, `lo` wins. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Round to a number of decimal places (used before sending times to commands so JSON stays tidy). */
export function round(v: number, places = 3): number {
  const f = 10 ** places;
  return Math.round(v * f) / f;
}

/** Snap a time to the nearest frame boundary of a `fps` timeline. */
export function snapToFrame(seconds: number, fps: number): number {
  return Math.round(seconds * fps) / fps;
}

/**
 * Format a time as `mm:ss:ff` (or `h:mm:ss:ff` from one hour on), where `ff` is the frame within the second.
 * Negative input is shown as zero.
 */
export function formatTimecode(seconds: number, fps: number): string {
  const safe = Math.max(0, seconds);
  const f = Math.max(1, Math.round(fps));
  const totalFrames = Math.floor(safe * f + 1e-6);
  const frames = totalFrames % f;
  const totalSeconds = Math.floor(totalFrames / f);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const core = `${pad(m)}:${pad(s)}:${pad(frames)}`;
  return h > 0 ? `${h}:${core}` : core;
}

/** Format a duration compactly for labels, e.g. `4.2s`, `1:05`. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, seconds);
  if (s < 60) return `${Number(s.toFixed(s < 10 ? 2 : 1))}s`;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}
