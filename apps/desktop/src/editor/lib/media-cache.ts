// Cached loading of per-asset timeline media: waveform peaks and filmstrip sprite sizes.
// The server's formats are not fixed by @dax/protocol, so loaders are tolerant (see parseWaveform) and failures
// degrade to "no picture" rather than errors.

import { useEffect, useState } from "react";

/** Normalised audio peaks (each 0 to 1) spread evenly over the whole source file. */
export type Peaks = readonly number[];

/**
 * Read waveform JSON in any of the shapes a server might reasonably produce: a bare array of numbers, or an object
 * with `peaks` / `data` / `samples`. Values are folded to absolute magnitude and scaled so the largest is 1.
 * Returns null if nothing usable is found.
 */
export function parseWaveform(json: unknown): Peaks | null {
  let arr: unknown = json;
  if (arr && typeof arr === "object" && !Array.isArray(arr)) {
    const o = arr as Record<string, unknown>;
    arr = o.peaks ?? o.data ?? o.samples ?? null;
  }
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const nums = arr.map((v) => (typeof v === "number" && Number.isFinite(v) ? Math.abs(v) : 0));
  let max = 0;
  for (const v of nums) if (v > max) max = v;
  // Always normalise: a quiet recording should still draw a readable shape.
  return max === 0 ? nums : nums.map((v) => v / max);
}

/** Highest peak in the half-open source-time range [from, to) of an asset that lasts `assetDuration` seconds. */
export function peakInRange(peaks: Peaks, assetDuration: number, from: number, to: number): number {
  if (peaks.length === 0 || assetDuration <= 0) return 0;
  const n = peaks.length;
  const a = Math.max(0, Math.min(n - 1, Math.floor((from / assetDuration) * n)));
  const b = Math.max(a, Math.min(n - 1, Math.ceil((to / assetDuration) * n) - 1));
  let max = 0;
  for (let i = a; i <= b; i++) {
    const v = peaks[i];
    if (v !== undefined && v > max) max = v;
  }
  return max;
}

type Loadable<T> = { status: "loading" } | { status: "ready"; value: T } | { status: "error" };

const waveformCache = new Map<string, Loadable<Peaks>>();
const waveformListeners = new Map<string, Set<() => void>>();

function notify(map: Map<string, Set<() => void>>, key: string): void {
  for (const l of map.get(key) ?? []) l();
}

function subscribe(map: Map<string, Set<() => void>>, key: string, fn: () => void): () => void {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(fn);
  return () => set.delete(fn);
}

/** Start loading a waveform (once per URL). Safe to call repeatedly. */
export function loadWaveform(url: string): void {
  if (waveformCache.has(url)) return;
  waveformCache.set(url, { status: "loading" });
  fetch(url)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((json) => {
      const peaks = parseWaveform(json);
      waveformCache.set(url, peaks ? { status: "ready", value: peaks } : { status: "error" });
    })
    .catch(() => waveformCache.set(url, { status: "error" }))
    .finally(() => notify(waveformListeners, url));
}

/** React hook: the peaks at `url`, or null while loading / when unavailable. Loads each URL once. */
export function useWaveform(url: string | null): Peaks | null {
  const [, force] = useState(0);
  useEffect(() => {
    if (!url) return;
    const off = subscribe(waveformListeners, url, () => force((n) => n + 1));
    loadWaveform(url);
    force((n) => n + 1);
    return off;
  }, [url]);
  const entry = url ? waveformCache.get(url) : undefined;
  return entry?.status === "ready" ? entry.value : null;
}

/** Natural pixel size of a loaded image. */
export interface ImageSize {
  width: number;
  height: number;
}

const imageCache = new Map<string, Loadable<ImageSize>>();
const imageListeners = new Map<string, Set<() => void>>();

/** Start loading an image to learn its size (once per URL). The browser cache then serves it to CSS backgrounds. */
export function loadImageSize(url: string): void {
  if (imageCache.has(url)) return;
  imageCache.set(url, { status: "loading" });
  const img = new Image();
  img.onload = () => {
    imageCache.set(url, {
      status: "ready",
      value: { width: img.naturalWidth, height: img.naturalHeight },
    });
    notify(imageListeners, url);
  };
  img.onerror = () => {
    imageCache.set(url, { status: "error" });
    notify(imageListeners, url);
  };
  img.src = url;
}

/** Loading state of an image's size: `undefined` while loading, `null` if it failed. */
export function useImageSize(url: string | null): ImageSize | null | undefined {
  const [, force] = useState(0);
  useEffect(() => {
    if (!url) return;
    const off = subscribe(imageListeners, url, () => force((n) => n + 1));
    loadImageSize(url);
    force((n) => n + 1);
    return off;
  }, [url]);
  if (!url) return null;
  const entry = imageCache.get(url);
  if (!entry || entry.status === "loading") return undefined;
  return entry.status === "ready" ? entry.value : null;
}

/** Forget cached media (used by tests and when the server restarts with new files). */
export function clearMediaCache(): void {
  waveformCache.clear();
  imageCache.clear();
}

/**
 * How a filmstrip sprite is cut into frames. The server draws a single row of equally spaced frames covering the
 * whole asset; the count is inferred from the image size and the frame aspect ratio, so no extra metadata is needed.
 */
export function filmstripFrames(sprite: ImageSize, aspect: number): number {
  if (sprite.height <= 0 || aspect <= 0) return 1;
  return Math.max(1, Math.round(sprite.width / (sprite.height * aspect)));
}
