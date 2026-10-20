// The media pipeline: per-asset 480p proxy, waveform peaks, filmstrip and on-demand thumbnails, cached under <data>/cache.
// Proxy work runs as background jobs (progress reported through the JobManager). Nothing is served from here; this module only
// produces files and says where they are. Source paths come from project files, which are untrusted, so each is re-checked.

import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { type Asset, type Project, withEncoderFallback } from "@dax/core";
import {
  FILMSTRIP_FRAME_HEIGHT,
  FILMSTRIP_FRAME_WIDTH,
  FILMSTRIP_FRAMES_HEADER,
  filmstripFrameCount,
  type MediaKind,
  waveformRate,
} from "@dax/protocol";
import { isAbortError, type ProcessRegistry, runFfmpegProcess } from "./ffmpeg-run.js";
import type { JobHandle, JobManager } from "./jobs.js";
import type { Logger } from "./logger.js";
import { resolveInsideRoots } from "./paths.js";

/** Height of the preview proxy. Sources shorter than this are not upscaled. */
const PROXY_HEIGHT = 480;
/** Proxy transcodes are heavy: at most this many run at once. */
const MAX_PROXY_JOBS = 2;
/** Thumbnails, waveforms and filmstrips are light but the UI can ask for dozens at once: cap the FFmpeg processes. */
const MAX_DERIVED_TASKS = 4;

/** Error with an HTTP status, thrown for requests the pipeline cannot satisfy. */
export class MediaError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** A file ready to be sent, plus how to describe it. */
export interface MediaFile {
  path: string;
  contentType: string;
  /** Extra response headers (for example `X-Dax-Frames` for filmstrips). */
  headers?: Record<string, string>;
  /** `Cache-Control` value suited to how stable the file is. */
  cacheControl: string;
}

/** Yields the path FFmpeg should read; resolved late so cached outputs never need the original file. */
type SourceFn = () => Promise<string>;

interface Entry {
  asset: Asset;
  dir: string;
  proxy: "queued" | "running" | "ready" | "failed";
  error?: string;
}

/** Number of frames in an asset's filmstrip (one per second, 4 to 120); defined in the protocol so clients agree. */
export const filmstripFrames = filmstripFrameCount;

export { waveformRate };

/** Reduce 16-bit mono PCM to peak levels: the largest absolute sample in each window, scaled to 0..1 and rounded to 3 decimals. */
export class PeakAccumulator {
  readonly peaks: number[] = [];
  private max = 0;
  private count = 0;
  private carry: Buffer | undefined;

  constructor(private readonly windowSamples: number) {}

  /** Feed raw little-endian s16 bytes; odd trailing bytes are carried to the next call. */
  push(chunk: Buffer): void {
    const buf = this.carry ? Buffer.concat([this.carry, chunk]) : chunk;
    const usable = buf.length - (buf.length % 2);
    this.carry = usable < buf.length ? buf.subarray(usable) : undefined;
    for (let i = 0; i < usable; i += 2) {
      const v = Math.abs(buf.readInt16LE(i));
      if (v > this.max) this.max = v;
      if (++this.count === this.windowSamples) this.flush();
    }
  }

  /** Emit the final partial window, if any. */
  finish(): number[] {
    if (this.count > 0) this.flush();
    return this.peaks;
  }

  private flush(): void {
    this.peaks.push(Math.round((this.max / 32768) * 1000) / 1000);
    this.max = 0;
    this.count = 0;
  }
}

/** Builds and caches derived media for the assets of the open project. */
export class MediaPipeline {
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<void>>();
  private readonly proxySlots = new Limiter(MAX_PROXY_JOBS);
  private readonly derivedSlots = new Limiter(MAX_DERIVED_TASKS);
  private readonly started = new Set<string>();
  /** Last setup failure reported per asset id, so retries that fail the same way do not add a job each time. */
  private readonly setupErrors = new Map<string, string>();
  private readonly abort = new AbortController();
  private readonly pending = new Set<Promise<unknown>>();

  constructor(
    private readonly cfg: {
      cacheDir: string;
      allowedRoots: readonly string[];
      jobs: JobManager;
      registry: ProcessRegistry;
      log: Logger;
      /** Called when a proxy finishes or fails so the server can push fresh state. */
      onChange: () => void;
    },
  ) {}

  /** Abort queued/running work and wait for worker exit and file cleanup; refuse all new work. */
  async shutdown(): Promise<void> {
    this.abort.abort();
    await Promise.allSettled([...this.pending]);
  }

  private track<T>(work: Promise<T>): Promise<T> {
    this.pending.add(work);
    const done = () => this.pending.delete(work);
    void work.then(done, done);
    return work;
  }

  /** Make sure every media asset of `project` has (or is getting) a proxy. Safe to call after every change; assets already known are skipped. */
  ensureAssets(project: Project): void {
    if (this.abort.signal.aborted) return;
    for (const asset of Object.values(project.assets)) {
      // `started` is filled synchronously: ensureAssets runs after every change and start() awaits.
      if (this.started.has(asset.id) || this.entries.has(asset.id) || asset.kind === "image")
        continue;
      this.started.add(asset.id);
      this.track(this.start(asset)).then(
        () => this.setupErrors.delete(asset.id),
        (err) => this.setupFailed(asset, err),
      );
    }
  }

  /** Record a setup failure: the attempt is forgotten so a later change retries it, and the user sees the failure once. */
  private setupFailed(asset: Asset, err: unknown): void {
    // Typically the source file is missing or outside the allowed folders. Show it to the user as a failed job.
    const msg = isAbortError(err) ? "Cancelled" : message(err);
    // Forget the attempt so the next change tries again: the file may be back (a drive remounted, a file restored).
    this.started.delete(asset.id);
    this.cfg.log.warn(`media setup failed for ${asset.id}: ${msg}`);
    // Every change retries, so report a failure once per distinct message rather than once per change.
    if (this.setupErrors.get(asset.id) !== msg) {
      this.setupErrors.set(asset.id, msg);
      this.cfg.jobs.create("proxy", `Preparing ${basename(asset.path)}`).fail(msg);
    }
  }

  // ---------- proxy job ----------

  private async start(asset: Asset): Promise<void> {
    const source = await this.checkSource(asset);
    const dir = join(this.cfg.cacheDir, cacheKey(source.path, source.size, source.mtimeMs));
    const entry: Entry = { asset, dir, proxy: "queued" };
    this.entries.set(asset.id, entry);

    if (existsSync(join(dir, "proxy.mp4")) || asset.kind !== "video") {
      // Cached from an earlier session (or nothing to transcode): no job needed.
      entry.proxy = "ready";
      return;
    }
    const job = this.cfg.jobs.create("proxy", `Preparing ${basename(asset.path)}`);
    try {
      await this.proxySlots.run(async () => {
        entry.proxy = "running";
        await mkdir(dir, { recursive: true });
        await this.makeProxy(entry, source.path, job);
      });
      entry.proxy = "ready";
      // Waveform and filmstrip are nice-to-have: their failure must not fail the job.
      const src = async () => source.path;
      await this.bestEffort(() => this.makeWaveform(entry, src), asset, "waveform");
      job.progress(0.9);
      await this.bestEffort(() => this.makeFilmstrip(entry, src), asset, "filmstrip");
      job.done();
    } catch (err) {
      entry.proxy = "failed";
      entry.error = isAbortError(err) ? "Cancelled" : message(err);
      this.cfg.log.warn(`proxy for ${asset.id} failed: ${entry.error}`);
      job.fail(entry.error);
    } finally {
      this.cfg.onChange();
    }
  }

  /** Verify the asset's file is a real, allowed, absolute path before FFmpeg is pointed at it. */
  private async checkSource(
    asset: Asset,
  ): Promise<{ path: string; size: number; mtimeMs: number }> {
    const path = await resolveInsideRoots(asset.path, this.cfg.allowedRoots);
    const st = await stat(path);
    if (!st.isFile()) throw new Error(`${basename(path)} is not a regular file`);
    return { path, size: st.size, mtimeMs: st.mtimeMs };
  }

  private async makeProxy(entry: Entry, source: string, job: JobHandle): Promise<void> {
    const fps = entry.asset.fps && entry.asset.fps > 0 ? entry.asset.fps : 30;
    // Short GOP (about half a second) so the browser can seek by decoding few frames.
    const gop = String(Math.min(30, Math.max(5, Math.round(fps / 2))));
    const out = join(entry.dir, "proxy.mp4");
    const tmp = join(entry.dir, `proxy.${randomBytes(4).toString("hex")}.tmp.mp4`);
    // The shared fallback probes a failing encoder with a synthetic frame, so a corrupt source file can never
    // get an encoder blocked; only an encoder that cannot even encode a generated picture is given up on.
    const { encoder } = await withEncoderFallback(
      async (enc) => {
        try {
          await runFfmpegProcess({
            registry: this.cfg.registry,
            signal: this.abort.signal,
            args: [
              ...["-y", "-loglevel", "error", "-nostats", "-progress", "pipe:1"],
              ...["-i", source, "-map", "0:v:0", "-map", "0:a:0?"],
              ...["-vf", `scale=-2:'min(${PROXY_HEIGHT},ih)',setsar=1,format=yuv420p`],
              ...encoderArgs(enc),
              ...["-g", gop, "-keyint_min", gop],
              ...["-c:a", "aac", "-b:a", "96k", "-ac", "2", "-ar", "48000"],
              ...["-movflags", "+faststart", "-f", "mp4", tmp],
            ],
            onOutSeconds: (sec) =>
              job.progress(0.8 * Math.min(1, sec / Math.max(0.001, entry.asset.duration))),
          });
          await rename(tmp, out);
        } catch (err) {
          await rm(tmp, { force: true });
          throw err;
        }
      },
      {
        signal: this.abort.signal,
        onFallback: (enc, err) =>
          this.cfg.log.warn(`encoder ${enc} is unusable, trying the next: ${message(err)}`),
      },
    );
    this.cfg.log.info(`proxy for ${entry.asset.id} made with ${encoder}`);
  }

  private async bestEffort(fn: () => Promise<unknown>, asset: Asset, what: string): Promise<void> {
    try {
      await fn();
    } catch (err) {
      if (isAbortError(err)) throw err;
      this.cfg.log.warn(`${what} for ${asset.id} failed: ${message(err)}`);
    }
  }

  // ---------- derived files ----------

  private async makeWaveform(entry: Entry, source: SourceFn): Promise<string> {
    const out = join(entry.dir, "waveform.json");
    if (existsSync(out)) return out;
    if (!entry.asset.hasAudio) throw new MediaError(404, "This asset has no audio");
    return this.once(out, async () => {
      const rate = waveformRate(entry.asset.duration);
      const sampleRate = 8000;
      const acc = new PeakAccumulator(Math.max(1, Math.floor(sampleRate / rate)));
      await runFfmpegProcess({
        registry: this.cfg.registry,
        signal: this.abort.signal,
        args: [
          ...["-loglevel", "error", "-i", await source(), "-map", "0:a:0", "-vn"],
          ...["-ac", "1", "-ar", String(sampleRate), "-f", "s16le", "pipe:1"],
        ],
        onStdout: (chunk) => acc.push(chunk),
      });
      const body = JSON.stringify({
        version: 1,
        duration: entry.asset.duration,
        peaksPerSecond: rate,
        peaks: acc.finish(),
      });
      await writeAtomic(out, body);
    });
  }

  private async makeFilmstrip(entry: Entry, source: SourceFn): Promise<string> {
    const out = join(entry.dir, "filmstrip.jpg");
    if (existsSync(out)) return out;
    if (entry.asset.kind !== "video") throw new MediaError(404, "This asset has no picture");
    return this.once(out, async () => {
      const n = filmstripFrames(entry.asset.duration);
      const tmp = `${out}.${randomBytes(4).toString("hex")}.tmp.jpg`;
      const fit = `scale=${FILMSTRIP_FRAME_WIDTH}:${FILMSTRIP_FRAME_HEIGHT}:force_original_aspect_ratio=decrease`;
      await runFfmpegProcess({
        registry: this.cfg.registry,
        signal: this.abort.signal,
        args: [
          ...["-y", "-loglevel", "error", "-i", await source(), "-an"],
          ...[
            "-vf",
            `fps=${n}/${Math.max(0.001, entry.asset.duration).toFixed(6)},${fit},pad=${FILMSTRIP_FRAME_WIDTH}:${FILMSTRIP_FRAME_HEIGHT}:(ow-iw)/2:(oh-ih)/2,tile=${n}x1`,
          ],
          ...["-frames:v", "1", "-q:v", "6", "-f", "image2", tmp],
        ],
      });
      await rename(tmp, out);
    });
  }

  private async makeThumb(
    entry: Entry,
    source: SourceFn,
    tenths: number,
    width: number,
  ): Promise<string> {
    const out = join(entry.dir, `thumb-${tenths}-${width}.jpg`);
    if (existsSync(out)) return out;
    if (entry.asset.kind !== "video") throw new MediaError(404, "This asset has no picture");
    return this.once(out, async () => {
      const tmp = `${out}.${randomBytes(4).toString("hex")}.tmp.jpg`;
      await runFfmpegProcess({
        registry: this.cfg.registry,
        signal: this.abort.signal,
        args: [
          ...["-y", "-loglevel", "error", "-ss", (tenths / 10).toFixed(1), "-i", await source()],
          ...["-frames:v", "1", "-vf", `scale=${width}:-2`, "-q:v", "4", "-f", "image2", tmp],
        ],
      });
      await rename(tmp, out);
    });
  }

  /** Run `make` once per output path even if many requests arrive together; resolves to the path. */
  private async once(path: string, make: () => Promise<void>): Promise<string> {
    let p = this.inflight.get(path);
    if (!p) {
      p = this.derivedSlots.run(make).finally(() => this.inflight.delete(path));
      this.inflight.set(path, p);
    }
    await p;
    return path;
  }

  // ---------- serving ----------

  /**
   * Find (or lazily make) the file for one media URL. `asset` must be an own entry of the open project;
   * the caller has already validated the id format.
   * @throws MediaError with a status the HTTP layer returns as is.
   */
  fileFor(asset: Asset, kind: MediaKind, query: URLSearchParams): Promise<MediaFile> {
    if (this.abort.signal.aborted)
      return Promise.reject(new MediaError(503, "Server is shutting down"));
    return this.track(this.makeFile(asset, kind, query));
  }

  private async makeFile(
    asset: Asset,
    kind: MediaKind,
    query: URLSearchParams,
  ): Promise<MediaFile> {
    const entry = await this.entryFor(asset);
    // Resolved lazily: a cached proxy or thumbnail can be served even if the original has since moved.
    const source: SourceFn = async () =>
      (
        await this.checkSource(asset).catch(() => {
          throw new MediaError(404, "The source file is missing or not allowed");
        })
      ).path;
    const proxyPath = join(entry.dir, "proxy.mp4");
    try {
      switch (kind) {
        case "proxy.mp4": {
          if (entry.proxy === "failed") throw new MediaError(500, entry.error ?? "Proxy failed");
          if (!existsSync(proxyPath))
            throw new MediaError(404, "The preview proxy is not ready yet");
          return { path: proxyPath, contentType: "video/mp4", cacheControl: "private, no-cache" };
        }
        case "waveform.json": {
          await mkdir(entry.dir, { recursive: true });
          const path = await this.makeWaveform(entry, source);
          return { path, contentType: "application/json", cacheControl: "private, max-age=3600" };
        }
        case "filmstrip.jpg": {
          await mkdir(entry.dir, { recursive: true });
          const path = await this.makeFilmstrip(entry, source);
          return {
            path,
            contentType: "image/jpeg",
            cacheControl: "private, max-age=3600",
            headers: { [FILMSTRIP_FRAMES_HEADER]: String(filmstripFrames(asset.duration)) },
          };
        }
        case "thumb.jpg": {
          const t = parseNumber(query.get("t"), 0, 0, Math.max(0, asset.duration));
          const w = Math.round(parseNumber(query.get("w"), 160, 16, 640) / 2) * 2;
          const tenths = Math.round(Math.min(t, Math.max(0, asset.duration - 0.1)) * 10);
          await mkdir(entry.dir, { recursive: true });
          // The proxy has short GOPs so seeking in it is quick; use it when it exists.
          const path = await this.makeThumb(
            entry,
            existsSync(proxyPath) ? async () => proxyPath : source,
            tenths,
            w,
          );
          return { path, contentType: "image/jpeg", cacheControl: "private, max-age=3600" };
        }
      }
    } catch (err) {
      if (err instanceof MediaError) throw err;
      if (isAbortError(err)) throw new MediaError(503, "Server is shutting down");
      this.cfg.log.warn(`${kind} for ${asset.id} failed: ${message(err)}`);
      throw new MediaError(500, `Could not make ${kind}`);
    }
  }

  private async entryFor(asset: Asset): Promise<Entry> {
    const known = this.entries.get(asset.id);
    if (known) return known;
    const source = await this.checkSource(asset).catch(() => {
      throw new MediaError(404, "The source file is missing or not allowed");
    });
    const dir = join(this.cfg.cacheDir, cacheKey(source.path, source.size, source.mtimeMs));
    const entry: Entry = {
      asset,
      dir,
      proxy: existsSync(join(dir, "proxy.mp4")) ? "ready" : "queued",
    };
    this.entries.set(asset.id, entry);
    return entry;
  }
}

/** Runs async tasks with at most `max` in flight; the rest wait their turn in order. */
class Limiter {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.waiting.push(resolve));
    else this.active++;
    try {
      return await fn();
    } finally {
      const next = this.waiting.shift();
      if (next)
        next(); // hand our slot straight to the next waiter
      else this.active--;
    }
  }
}

function cacheKey(path: string, size: number, mtimeMs: number): string {
  return createHash("sha1")
    .update(`${path}\0${size}\0${Math.floor(mtimeMs)}`)
    .digest("hex")
    .slice(0, 24);
}

function encoderArgs(encoder: string): string[] {
  switch (encoder) {
    case "libx264":
      return ["-c:v", encoder, "-preset", "veryfast", "-crf", "27"];
    case "mpeg4":
      return ["-c:v", encoder, "-q:v", "5"];
    default:
      return ["-c:v", encoder, "-b:v", "1500k"];
  }
}

function parseNumber(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new MediaError(400, "Query parameters must be finite numbers");
  return Math.min(max, Math.max(min, n));
}

async function writeAtomic(path: string, data: string): Promise<void> {
  const tmp = `${path}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, path);
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
