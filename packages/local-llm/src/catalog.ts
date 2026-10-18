/**
 * The curated list of models the app may offer, and the rule that picks one for a machine.
 *
 * Every entry was checked against the Hugging Face API and a HEAD request (size and SHA-256 come
 * from the file's LFS metadata, URLs are pinned to a commit so the hash can never drift). Only
 * models whose licence permits commercial use and redistribution are listed. Re-run
 * `pnpm --filter @dax/local-llm catalog:verify` (needs network) after editing this file.
 * Pure data and pure functions; no I/O.
 */

import { UnsupportedError } from "./errors.js";
import type { HardwareInfo } from "./hardware.js";

const GiB = 1024 ** 3;

/** How the machine's RAM maps to a model size class. */
export type RamTier = "tiny" | "small" | "medium" | "large";

/** One downloadable model file plus everything needed to show it, verify it and run it. */
export interface ModelEntry {
  /** Stable id used in settings and on disk; lower-case, `[a-z0-9._-]`. */
  id: string;
  /** Human readable name for the UI. */
  name: string;
  /** Model family, for grouping. */
  family: "gemma" | "qwen";
  /** Parameter description as published, e.g. `2.3B effective (5.1B with embeddings)`. */
  parameters: string;
  /** Quantization of the file, e.g. `Q4_0 (quantization-aware trained)`. */
  quantization: string;
  /** Where the bytes come from. */
  source: {
    /** Hugging Face repository id. */
    repo: string;
    /** File name inside the repository. */
    file: string;
    /** Full commit hash the URL is pinned to. */
    revision: string;
  };
  /** Direct download URL (HTTPS, pinned to `source.revision`). */
  url: string;
  /** Size of the file in bytes, from the repository's LFS metadata. */
  sizeBytes: number;
  /** Lower-case hex SHA-256 of the file, from the repository's LFS metadata. */
  sha256: string;
  /** Licence evidence. */
  license: {
    /** SPDX identifier. */
    spdx: "Apache-2.0";
    /** Where the licence text lives. */
    url: string;
    /** Exact words from the model card that state the licence. */
    quote: string;
    /** Commercial use and redistribution are allowed (the catalog rule; always `true`). */
    commercialUseAndRedistribution: true;
  };
  /** The context window the model was trained for, in tokens. */
  maxContextTokens: number;
  /** Context size passed to llama-server by default (`-c`); smaller than the maximum to save RAM. */
  contextTokens: number;
  /** RAM below which running this model is not advised, in bytes (file + KV cache + OS headroom). */
  minRamBytes: number;
  /** What the publisher says about tool calling and what we observed. */
  toolCalling: {
    /** `native` means the chat template has built-in tool-call support used through `--jinja`. */
    support: "native";
    /** Free-text notes for people choosing or debugging a model. */
    notes: string;
  };
  /** Whether the model has a thinking mode that costs extra tokens (we turn it off by default). */
  hasThinkingMode: boolean;
  /** Size class this entry is the automatic recommendation for, if any. */
  recommendedFor?: RamTier;
  /** Id of a model from a different family to try when this one misbehaves. */
  fallbackId?: string;
  /** One line shown in the UI. */
  summary: string;
}

function hf(repo: string, revision: string, file: string): string {
  return `https://huggingface.co/${repo}/resolve/${revision}/${file}`;
}

const GEMMA_LICENSE = {
  spdx: "Apache-2.0",
  url: "https://ai.google.dev/gemma/docs/gemma_4_license",
  quote: 'license: apache-2.0 (card front matter); card header: "License: Apache 2.0"',
  commercialUseAndRedistribution: true,
} as const;

const QWEN_LICENSE = {
  spdx: "Apache-2.0",
  url: "https://huggingface.co/Qwen/Qwen3.5-2B/blob/main/LICENSE",
  quote:
    'license: apache-2.0, license_link: .../LICENSE (card front matter); LICENSE text: "Apache License Version 2.0, January 2004"',
  commercialUseAndRedistribution: true,
} as const;

/**
 * All models the app can install, smallest first. Ids are unique and every URL is HTTPS.
 * The tested, recommended default is {@link DEFAULT_MODEL_ID}.
 */
export const MODEL_CATALOG: readonly ModelEntry[] = [
  {
    id: "qwen3.5-2b-q4km",
    name: "Qwen3.5 2B (basic)",
    family: "qwen",
    parameters: "2B",
    quantization: "Q4_K_M",
    source: {
      repo: "unsloth/Qwen3.5-2B-GGUF",
      file: "Qwen3.5-2B-Q4_K_M.gguf",
      revision: "f6d5376be1edb4d416d56da11e5397a961aca8ae",
    },
    url: hf(
      "unsloth/Qwen3.5-2B-GGUF",
      "f6d5376be1edb4d416d56da11e5397a961aca8ae",
      "Qwen3.5-2B-Q4_K_M.gguf",
    ),
    sizeBytes: 1_280_835_840,
    sha256: "aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223",
    license: QWEN_LICENSE,
    maxContextTokens: 262_144,
    contextTokens: 16_384,
    minRamBytes: 3.5 * GiB,
    toolCalling: {
      support: "native",
      notes:
        'Model card: "Qwen3.5 excels in tool calling capabilities." Non-thinking mode is the default for this size; the card warns the 2B model is prone to thinking loops when thinking is enabled, so we keep it off.',
    },
    hasThinkingMode: true,
    recommendedFor: "tiny",
    fallbackId: "gemma-4-e2b-qat-q4_0",
    summary: "Smallest option for machines with 4 to 6 GB of RAM. Basic edits only.",
  },
  {
    id: "gemma-4-e2b-qat-q4_0",
    name: "Gemma 4 E2B (recommended)",
    family: "gemma",
    parameters: "2.3B effective (5.1B with embeddings)",
    quantization: "Q4_0 (quantization-aware trained, published by Google)",
    source: {
      repo: "google/gemma-4-E2B-it-qat-q4_0-gguf",
      file: "gemma-4-E2B_q4_0-it.gguf",
      revision: "675cff42a74c774d6cb76f76d8eacb49b48c9b93",
    },
    url: hf(
      "google/gemma-4-E2B-it-qat-q4_0-gguf",
      "675cff42a74c774d6cb76f76d8eacb49b48c9b93",
      "gemma-4-E2B_q4_0-it.gguf",
    ),
    sizeBytes: 3_349_516_256,
    sha256: "fa401b55b07ee70a54c6dae3903c783a6e65064312529ea57175cb5f8dec6634",
    license: GEMMA_LICENSE,
    maxContextTokens: 131_072,
    contextTokens: 16_384,
    minRamBytes: 6 * GiB,
    toolCalling: {
      support: "native",
      notes:
        'Model card: "Function Calling: Native support for structured tool use, enabling agentic workflows." The card reports a Tau2 agentic score of 24.5% for E2B vs 42.2% for E4B, so expect more invalid calls than the larger sizes; the agent layer must validate and retry.',
    },
    hasThinkingMode: true,
    recommendedFor: "small",
    fallbackId: "qwen3.5-4b-q4km",
    summary: "Default. Good balance of size (3.3 GB) and tool use for 8 GB machines.",
  },
  {
    id: "qwen3.5-4b-q4km",
    name: "Qwen3.5 4B",
    family: "qwen",
    parameters: "4B",
    quantization: "Q4_K_M",
    source: {
      repo: "unsloth/Qwen3.5-4B-GGUF",
      file: "Qwen3.5-4B-Q4_K_M.gguf",
      revision: "e87f176479d0855a907a41277aca2f8ee7a09523",
    },
    url: hf(
      "unsloth/Qwen3.5-4B-GGUF",
      "e87f176479d0855a907a41277aca2f8ee7a09523",
      "Qwen3.5-4B-Q4_K_M.gguf",
    ),
    sizeBytes: 2_740_937_888,
    sha256: "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4",
    license: {
      ...QWEN_LICENSE,
      url: "https://huggingface.co/Qwen/Qwen3.5-4B/blob/main/LICENSE",
    },
    maxContextTokens: 262_144,
    contextTokens: 16_384,
    minRamBytes: 5.5 * GiB,
    toolCalling: {
      support: "native",
      notes:
        'Same Qwen3.5 tool-calling template as the 2B model ("Qwen3.5 excels in tool calling capabilities"). Used as the non-Gemma fallback for 8 GB and larger machines.',
    },
    hasThinkingMode: true,
    fallbackId: "gemma-4-e2b-qat-q4_0",
    summary: "Fallback from a different model family, 2.7 GB.",
  },
  {
    id: "gemma-4-e4b-qat-q4_0",
    name: "Gemma 4 E4B",
    family: "gemma",
    parameters: "4.5B effective (8B with embeddings)",
    quantization: "Q4_0 (quantization-aware trained, published by Google)",
    source: {
      repo: "google/gemma-4-E4B-it-qat-q4_0-gguf",
      file: "gemma-4-E4B_q4_0-it.gguf",
      revision: "4b4a2c1d584be7264f87aac328a1bc739ce81b6c",
    },
    url: hf(
      "google/gemma-4-E4B-it-qat-q4_0-gguf",
      "4b4a2c1d584be7264f87aac328a1bc739ce81b6c",
      "gemma-4-E4B_q4_0-it.gguf",
    ),
    sizeBytes: 5_154_941_280,
    sha256: "676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee",
    license: GEMMA_LICENSE,
    maxContextTokens: 131_072,
    contextTokens: 16_384,
    minRamBytes: 10 * GiB,
    toolCalling: {
      support: "native",
      notes:
        'Model card: "Function Calling: Native support for structured tool use". Card Tau2 score 42.2% (E2B: 24.5%), the best small Gemma for reliable tool calls on a 16 GB laptop.',
    },
    hasThinkingMode: true,
    recommendedFor: "medium",
    fallbackId: "qwen3.5-4b-q4km",
    summary: "Better tool use for 16 GB machines, 5.2 GB download.",
  },
  {
    id: "gemma-4-12b-qat-q4_0",
    name: "Gemma 4 12B",
    family: "gemma",
    parameters: "11.95B",
    quantization: "Q4_0 (quantization-aware trained, published by Google)",
    source: {
      repo: "google/gemma-4-12B-it-qat-q4_0-gguf",
      file: "gemma-4-12b-it-qat-q4_0.gguf",
      revision: "29d097773436b69ff9feafd636ab4cf873786537",
    },
    url: hf(
      "google/gemma-4-12B-it-qat-q4_0-gguf",
      "29d097773436b69ff9feafd636ab4cf873786537",
      "gemma-4-12b-it-qat-q4_0.gguf",
    ),
    sizeBytes: 6_975_879_296,
    sha256: "93567e57a8fe10b23569b9d9ec38cd005deedf71e29477c421a4b83f418a538b",
    license: GEMMA_LICENSE,
    maxContextTokens: 262_144,
    contextTokens: 16_384,
    minRamBytes: 14 * GiB,
    toolCalling: {
      support: "native",
      notes:
        "Native function calling like the other Gemma 4 sizes; card Tau2 score 69.0%. Slow on CPU alone (dense 12B): recommended only with Apple Silicon or a discrete GPU. Not run in our sandbox.",
    },
    hasThinkingMode: true,
    recommendedFor: "large",
    fallbackId: "gemma-4-e4b-qat-q4_0",
    summary: "Strongest reliable tool use; wants a GPU or Apple Silicon and 24 GB or more.",
  },
  {
    id: "gemma-4-26b-a4b-qat-q4_0",
    name: "Gemma 4 26B A4B (mixture of experts)",
    family: "gemma",
    parameters: "25.2B total, 3.8B active",
    quantization: "Q4_0 (quantization-aware trained, published by Google)",
    source: {
      repo: "google/gemma-4-26B-A4B-it-qat-q4_0-gguf",
      file: "gemma-4-26B_q4_0-it.gguf",
      revision: "d1c082be9cf3c8a514acf63b8761f4b41935842e",
    },
    url: hf(
      "google/gemma-4-26B-A4B-it-qat-q4_0-gguf",
      "d1c082be9cf3c8a514acf63b8761f4b41935842e",
      "gemma-4-26B_q4_0-it.gguf",
    ),
    sizeBytes: 14_439_363_584,
    sha256: "3eca3b8f6d7baf218a7dd6bba5fb59a56ee25fe2d567b6f5f589b4f697eca51d",
    license: GEMMA_LICENSE,
    maxContextTokens: 262_144,
    contextTokens: 16_384,
    minRamBytes: 20 * GiB,
    toolCalling: {
      support: "native",
      notes:
        "Native function calling; card Tau2 score 68.2%. Only 3.8B parameters are active per token so it runs faster than its size suggests, but the download is 14.4 GB. Offered manually, never auto-recommended. Not run in our sandbox.",
    },
    hasThinkingMode: true,
    fallbackId: "gemma-4-e4b-qat-q4_0",
    summary: "Advanced: 14.4 GB download, needs 24 GB or more of RAM.",
  },
];

/** Id of the model installed when the user just presses "download": the Gemma 4 E2B. */
export const DEFAULT_MODEL_ID = "gemma-4-e2b-qat-q4_0";

/**
 * Look up a catalog entry.
 * @throws UnsupportedError when `id` is not in `catalog`.
 */
export function getModel(id: string, catalog: readonly ModelEntry[] = MODEL_CATALOG): ModelEntry {
  const found = catalog.find((m) => m.id === id);
  if (!found) {
    throw new UnsupportedError(
      `Unknown model "${id}". Known ids: ${catalog.map((m) => m.id).join(", ")}`,
    );
  }
  return found;
}

/**
 * Map total RAM to a size class. Boundaries sit below the nominal sizes because the OS reports
 * slightly less than the marketing number (an "8 GB" laptop shows about 7.6 GiB).
 */
export function ramTierFor(totalMemBytes: number): RamTier {
  if (totalMemBytes < 6 * GiB) return "tiny";
  if (totalMemBytes < 12 * GiB) return "small";
  if (totalMemBytes < 28 * GiB) return "medium";
  return "large";
}

/** The answer of {@link recommendModel}. */
export interface ModelRecommendation {
  /** The model to offer first. */
  model: ModelEntry;
  /** A model from another family to offer if `model` does not work well, when one fits. */
  fallback?: ModelEntry;
  /** The size class that was detected. */
  tier: RamTier;
  /** False when even the smallest catalog model is below its advised minimum RAM. */
  fits: boolean;
  /** One sentence explaining the choice, suitable for the UI. */
  reason: string;
}

/**
 * Choose a model for this machine by RAM tier.
 *
 * - `tiny` (under 6 GiB): Qwen3.5 2B. `small` (6 to 12 GiB): Gemma 4 E2B, the default.
 *   `medium` (12 to 28 GiB): Gemma 4 E4B.
 * - `large` (28 GiB and up) gets the dense 12B only with Apple Silicon or a discrete GPU with at
 *   least 8 GiB of memory; on CPU alone it stays on E4B because a dense 12B is too slow to chat with.
 * - Never recommends a model whose `minRamBytes` exceeds the machine's RAM; steps down instead.
 */
export function recommendModel(
  hardware: Pick<HardwareInfo, "totalMemBytes" | "appleSilicon" | "gpus">,
  catalog: readonly ModelEntry[] = MODEL_CATALOG,
): ModelRecommendation {
  const tier = ramTierFor(hardware.totalMemBytes);
  const fastHardware =
    hardware.appleSilicon || hardware.gpus.some((g) => g.discrete && (g.vramBytes ?? 0) >= 8 * GiB);
  const order: RamTier[] = ["large", "medium", "small", "tiny"];
  const startAt = tier === "large" && !fastHardware ? "medium" : tier;
  const candidates = order.slice(order.indexOf(startAt));
  let chosen: ModelEntry | undefined;
  for (const t of candidates) {
    const entry = catalog.find((m) => m.recommendedFor === t);
    if (entry && entry.minRamBytes <= hardware.totalMemBytes) {
      chosen = entry;
      break;
    }
  }
  const smallest = [...catalog].sort((a, b) => a.sizeBytes - b.sizeBytes)[0];
  if (!chosen && !smallest) throw new UnsupportedError("The model catalog is empty");
  const model = chosen ?? (smallest as ModelEntry);
  const fits = model.minRamBytes <= hardware.totalMemBytes;
  const fallback = model.fallbackId
    ? catalog.find((m) => m.id === model.fallbackId && m.minRamBytes <= hardware.totalMemBytes)
    : undefined;
  const gib = (hardware.totalMemBytes / GiB).toFixed(1);
  const reason = fits
    ? `${model.name} is the best fit for ${gib} GB of RAM (${tier} tier).`
    : `This computer has only ${gib} GB of RAM; ${model.name} is the smallest option and may be slow.`;
  return { model, ...(fallback ? { fallback } : {}), tier, fits, reason };
}
