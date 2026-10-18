// createTranscriber(): the one call the app makes. Wires binary discovery, model management and the
// WhisperCppTranscriber into a core `Transcriber` that sets itself up on first use.

import type { Transcriber, Transcript } from "@dax/core";
import { type BinarySource, ensureBinary, findWhisperBinary, type RuntimeAsset } from "./binary.js";
import type { DownloadProgress } from "./download.js";
import { SttError } from "./errors.js";
import { type SpeechModelInfo, SpeechModelManager } from "./models.js";
import { defaultDataDir } from "./paths.js";
import {
  type TranscribeCallOptions,
  type WhisperCppOptions,
  WhisperCppTranscriber,
} from "./transcriber.js";

/** Progress of first-use setup: which download is running and how far it is. */
export interface SetupProgress extends DownloadProgress {
  /** What is being downloaded. */
  what: "runtime" | "model";
}

/** Settings for {@link createTranscriber}. */
export interface CreateTranscriberOptions
  extends Partial<Omit<WhisperCppOptions, "binaryPath" | "modelPath" | "onProgress">> {
  /** App data folder holding models and the runtime. Default {@link defaultDataDir}. */
  dataDir?: string;
  /** Catalog id of the model to use, e.g. `base.en`. Default: {@link SpeechModelManager.recommend}. */
  modelId?: string;
  /** Use this model file instead of the catalog (skips model download). */
  modelPath?: string;
  /** Use this whisper-cli instead of discovering or installing one. */
  binaryPath?: string;
  /** Download missing pieces on first use. Default true. With false, missing pieces raise a clear error instead. */
  autoInstall?: boolean;
  /** Called while the runtime or model downloads. */
  onSetupProgress?: (p: SetupProgress) => void;
  /** Called with recognition progress for every call. */
  onProgress?: WhisperCppOptions["onProgress"];
  /** Extra runtime assets (see {@link RuntimeAsset}), e.g. a macOS build that dax-editor publishes. */
  runtimeAssets?: RuntimeAsset[];
  /** Replace the download host for models (mirror or test server). */
  modelBaseUrl?: string;
  /** Extra catalog entries. */
  extraModels?: SpeechModelInfo[];
  /** Replacement for the global `fetch` used for downloads. */
  fetchImpl?: typeof fetch;
}

/** What is installed right now; see {@link SpeechTranscriber.status}. */
export interface SpeechStatus {
  /** whisper-cli location, or `undefined` when none is installed. */
  binary?: { path: string; source: BinarySource };
  /** The model this transcriber will use. */
  model: { id: string; path: string; installed: boolean; bytes?: number };
  /** True when both pieces are present, so `transcribe` will not need to download. */
  ready: boolean;
}

/** A core `Transcriber` that also reports and performs its own setup. */
export interface SpeechTranscriber extends Transcriber {
  /** Transcribe `path`, installing the runtime and model first if needed (and allowed). */
  transcribe(path: string, opts?: TranscribeCallOptions): Promise<Transcript>;
  /** Install the runtime and model now (for a "Set up speech recognition" button). Resolves when ready. */
  setup(opts?: { signal?: AbortSignal }): Promise<void>;
  /** Inspect what is installed without downloading anything. */
  status(): Promise<SpeechStatus>;
  /** The model manager this transcriber uses (list, install, remove models). */
  readonly models: SpeechModelManager;
}

/**
 * Build the speech-to-text engine to inject into `CommandContext.transcriber` and the server.
 *
 * The returned object is cheap to create. The first `transcribe` (or an explicit `setup`) finds or
 * installs whisper-cli, installs the model, and then runs; later calls reuse both. Nothing is
 * downloaded when `autoInstall` is false. Everything stays on this computer: audio is never uploaded.
 */
export function createTranscriber(options: CreateTranscriberOptions = {}): SpeechTranscriber {
  const dataDir = options.dataDir ?? defaultDataDir();
  const models = new SpeechModelManager({
    dataDir,
    baseUrl: options.modelBaseUrl,
    extraModels: options.extraModels,
    fetchImpl: options.fetchImpl,
  });
  const modelId = options.modelId ?? models.recommend();
  const autoInstall = options.autoInstall ?? true;
  const modelPath = () => options.modelPath ?? models.pathOf(modelId);
  const binOpts = { binaryPath: options.binaryPath, dataDir, assets: options.runtimeAssets };
  let ready: Promise<WhisperCppTranscriber> | undefined;

  const doSetup = async (signal?: AbortSignal): Promise<WhisperCppTranscriber> => {
    const bin = await ensureBinary({
      ...binOpts,
      autoInstall,
      signal,
      fetchImpl: options.fetchImpl,
      onProgress: (p) => options.onSetupProgress?.({ ...p, what: "runtime" }),
    });
    let model = modelPath();
    if (!options.modelPath) {
      if (!autoInstall && !(await models.isInstalled(modelId))) {
        throw new SttError(
          "model-missing",
          `Speech model "${modelId}" is not installed. Call setup() or models.install("${modelId}") first.`,
        );
      }
      model = await models.install(modelId, {
        signal,
        onProgress: (p) => options.onSetupProgress?.({ ...p, what: "model" }),
      });
    }
    return new WhisperCppTranscriber({
      threads: options.threads,
      language: options.language,
      disfluencyPrompt: options.disfluencyPrompt,
      snapToSpeech: options.snapToSpeech,
      initialPrompt: options.initialPrompt,
      noSpeechThreshold: options.noSpeechThreshold,
      suppressNonSpeech: options.suppressNonSpeech,
      squeezeSilence: options.squeezeSilence,
      chunking: options.chunking,
      loopFilter: options.loopFilter,
      silenceFilter: options.silenceFilter,
      timeoutMs: options.timeoutMs,
      tempDir: options.tempDir,
      onProgress: options.onProgress,
      binaryPath: bin.path,
      modelPath: model,
    });
  };
  const setup = (signal?: AbortSignal) => {
    // A failed or cancelled setup must not poison later attempts.
    ready ??= doSetup(signal).catch((err: unknown) => {
      ready = undefined;
      throw err;
    });
    return ready;
  };

  return {
    models,
    async setup(opts) {
      await setup(opts?.signal);
    },
    async status() {
      const found = await findWhisperBinary(binOpts).catch(() => undefined);
      const path = modelPath();
      const installed = options.modelPath ? true : await models.isInstalled(modelId);
      return {
        ...(found ? { binary: found } : {}),
        model: { id: modelId, path, installed },
        ready: Boolean(found) && installed,
      };
    },
    async transcribe(path, opts) {
      const engine = await setup(opts?.signal);
      return engine.transcribe(path, opts);
    },
  };
}
