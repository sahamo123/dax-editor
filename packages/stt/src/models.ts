// Catalog of whisper ggml speech models and the manager that downloads, verifies and removes them.
// The catalog is data (URLs, sizes, SHA-256 taken from Hugging Face's own file metadata); no logic.

import { rm, stat } from "node:fs/promises";
import { totalmem } from "node:os";
import { join } from "node:path";
import { type DownloadProgress, downloadFile, sha256File } from "./download.js";
import { SttError } from "./errors.js";
import { defaultDataDir, modelsDir } from "./paths.js";

/** One downloadable whisper model. */
export interface SpeechModelInfo {
  /** Stable id, the whisper.cpp model name: `base.en`, `small-q5_1`, ... */
  id: string;
  /** File name on Hugging Face and on disk. */
  file: string;
  /** Exact size in bytes. */
  bytes: number;
  /** SHA-256 of the file, hex, as published by Hugging Face (`lfs.sha256`) and re-checked by us. */
  sha256: string;
  /** False for the `.en` models, which only transcribe English (and do it better than the multilingual one of the same size). */
  multilingual: boolean;
  /** `"q5_1"` for 5-bit quantised weights (about 40% of the size, near-identical accuracy), else `"f16"`. */
  quantization: "f16" | "q5_1";
  /** Rough resident memory while running, in MB (whisper.cpp README memory table). */
  approxRamMB: number;
  /** One line for a settings screen. */
  description: string;
}

/** Hugging Face repository the models come from, pinned to a commit so files never change under us. */
export const MODEL_REPO = "ggerganov/whisper.cpp";

/** The commit of {@link MODEL_REPO} the catalog hashes were taken from. */
export const MODEL_REPO_REVISION = "5359861c739e955e79d9a303bcbc70fb988958b1";

/**
 * Licence of the models. The weights are OpenAI's Whisper converted to ggml; the conversion repo's
 * model card declares `license: mit` and OpenAI's repository LICENSE begins "MIT License / Copyright
 * (c) 2022 OpenAI". whisper.cpp itself is "MIT License / Copyright (c) 2023-2026 The ggml authors".
 * Redistribution requires keeping those notices (see `THIRD_PARTY` in the docs).
 */
export const MODEL_LICENSE = {
  spdx: "MIT",
  weights:
    "MIT License, Copyright (c) 2022 OpenAI (https://github.com/openai/whisper/blob/main/LICENSE)",
  modelCard: "https://huggingface.co/ggerganov/whisper.cpp (front matter: license: mit)",
  runtime:
    "MIT License, Copyright (c) 2023-2026 The ggml authors (https://github.com/ggml-org/whisper.cpp/blob/master/LICENSE)",
} as const;

function entry(
  id: string,
  bytes: number,
  sha256: string,
  approxRamMB: number,
  description: string,
): SpeechModelInfo {
  return {
    id,
    file: `ggml-${id}.bin`,
    bytes,
    sha256,
    multilingual: !id.includes(".en"),
    quantization: id.endsWith("-q5_1") ? "q5_1" : "f16",
    approxRamMB,
    description,
  };
}

/** Models offered by default, smallest first. Sizes and hashes verified against Hugging Face on 2026-10-18. */
export const SPEECH_MODELS: readonly SpeechModelInfo[] = [
  entry(
    "tiny.en",
    77704715,
    "921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f",
    400,
    "Fastest, English only. Drafts and weak computers.",
  ),
  entry(
    "tiny.en-q5_1",
    32166155,
    "c77c5766f1cef09b6b7d47f21b546cbddd4157886b3b5d6d4f709e91e66c7c2b",
    300,
    "Fastest and smallest download, English only (quantised).",
  ),
  entry(
    "tiny",
    77691713,
    "be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21",
    400,
    "Fastest, many languages.",
  ),
  entry(
    "tiny-q5_1",
    32152673,
    "818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7",
    300,
    "Fastest and smallest download, many languages (quantised).",
  ),
  entry(
    "base.en",
    147964211,
    "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002",
    500,
    "Good default for English: fast with solid accuracy.",
  ),
  entry(
    "base.en-q5_1",
    59721011,
    "4baf70dd0d7c4247ba2b81fafd9c01005ac77c2f9ef064e00dcf195d0e2fdd2f",
    400,
    "Good default for English, 60% smaller download (quantised).",
  ),
  entry(
    "base",
    147951465,
    "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
    500,
    "Fast, many languages.",
  ),
  entry(
    "base-q5_1",
    59707625,
    "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898",
    400,
    "Fast, many languages, smaller download (quantised).",
  ),
  entry(
    "small.en",
    487614201,
    "c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d",
    1000,
    "Most accurate English model offered here; about 3x slower than base.",
  ),
  entry(
    "small.en-q5_1",
    190098681,
    "bfdff4894dcb76bbf647d56263ea2a96645423f1669176f4844a1bf8e478ad30",
    700,
    "Accurate English, 60% smaller download (quantised).",
  ),
  entry(
    "small",
    487601967,
    "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
    1000,
    "Accurate, many languages.",
  ),
  entry(
    "small-q5_1",
    190085487,
    "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb",
    700,
    "Accurate, many languages, smaller download (quantised).",
  ),
];

/** Download URL for `info` under `baseUrl` (default Hugging Face, pinned to {@link MODEL_REPO_REVISION}). */
export function modelUrl(info: SpeechModelInfo, baseUrl?: string): string {
  const base = baseUrl ?? `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_REPO_REVISION}`;
  return `${base.replace(/\/+$/, "")}/${info.file}`;
}

/** Install state of one model, from {@link SpeechModelManager.list}. */
export interface SpeechModelStatus extends SpeechModelInfo {
  /** True when the file exists with the exact expected size (the full hash was checked at install time). */
  installed: boolean;
  /** Absolute path where the model is (or will be) stored. */
  path: string;
}

/** Constructor options for {@link SpeechModelManager}. */
export interface SpeechModelManagerOptions {
  /** App data folder; default {@link defaultDataDir}. Models live in `<dataDir>/speech/models`. */
  dataDir?: string;
  /** Replace the download host, e.g. a mirror or a test server; files are fetched from `<baseUrl>/<file>`. */
  baseUrl?: string;
  /** Extra or replacement catalog entries (same `id` replaces). */
  extraModels?: SpeechModelInfo[];
  /** Replacement for the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** Options for {@link SpeechModelManager.install}. */
export interface InstallModelOptions {
  /** Progress while downloading and verifying. */
  onProgress?: (p: DownloadProgress) => void;
  /** Abort to pause; calling `install` again resumes. */
  signal?: AbortSignal;
}

/**
 * Lists, downloads, verifies and removes whisper models in the app data folder.
 *
 * Downloads are resumable and verified against the catalog's SHA-256 before the file appears under
 * its final name, so a model on disk is never half-written.
 */
export class SpeechModelManager {
  private readonly dir: string;
  private readonly catalog: Map<string, SpeechModelInfo>;

  /** Create a manager; nothing is read or created until a method is called. */
  constructor(private readonly opts: SpeechModelManagerOptions = {}) {
    this.dir = modelsDir(opts.dataDir ?? defaultDataDir());
    this.catalog = new Map(SPEECH_MODELS.map((m) => [m.id, m]));
    for (const m of opts.extraModels ?? []) this.catalog.set(m.id, m);
  }

  /** Look up a catalog entry; throws `model-missing` listing the valid ids when `id` is unknown. */
  info(id: string): SpeechModelInfo {
    const m = this.catalog.get(id);
    if (!m) {
      throw new SttError(
        "model-missing",
        `Unknown speech model "${id}". Available: ${[...this.catalog.keys()].join(", ")}.`,
      );
    }
    return m;
  }

  /** Where model `id` is stored (whether or not it is installed). */
  pathOf(id: string): string {
    return join(this.dir, this.info(id).file);
  }

  /** Every catalog model with its install state. */
  async list(): Promise<SpeechModelStatus[]> {
    return Promise.all(
      [...this.catalog.values()].map(async (m) => ({
        ...m,
        path: join(this.dir, m.file),
        installed: await this.isInstalled(m.id),
      })),
    );
  }

  /** True when the model file exists with exactly the catalogued size. */
  async isInstalled(id: string): Promise<boolean> {
    try {
      return (await stat(this.pathOf(id))).size === this.info(id).bytes;
    } catch {
      return false;
    }
  }

  /** Re-hash the installed file and compare with the catalog (about 1 s per 500 MB). False when absent or corrupt. */
  async verify(id: string): Promise<boolean> {
    if (!(await this.isInstalled(id))) return false;
    return (await sha256File(this.pathOf(id))) === this.info(id).sha256;
  }

  /**
   * Download model `id` if it is not installed and return its path. Resumes a partial download,
   * verifies SHA-256 and renames atomically. Errors are {@link SttError}s from `downloadFile`.
   */
  async install(id: string, opts: InstallModelOptions = {}): Promise<string> {
    const info = this.info(id);
    if (await this.isInstalled(id)) return this.pathOf(id);
    return downloadFile(modelUrl(info, this.opts.baseUrl), this.pathOf(id), {
      sha256: info.sha256,
      expectedBytes: info.bytes,
      onProgress: opts.onProgress,
      signal: opts.signal,
      fetchImpl: this.opts.fetchImpl,
    });
  }

  /** Delete model `id` and any partial download of it. Does nothing when absent. */
  async remove(id: string): Promise<void> {
    const path = this.pathOf(id);
    await rm(path, { force: true });
    await rm(`${path}.part`, { force: true });
  }

  /**
   * Pick a sensible model for this machine: `base.en-q5_1` below 4 GB of RAM, `small.en-q5_1` above
   * 8 GB, `base.en` in between. `multilingual` picks the matching many-language model instead.
   */
  recommend(opts: { multilingual?: boolean; totalMemBytes?: number } = {}): string {
    const gb = (opts.totalMemBytes ?? totalmem()) / 1024 ** 3;
    const size = gb < 4 ? "base" : gb > 8 ? "small" : "base";
    const quant = gb < 4 || gb > 8 ? "-q5_1" : "";
    return `${size}${opts.multilingual ? "" : ".en"}${quant}`;
  }
}
