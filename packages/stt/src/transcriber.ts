// WhisperCppTranscriber: implements core's Transcriber by running the whisper-cli executable.
// Pipeline: FFmpeg -> 16 kHz WAV -> loudness -> squeeze long silences -> chunks -> whisper-cli -ojf
// -> words -> map back to original time -> tighten and filter.

import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { cpus, tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { Range, Transcriber, Transcript } from "@dax/core";
import { extractAudio } from "./audio.js";
import { type ChunkOptions, mergeChunkWords, planChunks } from "./chunking.js";
import { SttError } from "./errors.js";
import {
  collapseRepeatLoops,
  dropWordsInSilence,
  type LoopFilterOptions,
} from "./hallucination.js";
import { runProcess } from "./process.js";
import { isIdentityPlan, mapWordsToOriginal, planSqueeze, type SqueezePlan } from "./squeeze.js";
import {
  computeEnergyEnvelope,
  type EnergyEnvelope,
  findQuietRanges,
  trimWordsToSpeech,
} from "./timing.js";
import { writeWavParts } from "./wav.js";
import { parseWhisperJson, type RawWord } from "./whisper-json.js";

/**
 * Progress report from a transcription. `fraction` is 0..1 over the whole file; `stage` says what is
 * happening so a UI can show "Preparing audio" before the (long) "Recognising speech" phase.
 */
export interface TranscribeProgress {
  /** Current phase. */
  stage: "extracting" | "analysing" | "recognising" | "finishing";
  /** Overall completion 0..1 (monotonic). */
  fraction: number;
  /** 1-based index of the chunk being recognised, when the file was split. */
  chunk?: number;
  /** Number of chunks the file was split into. */
  chunks?: number;
}

/**
 * Prompt that nudges Whisper to write "um" and "uh" instead of dropping them. Measured: it rescues
 * fillers on `tiny.en` but makes models stop emitting segment timestamps, which wrecks word times
 * (mean error 4.9 s on `small.en`); `base.en` and larger keep fillers without it. See `disfluencyPrompt`.
 */
export const DISFLUENCY_PROMPT =
  "Umm, let me think like, hmm... Okay, here's what I'm, like, thinking.";

/** Settings for {@link WhisperCppTranscriber}. */
export interface WhisperCppOptions {
  /** Absolute path of the whisper-cli executable (see `ensureBinary`). */
  binaryPath: string;
  /** Absolute path of a ggml model file (see `SpeechModelManager`). */
  modelPath: string;
  /** Threads for the decoder. Default: CPU count minus one, between 1 and 8. */
  threads?: number;
  /** Language to use when `transcribe` is called without one. English-only models always use `en`. Default: auto-detect. */
  language?: string;
  /** Prime the model with {@link DISFLUENCY_PROMPT} so a `tiny` model keeps "um" and "uh". Hurts word timing; default false. */
  disfluencyPrompt?: boolean;
  /** Priming text for the model, e.g. names and jargon from the video. Overrides `disfluencyPrompt`. Prompts degrade word timing. */
  initialPrompt?: string;
  /** whisper-cli `--no-speech-thold`: segments the model thinks are not speech above this probability are dropped. Default: the engine's 0.6. */
  noSpeechThreshold?: number;
  /** Pass `--suppress-nst` to stop the model writing `[MUSIC]`-style tags. Default true. */
  suppressNonSpeech?: boolean;
  /** Shorten silences of 1.2 s or more before recognition and map times back. Default true. See {@link planSqueeze}. */
  squeezeSilence?: boolean;
  /** Shrink each word to the loud part of its span using the audio (see `trimWordsToSpeech`). Default true. */
  snapToSpeech?: boolean;
  /** Long-file chunking, or `false` to always give the engine the whole file. See {@link planChunks}. */
  chunking?: ChunkOptions | false;
  /** Remove repeat-loop hallucinations. `false` disables, an object tunes. Default on. */
  loopFilter?: boolean | LoopFilterOptions;
  /** Drop words that fall inside measured silence of 1.2 s or more. Default true. */
  silenceFilter?: boolean;
  /** Stop a single whisper-cli run after this long. Default: max(5 min, 4 x the run's audio length). */
  timeoutMs?: number;
  /** Folder for temp WAV and JSON files. Default: the OS temp folder. */
  tempDir?: string;
  /** Called with progress for every `transcribe` call (a per-call `onProgress` is called as well). */
  onProgress?: (p: TranscribeProgress) => void;
}

/** Per-call options for {@link WhisperCppTranscriber.transcribe}. */
export interface TranscribeCallOptions {
  /** ISO code such as `en`; omit to use the configured default or auto-detect. */
  language?: string;
  /** Abort to kill whisper-cli and FFmpeg; the promise rejects with a `cancelled` {@link SttError}. */
  signal?: AbortSignal;
  /** Progress for this call. */
  onProgress?: (p: TranscribeProgress) => void;
}

/** Inputs of {@link buildWhisperArgs}. */
export interface WhisperArgsInput {
  /** Model file. */
  modelPath: string;
  /** 16 kHz mono WAV to recognise. */
  wavPath: string;
  /** Output path without extension; whisper-cli appends `.json`. */
  outBase: string;
  /** Decoder threads. */
  threads: number;
  /** Language code or `auto`. */
  language: string;
  /** Priming text, if any. */
  prompt?: string;
  /** `--no-speech-thold` value, if overriding. */
  noSpeechThreshold?: number;
  /** Add `--suppress-nst`. */
  suppressNonSpeech?: boolean;
}

/**
 * The exact argument list for one whisper-cli run. Pure so it can be tested; there is no shell, each
 * element reaches the program as one argument, so file names with spaces or quotes are safe.
 */
export function buildWhisperArgs(i: WhisperArgsInput): string[] {
  const args = [
    "-m",
    i.modelPath,
    "-f",
    i.wavPath,
    "-ojf", // JSON with per-token offsets: the source of word timings
    "-of",
    i.outBase,
    "-t",
    String(i.threads),
    "-l",
    i.language,
    "-pp", // progress lines on stderr
    "-np", // no extra info prints
  ];
  if (i.prompt) args.push("--prompt", i.prompt);
  if (i.noSpeechThreshold !== undefined) args.push("-nth", String(i.noSpeechThreshold));
  if (i.suppressNonSpeech) args.push("-sns");
  return args;
}

/**
 * Extract `45` from `whisper_print_progress_callback: progress =  45%`; `undefined` for other lines.
 * whisper.cpp can report more than 100 on audio shorter than its 30 s window (137% was observed), so
 * the value is capped at 100.
 */
export function parseProgressLine(line: string): number | undefined {
  const m = /progress\s*=\s*(\d{1,4})\s*%/.exec(line);
  if (!m) return undefined;
  return Math.min(100, Number(m[1]));
}

/** English-only models (`ggml-base.en.bin`, `ggml-base.en-q5_1.bin`) cannot transcribe other languages. */
export function isEnglishOnlyModel(modelPath: string): boolean {
  return /\.en([.-]|$)/.test(basename(modelPath));
}

/**
 * Local, free speech-to-text through the whisper.cpp command-line tool.
 *
 * Silence: stretches of 1.2 s or more are shortened to about 1.1 s before recognition (the engine
 * invents text over silence and mis-stamps the first word after a pause) and times are mapped back.
 *
 * Long-file strategy: audio up to 12.5 minutes goes to whisper.cpp in one run (best accuracy: it
 * carries context between its 30-second windows). Longer audio is cut into about 10-minute chunks at
 * the middle of a squeezed silence, each recognised separately and shifted back by its offset. This
 * bounds temp-file and engine memory, makes cancel immediate, keeps progress smooth, limits a repeat
 * loop to one chunk, and lets a crashed run be retried per chunk. With no silence to cut in, chunks
 * overlap by 3 s and each word is kept from exactly one of them.
 */
export class WhisperCppTranscriber implements Transcriber {
  /** Create a transcriber; nothing is started until {@link WhisperCppTranscriber.transcribe} is called. */
  constructor(private readonly opts: WhisperCppOptions) {}

  /**
   * Transcribe the audio of `path` into a word-timed core `Transcript`; times are seconds from the
   * start of the file. Never loads the whole file into memory. Throws {@link SttError} with a code
   * such as `model-missing`, `binary-missing`, `no-audio`, `unsupported-language`, `timeout`,
   * `cancelled` or `process-failed`; the message says how to fix it.
   */
  async transcribe(path: string, call: TranscribeCallOptions = {}): Promise<Transcript> {
    const o = this.opts;
    await this.assertReady();
    const language = this.resolveLanguage(call.language);
    const report = (p: TranscribeProgress) => {
      o.onProgress?.(p);
      call.onProgress?.(p);
    };
    const work = await mkdtemp(join(o.tempDir ?? tmpdir(), "dax-stt-"));
    try {
      report({ stage: "extracting", fraction: 0 });
      const full = await extractAudio(path, {
        outPath: join(work, "full.wav"),
        signal: call.signal,
      });
      if (full.durationSec < 0.1)
        return { ...(language === "auto" ? {} : { language }), words: [] };

      report({ stage: "analysing", fraction: 0.02 });
      const envelope = await computeEnergyEnvelope(full.path).catch(() => undefined);
      const quiet = envelope ? findQuietRanges(envelope) : [];
      const plan = planSqueeze(o.squeezeSilence === false ? [] : quiet, full.durationSec);
      const squeezed = isIdentityPlan(plan, full.durationSec)
        ? full.path
        : join(work, "squeezed.wav");
      if (squeezed !== full.path) {
        await writeWavParts(
          full.path,
          squeezed,
          plan.segments.map((s) => ({ start: s.origStart, end: s.origEnd })),
          plan.gapSec,
        );
      }

      const { words: squeezedWords, language: detected } = await this.recogniseChunks(
        squeezed,
        plan,
        work,
        language,
        call.signal,
        report,
      );
      report({ stage: "finishing", fraction: 0.99 });
      const words = this.clean(
        mapWordsToOriginal(plan, squeezedWords),
        quiet,
        full.durationSec,
        envelope,
      );
      report({ stage: "finishing", fraction: 1 });
      const lang = language === "auto" ? detected : language;
      return { ...(lang ? { language: lang } : {}), words };
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }

  /** Cut the (squeezed) audio into chunks, recognise each, and return all words in squeezed time. */
  private async recogniseChunks(
    wav: string,
    plan: SqueezePlan,
    work: string,
    language: string,
    signal: AbortSignal | undefined,
    report: (p: TranscribeProgress) => void,
  ): Promise<{ words: RawWord[]; language?: string }> {
    const o = this.opts;
    const total = plan.durationSec;
    const chunks =
      o.chunking === false
        ? planChunks(total, [], { chunkSec: Number.MAX_SAFE_INTEGER })
        : planChunks(total, plan.joins, o.chunking);
    const perChunk: RawWord[][] = [];
    let detected: string | undefined;
    for (const [i, chunk] of chunks.entries()) {
      const base = 0.05 + 0.93 * (chunk.start / total);
      const span = 0.93 * ((chunk.end - chunk.start) / total);
      let chunkWav = wav;
      if (chunks.length > 1) {
        chunkWav = join(work, `chunk-${i}.wav`);
        await writeWavParts(wav, chunkWav, [{ start: chunk.start, end: chunk.end }]);
      }
      const parsed = await this.runWhisper(
        chunkWav,
        join(work, `out-${i}`),
        language,
        chunk.end - chunk.start,
        signal,
        (f) =>
          report({
            stage: "recognising",
            fraction: base + span * f,
            chunk: i + 1,
            chunks: chunks.length,
          }),
      );
      detected ??= parsed.language;
      perChunk.push(parsed.words);
      if (chunks.length > 1) await rm(chunkWav, { force: true });
    }
    return { words: mergeChunkWords(chunks, perChunk), language: detected };
  }

  private async assertReady(): Promise<void> {
    const { binaryPath, modelPath } = this.opts;
    try {
      await stat(modelPath);
    } catch {
      throw new SttError(
        "model-missing",
        `Speech model not found at ${modelPath}. Install one with SpeechModelManager.install("base.en") or pass a different modelPath.`,
      );
    }
    try {
      await stat(binaryPath);
    } catch {
      throw new SttError(
        "binary-missing",
        `whisper-cli not found at ${binaryPath}. Run ensureBinary() to install it or set DAX_WHISPER_CLI.`,
      );
    }
  }

  private resolveLanguage(requested?: string): string {
    const wanted = (requested ?? this.opts.language)?.trim().toLowerCase();
    if (isEnglishOnlyModel(this.opts.modelPath)) {
      if (wanted && wanted !== "en" && wanted !== "auto") {
        throw new SttError(
          "unsupported-language",
          `The model ${basename(this.opts.modelPath)} only understands English, but language "${wanted}" was requested. Install a multilingual model such as "base" or "small".`,
        );
      }
      return "en";
    }
    return wanted && /^[a-z]{2,3}$/.test(wanted) ? wanted : "auto";
  }

  private async runWhisper(
    wavPath: string,
    outBase: string,
    language: string,
    audioSec: number,
    signal: AbortSignal | undefined,
    onFraction: (f: number) => void,
  ): Promise<{ language?: string; words: RawWord[] }> {
    const o = this.opts;
    const prompt = o.initialPrompt ?? (o.disfluencyPrompt ? DISFLUENCY_PROMPT : undefined);
    const args = buildWhisperArgs({
      modelPath: o.modelPath,
      wavPath,
      outBase,
      threads: o.threads ?? Math.max(1, Math.min(8, cpus().length - 1)),
      language,
      prompt,
      noSpeechThreshold: o.noSpeechThreshold,
      suppressNonSpeech: o.suppressNonSpeech ?? true,
    });
    const res = await runProcess(o.binaryPath, args, {
      signal,
      timeoutMs: o.timeoutMs ?? Math.max(5 * 60_000, audioSec * 4000),
      onStderrLine: (line) => {
        const pct = parseProgressLine(line);
        if (pct !== undefined) onFraction(pct / 100);
      },
    }).catch((err: unknown) => {
      if (err instanceof SttError && err.code === "binary-missing") {
        throw new SttError(
          "binary-missing",
          `whisper-cli could not be started from ${o.binaryPath}. Check that the file is executable, or run ensureBinary().`,
          { cause: err },
        );
      }
      throw err;
    });
    if (res.code !== 0) throw describeFailure(res.code, res.signal, res.stderrTail, o.binaryPath);
    let json: string;
    try {
      json = await readFile(`${outBase}.json`, "utf8");
    } catch {
      throw new SttError(
        "bad-output",
        `whisper-cli finished but wrote no JSON file. Last output:\n${res.stderrTail}`,
      );
    }
    try {
      return parseWhisperJson(json);
    } catch (err) {
      throw new SttError("bad-output", (err as Error).message, { cause: err });
    }
  }

  private clean(
    words: RawWord[],
    quiet: Range[],
    durationSec: number,
    envelope?: EnergyEnvelope,
  ): Transcript["words"] {
    const o = this.opts;
    let out = words;
    if (envelope && o.snapToSpeech !== false) out = trimWordsToSpeech(out, envelope);
    if (o.silenceFilter !== false) out = dropWordsInSilence(out, quiet);
    if (o.loopFilter !== false) {
      out = collapseRepeatLoops(out, typeof o.loopFilter === "object" ? o.loopFilter : {}).words;
    }
    return out
      .map((w) => ({
        text: w.text,
        start: round3(Math.min(Math.max(0, w.start), durationSec)),
        end: round3(Math.min(Math.max(w.start, w.end), durationSec)),
      }))
      .filter((w) => w.text.length > 0);
  }
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Turn a failed whisper-cli exit into a message that says what to do. Exported for tests. */
export function describeFailure(
  code: number | null,
  signal: NodeJS.Signals | null,
  stderrTail: string,
  bin: string,
): SttError {
  if (signal === "SIGILL") {
    return new SttError(
      "process-failed",
      `${bin} crashed with an illegal instruction: it was built for CPU features this machine lacks. Use the official release build (it picks a compatible CPU variant) or rebuild with GGML_NATIVE=OFF.`,
    );
  }
  if (signal) {
    return new SttError(
      "process-failed",
      `${bin} was ended by signal ${signal} (out of memory? try a smaller model).\n${stderrTail}`,
    );
  }
  if (/failed to load model|failed to open|not a valid|bad magic|invalid model/i.test(stderrTail)) {
    return new SttError(
      "model-missing",
      `whisper-cli could not load the model (the file may be incomplete or not a ggml whisper model). Re-install it.\n${stderrTail}`,
    );
  }
  if (/error while loading shared libraries|library not loaded|dll/i.test(stderrTail)) {
    return new SttError(
      "binary-missing",
      `whisper-cli is missing a system library:\n${stderrTail}\nOn Linux install libgomp1 and libstdc++6.`,
    );
  }
  return new SttError("process-failed", `whisper-cli exited with code ${code}.\n${stderrTail}`);
}
