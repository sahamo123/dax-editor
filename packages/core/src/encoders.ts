// Choosing a video encoder that actually works on this machine, shared by export (core) and the proxy pipeline (server).
// An LGPL FFmpeg lists h264_nvenc, h264_qsv and h264_amf whether or not the hardware exists, so being listed proves nothing:
// the only real test is to encode one frame. Failures are remembered for a while so we do not retry a dead encoder per job.

import { abortError, ffmpegBin, isAbortError, run } from "./exec.js";

/**
 * Preferred H.264 encoders, best first. libx264 is GPL, so builds we ship
 * (LGPL) rely on the platform encoders and fall back to what is available.
 */
const PREFERRED_ENCODERS = [
  "libx264",
  "h264_videotoolbox",
  "h264_nvenc",
  "h264_qsv",
  "h264_amf",
  "libopenh264",
  "mpeg4",
] as const;

/** How long a probe result (working or not) is trusted before the encoder is probed again. */
const PROBE_TTL_MS = 10 * 60 * 1000;
/** A one-frame encode that takes longer than this means a hung driver; treat the encoder as unusable. */
const PROBE_TIMEOUT_MS = 20_000;

/** Names of the video encoders compiled into the FFmpeg binary in use. */
export async function listEncoders(): Promise<Set<string>> {
  const { stdout } = await run(ffmpegBin(), ["-hide_banner", "-encoders"], { timeoutMs: 30_000 });
  const names = new Set<string>();
  for (const line of stdout.split("\n")) {
    const name = /^\s*V\S*\s+(\S+)/.exec(line)?.[1];
    if (name) names.add(name);
  }
  return names;
}

/** The preferred H.264 encoders found in `available`, best first. Empty if none is present. */
export function rankEncoders(available: Iterable<string>): string[] {
  const have = new Set(available);
  return PREFERRED_ENCODERS.filter((e) => have.has(e));
}

/** Pick the best available H.264 encoder from the preferred list. Throws if none is usable. */
export function chooseEncoder(available: Set<string>): string {
  const found = rankEncoders(available)[0];
  if (!found) throw new Error("No usable video encoder found in this FFmpeg build");
  return found;
}

/** What we learned about one encoder: did a one-frame test encode work, and when. */
interface ProbeResult {
  ok: boolean;
  at: number;
}

/** Probe results by `<ffmpeg binary>\0<encoder>` (the binary is part of the key because `DAX_FFMPEG` can change). */
const probeResults = new Map<string, ProbeResult>();

function probeKey(encoder: string): string {
  return `${ffmpegBin()}\0${encoder}`;
}

/** The cached verdict for `encoder`, or undefined if unknown or older than the TTL. */
function cachedVerdict(encoder: string, now: number): boolean | undefined {
  const r = probeResults.get(probeKey(encoder));
  return r && now - r.at < PROBE_TTL_MS ? r.ok : undefined;
}

/** Forget every remembered probe result. For tests, and for callers that know the environment changed (a GPU was plugged in). */
export function resetEncoderProbes(): void {
  probeResults.clear();
}

/** Options for {@link probeEncoder}. */
export interface ProbeOptions {
  /** Cancels the probe; it then rejects with an `AbortError`-named error. */
  signal?: AbortSignal;
  /** Ignore a cached verdict and test again. */
  force?: boolean;
}

/**
 * Test whether `encoder` really works by encoding one synthetic frame (a generated lavfi picture, so a broken
 * or missing user file can never be mistaken for a broken encoder). The verdict is cached for ten minutes.
 * @returns true if the encoder produced output, false if FFmpeg could not use it.
 * @throws an `AbortError`-named error if `opts.signal` fires.
 */
export async function probeEncoder(encoder: string, opts: ProbeOptions = {}): Promise<boolean> {
  if (opts.signal?.aborted) throw abortError();
  if (!opts.force) {
    const known = cachedVerdict(encoder, Date.now());
    if (known !== undefined) return known;
  }
  let ok: boolean;
  try {
    await run(
      ffmpegBin(),
      [
        ...["-hide_banner", "-nostdin", "-loglevel", "error"],
        // 640x360 is above the minimum frame size of every hardware encoder we know of.
        ...["-f", "lavfi", "-i", "color=c=black:s=640x360:r=25:d=0.2"],
        ...["-frames:v", "1", "-pix_fmt", "yuv420p", "-c:v", encoder, "-f", "null", "-"],
      ],
      { timeoutMs: PROBE_TIMEOUT_MS, ...(opts.signal ? { signal: opts.signal } : {}) },
    );
    ok = true;
  } catch (err) {
    if (isAbortError(err)) throw err;
    ok = false;
  }
  probeResults.set(probeKey(encoder), { ok, at: Date.now() });
  return ok;
}

/** Options for {@link withEncoderFallback}. */
export interface FallbackOptions {
  /** Ordered encoders to try. Defaults to the preferred encoders present in this FFmpeg build. */
  candidates?: readonly string[];
  /** Cancels the whole sequence; a failure while this is aborted is never retried. */
  signal?: AbortSignal;
  /** Called when an encoder is given up on, with the error that caused it. */
  onFallback?: (encoder: string, err: unknown) => void;
  /** Replaces {@link probeEncoder}; for tests. */
  probe?: (encoder: string) => Promise<boolean>;
}

/**
 * Run `attempt` with the best encoder, moving to the next when an encoder turns out to be unusable.
 *
 * When an attempt fails, the failing encoder is tested with a synthetic one-frame encode. If that also fails the
 * encoder is dead (no GPU, no driver): it is remembered as such and the next candidate is tried. If it passes, the
 * failure was about the job itself (a corrupt source, a bad filter), so the original error is thrown at once and no
 * encoder is blamed. Encoders already known to be dead are skipped unless nothing else is left.
 * @returns the encoder that succeeded and what `attempt` returned.
 * @throws the last error when every encoder failed, or the job's own error, or an `AbortError`-named error on cancel.
 */
export async function withEncoderFallback<T>(
  attempt: (encoder: string) => Promise<T>,
  opts: FallbackOptions = {},
): Promise<{ encoder: string; value: T }> {
  const all = opts.candidates ? [...opts.candidates] : rankEncoders(await listEncoders());
  if (all.length === 0) throw new Error("No usable video encoder found in this FFmpeg build");
  const now = Date.now();
  const healthy = all.filter((e) => cachedVerdict(e, now) !== false);
  // If every encoder is remembered as dead, give them all another chance rather than failing without trying.
  const queue = healthy.length > 0 ? healthy : all;
  const probe =
    opts.probe ?? ((e: string) => probeEncoder(e, opts.signal ? { signal: opts.signal } : {}));

  let lastError: unknown;
  for (const encoder of queue) {
    if (opts.signal?.aborted) throw abortError();
    try {
      return { encoder, value: await attempt(encoder) };
    } catch (err) {
      if (isAbortError(err) || opts.signal?.aborted) throw err;
      lastError = err;
      // A hardware encoder listed by FFmpeg may have no hardware behind it: ask a synthetic input, not the user's file.
      if (await probe(encoder)) throw err;
      probeResults.set(probeKey(encoder), { ok: false, at: Date.now() });
      opts.onFallback?.(encoder, err);
    }
  }
  throw lastError ?? new Error("No usable video encoder found in this FFmpeg build");
}
