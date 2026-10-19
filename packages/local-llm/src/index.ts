/**
 * Public entry of `@dax/local-llm`: hardware detection, the model catalog, the resumable
 * downloader, the llama.cpp runtime installer, the `llama-server` process wrapper and the
 * `LocalModelManager` that ties them together. Import from here, never from deep paths.
 */

export type { ExtractOptions } from "./archive.js";
export { extractArchive, extractTarGz, extractZip } from "./archive.js";
export {
  DEFAULT_MODEL_ID,
  getModel,
  MODEL_CATALOG,
  type ModelEntry,
  type ModelRecommendation,
  type RamTier,
  ramTierFor,
  recommendModel,
} from "./catalog.js";
export { type CatalogCheck, verifyCatalogEntry } from "./catalog-verify.js";
export {
  type DownloadOptions,
  type DownloadProgress,
  type DownloadResult,
  downloadFile,
  freeDiskBytes,
  sha256File,
} from "./download.js";
export {
  ArchiveError,
  DownloadAbortedError,
  HashMismatchError,
  HttpError,
  InsufficientDiskSpaceError,
  LocalLlmError,
  ServerError,
  UnsupportedError,
  UnverifiedRuntimeError,
} from "./errors.js";
export {
  type DetectHardwareOptions,
  detectHardware,
  type GpuInfo,
  type HardwareInfo,
} from "./hardware.js";
export {
  type InstallProgress,
  type LocalModelEvent,
  LocalModelManager,
  type LocalModelManagerOptions,
  type LocalModelStatus,
  type ServerHandle,
} from "./manager.js";
export { getFreePort, killAllRegistered, reapStaleProcess } from "./process-guard.js";
export { LogRingBuffer } from "./ring-buffer.js";
export {
  type EnsureRuntimeOptions,
  ensureRuntime,
  type FindRuntimeOptions,
  findInstalledRuntime,
  PINNED_RUNTIME_DIGESTS,
  PINNED_RUNTIME_TAG,
  type ResolvedRuntimeAsset,
  type ResolveRuntimeOptions,
  type RuntimeBackend,
  type RuntimeInfo,
  type RuntimeProgress,
  type RuntimeTarget,
  recommendBackend,
  removeRuntime,
  resolveRuntimeAsset,
  runtimeAssetCandidates,
  serverBinaryName,
} from "./runtime.js";
export {
  type CrashInfo,
  LlamaServer,
  type LlamaServerEvents,
  type LlamaServerOptions,
  type ServerState,
} from "./server.js";
