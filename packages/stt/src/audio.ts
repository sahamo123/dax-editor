// Turns any media file into the 16 kHz mono 16-bit WAV that whisper.cpp expects, using FFmpeg.
// Output always goes to a temp file, so a multi-hour video is never held in memory.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegBin } from "@dax/core";
import { SttError } from "./errors.js";
import { runProcess } from "./process.js";
import { readWavInfo } from "./wav.js";

/** Sample rate whisper.cpp requires, in Hz. */
export const WHISPER_SAMPLE_RATE = 16000;

/** Options for {@link extractAudio}. */
export interface ExtractAudioOptions {
  /** Where to write the WAV. Default: a fresh file in a private temp folder, removed by `cleanup()`. */
  outPath?: string;
  /** Start of the slice in seconds of the source. Default 0. */
  startSec?: number;
  /** Length of the slice in seconds. Default: to the end of the source. */
  durationSec?: number;
  /** Abort to stop FFmpeg. */
  signal?: AbortSignal;
}

/** A WAV file produced by {@link extractAudio}. */
export interface ExtractedAudio {
  /** Absolute path of the 16 kHz mono 16-bit PCM WAV. */
  path: string;
  /** Length of the audio in seconds, read from the WAV header. */
  durationSec: number;
  /** Delete the temp file (and its folder). Safe to call twice. Does nothing for a caller-supplied `outPath`. */
  cleanup(): Promise<void>;
}

/**
 * Decode the first audio stream of `path` (video or audio file, any container FFmpeg reads) into a
 * 16 kHz mono 16-bit WAV on disk, optionally just a slice of it.
 *
 * FFmpeg streams to disk, so memory use does not grow with the length of the input. Spawns
 * `ffmpegBin()` from `@dax/core` (so `DAX_FFMPEG` is honoured). Throws {@link SttError} with code
 * `no-audio` when the file has no audio stream, `binary-missing` when FFmpeg is not installed,
 * `cancelled` on abort and `process-failed` for anything else FFmpeg rejects.
 */
export async function extractAudio(
  path: string,
  opts: ExtractAudioOptions = {},
): Promise<ExtractedAudio> {
  let dir: string | undefined;
  let outPath = opts.outPath;
  if (!outPath) {
    dir = await mkdtemp(join(tmpdir(), "dax-stt-"));
    outPath = join(dir, "audio.wav");
  }
  const cleanup = async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  };
  const args = ["-hide_banner", "-nostdin", "-y", "-loglevel", "error"];
  if (opts.startSec) args.push("-ss", String(opts.startSec));
  args.push("-protocol_whitelist", "file", "-i", path);
  if (opts.durationSec !== undefined) args.push("-t", String(opts.durationSec));
  // "-map 0:a:0" fails loudly on silent video instead of writing an empty file.
  args.push("-map", "0:a:0", "-vn", "-ac", "1", "-ar", String(WHISPER_SAMPLE_RATE));
  args.push("-c:a", "pcm_s16le", "-fflags", "+bitexact", "-f", "wav", outPath);
  try {
    const res = await runProcess(ffmpegBin(), args, { signal: opts.signal });
    if (res.code !== 0) {
      const noAudio = /matches no streams|does not contain any stream|Stream map/i.test(
        res.stderrTail,
      );
      throw noAudio
        ? new SttError(
            "no-audio",
            `${path} has no audio stream, so there is nothing to transcribe.`,
          )
        : new SttError(
            "process-failed",
            `FFmpeg could not read audio from ${path}:\n${res.stderrTail}`,
          );
    }
    return { path: outPath, durationSec: (await readWavInfo(outPath)).durationSec, cleanup };
  } catch (err) {
    await cleanup();
    if (err instanceof SttError && err.code === "binary-missing") {
      throw new SttError(
        "binary-missing",
        "FFmpeg was not found. Install FFmpeg or set DAX_FFMPEG to its path.",
        { cause: err },
      );
    }
    throw err;
  }
}
