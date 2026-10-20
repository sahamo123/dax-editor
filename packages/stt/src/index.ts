// Public surface of @dax/stt: local speech-to-text with whisper.cpp.

export {
  type ExtractAudioOptions,
  type ExtractedAudio,
  extractAudio,
  WHISPER_SAMPLE_RATE,
} from "./audio.js";
export {
  assertSafeEntryNames,
  type BinaryOptions,
  type BinarySource,
  type EnsureBinaryOptions,
  ensureBinary,
  type FoundBinary,
  findWhisperBinary,
  RUNTIME_ASSETS,
  type RuntimeAsset,
  runtimeInstallDir,
  WHISPER_RUNTIME_VERSION,
} from "./binary.js";
export { type Chunk, type ChunkOptions, mergeChunkWords, planChunks } from "./chunking.js";
export {
  type DownloadOptions,
  type DownloadProgress,
  downloadFile,
  sha256File,
} from "./download.js";
export { SttError, type SttErrorCode } from "./errors.js";
export {
  type CreateTranscriberOptions,
  createTranscriber,
  type SetupProgress,
  type SpeechStatus,
  type SpeechTranscriber,
} from "./factory.js";
export {
  collapseRepeatLoops,
  dropWordsInSilence,
  type LoopFilterOptions,
  type LoopFilterResult,
} from "./hallucination.js";
export {
  type InstallModelOptions,
  MODEL_LICENSE,
  MODEL_REPO,
  MODEL_REPO_REVISION,
  modelUrl,
  SPEECH_MODELS,
  type SpeechModelInfo,
  SpeechModelManager,
  type SpeechModelManagerOptions,
  type SpeechModelStatus,
} from "./models.js";
export { defaultDataDir, findOnPath, modelsDir, runtimeDir } from "./paths.js";
export {
  isIdentityPlan,
  mapWordsToOriginal,
  planSqueeze,
  type SqueezeOptions,
  type SqueezePlan,
  type SqueezeSegment,
  squeezedToOriginal,
} from "./squeeze.js";
export {
  computeEnergyEnvelope,
  type EnergyEnvelope,
  findQuietRanges,
  type QuietOptions,
  type TrimOptions,
  trimWordsToSpeech,
} from "./timing.js";
export {
  buildWhisperArgs,
  DISFLUENCY_PROMPT,
  describeFailure,
  isEnglishOnlyModel,
  parseProgressLine,
  type TranscribeCallOptions,
  type TranscribeProgress,
  type WhisperArgsInput,
  type WhisperCppOptions,
  WhisperCppTranscriber,
} from "./transcriber.js";
export {
  parseWavHeader,
  readWavInfo,
  type WavInfo,
  type WavPartRange,
  writeWavParts,
} from "./wav.js";
export {
  isSpecialToken,
  type ParsedWhisper,
  parseWhisperJson,
  type RawWord,
  stripNonSpeechTags,
} from "./whisper-json.js";
