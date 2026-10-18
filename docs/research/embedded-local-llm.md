---
type: Research
title: Embedded local LLM via llama-server
description: Which free, open-weight model and llama.cpp runtime the desktop app could download and run locally for tool-calling video edits, with file names, sizes, licences, flags and pitfalls.
tags: [research, local-llm, llama-cpp, gemma, qwen, tool-calling, models, download]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T19:38:16Z
---

# Research: embedded local LLM via llama-server

Scope: a desktop build downloads a small open-weight model once, runs it with llama.cpp's `llama-server` on `127.0.0.1`, and calls editing tools through the OpenAI-compatible API. Facts were fetched on 2026-10-18 unless marked (unverified) or (secondary). No model was run, so no speed or reliability number here is measured.

## Recommendation

- **Runtime:** llama.cpp `llama-server` (MIT, verified). Pin one release build tag and template the asset name with it. Do not follow "latest". Prefer a build that contains the grammar fix from issue 29089 (PR 29115), if the pinned tag has it (unverified).
- **Default model:** Gemma 4 E4B-it (Apache-2.0, not gated, 128K context, text plus image, audio and video input). Use `gemma-4-E4B-it-Q4_K_M.gguf` from `unsloth/gemma-4-E4B-it-GGUF` (about 4.98 GB). The official `ggml-org` repo has no Q4_K_M; its smallest Q4 is `gemma-4-E4B-it-Q4_0.gguf` (4,590,807,392 bytes).
- **Default for 8 GB machines:** Gemma 4 E2B-it `gemma-4-E2B-it-Q4_K_M.gguf` (3.11 GB, unsloth). Tool-calling quality at this size is unverified.
- **Fallback:** Qwen3-4B-Instruct-2507 `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` (2.5 GB, Apache-2.0, not gated). Smallest fallback: SmolLM3-3B `SmolLM3-Q4_K_M.gguf` (1.92 GB, Apache-2.0).
- **Download:** `https://huggingface.co/<repo>/resolve/<commit-sha>/<file>`, pinned to a commit SHA, with HTTP Range resume into a `.part` file. Verify SHA-256 against the tree API's `lfs.oid` before the rename. No login token is needed for Gemma 4.
- **Caveat:** The default is a hypothesis. The decision rules in [the evaluation plan](../evals/model-evaluation-plan.md) (90% pass rate, 5% or fewer invalid calls, median 30 s or less) decide it. Google's model card recommends temperature 1.0, top_p 0.95, top_k 64, while the eval protocol uses temperature 0. Evals use 0; the product default needs its own test.

## 1. llama.cpp runtime

### Release assets

The releases page lists `bNNNN` build tags, and each release carries the same asset set with its build number in the name. Example set from `b11721` (listed 18 Oct):

| Target | Asset (replace `b11721` with the pinned tag) |
|---|---|
| macOS arm64 | `llama-b11721-bin-macos-arm64.tar.gz` |
| macOS x64 | `llama-b11721-bin-macos-x64.tar.gz` |
| Windows x64, CPU | `llama-b11721-bin-win-cpu-x64.zip` |
| Windows x64, Vulkan | `llama-b11721-bin-win-vulkan-x64.zip` |
| Windows x64, CUDA 12.4 | `llama-b11721-bin-win-cuda-12.4-x64.zip` plus `cudart-llama-bin-win-cuda-12.4-x64.zip` (unzip both into one folder) |
| Windows x64, CUDA 13.4 | `llama-b11721-bin-win-cuda-13.4-x64.zip` plus `cudart-llama-bin-win-cuda-13.4-x64.zip` |
| Linux x64, CPU | `llama-b11721-bin-ubuntu-x64.tar.gz` |
| Linux x64, Vulkan | `llama-b11721-bin-ubuntu-vulkan-x64.tar.gz` |
| Linux x64, CUDA 12.8 | `llama-b11721-bin-ubuntu-cuda-12.8-x64.tar.gz` plus `cudart-llama-b11721-bin-ubuntu-cuda-12.8-x64.tar.gz` |

Naming trap: the Windows CUDA runtime name has no build number (`cudart-llama-bin-win-...`), while the Linux one does (`cudart-llama-b11721-bin-ubuntu-...`). Build each name from a per-platform template.

Notes:
- The `releases/latest` page returned a tag `v0.7.0` dated 15 Oct, which conflicts with the `bNNNN` list (unresolved, unverified). The GitHub API returned 403 to this session, so the asset list comes from HTML pages.
- No Metal-specific macOS file exists in the list. Metal in the arm64 build is assumed (unverified).

### Picking a build at runtime

1. Map OS and CPU architecture to a row above. macOS arm64 and x64 are separate.
2. Windows: if `nvidia-smi` runs, try CUDA; otherwise try Vulkan; otherwise CPU. Linux: Vulkan if a Vulkan loader and ICD exist, else CPU. (Probe logic is a proposal, unverified.)
3. Smoke-test the chosen build (`llama-server --version`), then poll `/health`. On failure, fall back to the CPU asset and record the reason.

### Licence

`LICENSE` in the repo: "MIT License", "Copyright (c) 2023-2026 The ggml authors". Passes the intake policy's permissive gate. The bundled CUDA runtime carries NVIDIA's own terms (unverified, not read).

### Key `llama-server` flags

From the server README (defaults as the docs state them):

| Flag / env | Default | Use in the app |
|---|---|---|
| `--jinja` / `--no-jinja` (`LLAMA_ARG_JINJA`) | "enabled" | Pass `--jinja` explicitly. Tool calling needs it. |
| `-c, --ctx-size N` (`LLAMA_ARG_CTX_SIZE`) | 0 = read from the model | Set explicitly, for example `8192`. |
| `-ngl, --n-gpu-layers N` (`LLAMA_ARG_N_GPU_LAYERS`) | `auto` | `0` for CPU tier; `all` or `auto` on GPU tier. |
| `--port PORT` (`LLAMA_ARG_PORT`) | 9931 | Pass a free port explicitly. |
| `--host HOST` (`LLAMA_ARG_HOST`) | 127.0.0.1 | Keep loopback. |
| `--api-key KEY` (`LLAMA_API_KEY`) | none | Set a random key per launch. Comma-separate for more than one. |
| `-mm, --mmproj FILE` (`LLAMA_ARG_MMPROJ`) | not stated | Needed for image and audio input. The docs say it can be omitted with `-hf`. |
| `--chat-template-file` | none | Override a broken embedded template (see pitfalls). |
| `--grammar` / `--grammar-file` | none | BNF-like grammar. The docs do not say "GBNF". |
| `-j, --json-schema SCHEMA` / `-jf, --json-schema-file FILE` | none | Schema-constrained output. |

Health: `GET /health` (also `/v1/health`) is public and skips the key check. It returns HTTP 503 with `{"error":{"code":503,"message":"Loading model","type":"unavailable_error"}}` while loading, and HTTP 200 with `{"status":"ok"}` when ready.

Structured output: `/v1/chat/completions` accepts `response_format` with `{"type":"json_object"}` or `{"type":"json_schema", ...}`. `/completion` also accepts `json_schema` and `grammar`. Whether `/v1/chat/completions` honours `grammar` is not stated (unverified).

Tool calls: function calling works "when started w/ `--jinja`". Results come back in a `tool_calls` array. In the doc's example `arguments` is a JSON-encoded string, so parse it and validate. The example's field layout (`name` at top level, `finish_reason: "tool"`) differs from the OpenAI shape; check the live response (unverified). Natively handled templates listed: Llama 3.1/3.2/3.3, Functionary v3, Hermes 2/3, Qwen 2.5 (Coder), Mistral Nemo, Command R7B, DeepSeek R1 (WIP), GPT-OSS. Other templates use a "Generic" handler that the docs say is less efficient. Qwen3 is not in that list. The E4B issue log shows a Gemma-4-specific handler (`peg-gemma4`), so newer builds have one.

Sources for the server flags: [server README](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/server/README.md), [function-calling doc](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/docs/function-calling.md).

## 2. Gemma 4

### Family and context

| Model | Parameters (Google page) | Context | Input modalities |
|---|---|---|---|
| E2B | 2B effective | 128K | text, image, video, audio |
| E4B | 4B effective | 128K | text, image, video, audio (audio up to 30 s; video as frames, up to 60 s at 1 fps) |
| 12B "Unified" | 12B | not stated | text, image, video, audio |
| 26B A4B (MoE) | 26B total, 4B active | 256K | text, image, video |
| 31B dense | 31B | 256K | text, image, video |

Secondary sources give "2.3B / 4.5B effective" for E2B and E4B (secondary). The 12B name appears in one secondary source only (unverified).

### Licence

- Hugging Face metadata for `google/gemma-4-E4B-it`: `license: apache-2.0`.
- The "Gemma 4 license" link on Google's docs page points to the Apache License 2.0 text (fetched; the body is the standard Apache text).
- Google's docs page says: "Gemma models are provided with open weights and permit responsible commercial use". The page also says "This documentation is deprecated" and points to another domain (current status unverified).
- Secondary reporting says Gemma 1 to 3n stay under the custom Gemma Terms of Use. Not checked here.

### Gating

`"gated": false` and `"private": false` in the HF API for `google/gemma-4-E4B-it`. No token is needed to download.

### GGUF files

Sizes from the HF tree API, in decimal GB unless the byte count is given.

**`ggml-org/gemma-4-E4B-it-GGUF`** (the repo the llama.cpp docs use):
- `gemma-4-E4B-it-Q4_0.gguf`: 4,590,807,392 bytes; sha256 `a555b900214b477d8880e7832e0b8925e139b0159640036b09fe472b6f2097f2`
- `gemma-4-E4B-it-Q8_0.gguf`: 8,031,242,688 bytes; sha256 `34be82b17b4942d389b9b527170c4b058027abdd32531fda063d3d97dd8ce80a`
- `gemma-4-E4B-it-BF16.gguf`: 15,053,097,408 bytes
- `mmproj-gemma-4-E4B-it-BF16.gguf`: 991,552,256 bytes; sha256 `f77995e4b6a569ab8f0d1bfdb7e8da4a0fa5b9e6f309b9bf3bdb76164d75e29f`
- `mmproj-gemma-4-E4B-it-Q8_0.gguf`: 559,874,816 bytes; sha256 `197f49a93027f9843772bd24a6a9e0be2a32a788de5a3def330e9c585d86edd1`
- `mtp-gemma-4-E4B-it-*.gguf` (59.7 MB to 172 MB): MTP drafter files; purpose not checked (unverified).

The model card's quick start is `llama serve -hf ggml-org/gemma-4-E4B-it-GGUF` and `./llama-server -hf ggml-org/gemma-4-E4B-it-GGUF:BF16`. A community card suggests `--jinja -ngl 99 -c 8192 -fa on` (secondary).

**`unsloth/gemma-4-E4B-it-GGUF`** (has Q4_K_M): `gemma-4-E4B-it-Q4_K_M.gguf` 4.98 GB (default pick); `gemma-4-E4B-it-Q4_K_S.gguf` 4.84 GB; `gemma-4-E4B-it-Q3_K_M.gguf` 4.06 GB; `gemma-4-E4B-it-UD-Q4_K_XL.gguf` 5.13 GB; `gemma-4-E4B-it-Q8_0.gguf` 8.19 GB. mmproj: `mmproj-BF16.gguf` 992 MB, `mmproj-F16.gguf` 990 MB, `mmproj-F32.gguf` 1.91 GB.

**`bartowski/google_gemma-4-E4B-it-GGUF`**: `google_gemma-4-E4B-it-Q4_K_M.gguf` 5.41 GB, `google_gemma-4-E4B-it-Q8_0.gguf` 8.03 GB; mmproj `mmproj-google_gemma-4-E4B-it-bf16.gguf` 992 MB.

**`ggml-org/gemma-4-E2B-it-GGUF`**: `gemma-4-E2B-it-Q4_0.gguf` 2.84 GB, `gemma-4-E2B-it-Q8_0.gguf` 4.97 GB; mmproj `mmproj-gemma-4-E2B-it-Q8_0.gguf` 557 MB, BF16 987 MB.

**`unsloth/gemma-4-E2B-it-GGUF`**: `gemma-4-E2B-it-Q4_K_M.gguf` 3.11 GB, `gemma-4-E2B-it-Q4_K_S.gguf` 3.04 GB, `gemma-4-E2B-it-Q3_K_M.gguf` 2.54 GB, `gemma-4-E2B-it-UD-Q4_K_XL.gguf` 3.18 GB; mmproj `mmproj-BF16.gguf` 987 MB, `mmproj-F16.gguf` 986 MB.

Unsloth's and bartowski's sizes differ at the same quant level because the tensor mixes differ. Read the tree API before download.

### Multimodal

Image, audio and video input need the mmproj file via `-mm`/`--mmproj`. Text-only works without it. Whether each repo's mmproj matches the chat-template version is unverified.

### Tool-calling quality by size

No source gave a per-size tool-calling score for Gemma 4. Llama.cpp issues are the best signal (all from the GitHub issue pages, fetched):

- **Issue 29089** (closed, E2B Q4): under `tool_choice: required`, the PEG-to-GBNF `until()` rule left Gemma 4 tool-call arguments effectively unconstrained, so a stray `]` passed the grammar. The fix is PR 29115; the page says "Closed" and does not say "merged" (unverified).
- **Issue 29655** (open, opened 29 Sep 2026, 26B MoE, Vulkan, build 11258): with multi-line arguments, calls were emitted before their arguments finished streaming, so arguments were truncated or malformed. No flags or template were reported. A maintainer is revising the parser in PR 29307. The thread notes that a restart cleared the looping behaviour (unverified cause).
- **Issue 22786** (closed as `bug-unconfirmed`, E4B Q8_0 and BF16, build 8919, CUDA): the model emitted `<|tool_call>call:CommitMemoryTool{...}<tool_call|>` and the server returned it as plain content. The log warns that `<|tool_response>` "was not control-type; this is probably a bug in the model". No fix PR found.
- **Issue 29391** (open): `llama-server` aborts on `GGML_ASSERT` after "bad allocation" with Gemma 4 31B. A crash, not a tool-call bug.
- Secondary: an April 2026 setup guide (about 26B) reports bash, read and write tool calls working on a recent main build with `--jinja`. A July 2026 article says the first Gemma 4 GGUFs shipped a faulty chat template that broke tool calling (secondary; check the current repo).

Sources: [Gemma 4 E4B model card](https://huggingface.co/google/gemma-4-E4B-it), [Google Gemma docs](https://ai.google.dev/gemma/docs/core), [Apache text](https://ai.google.dev/gemma/apache_2), [llama.cpp issue 22786](https://github.com/ggml-org/llama.cpp/issues/22786), [issue 29089](https://github.com/ggml-org/llama.cpp/issues/29089), [issue 29655](https://github.com/ggml-org/llama.cpp/issues/29655), [issue list](https://github.com/ggml-org/llama.cpp/issues?q=is%3Aissue+gemma+4+tool+call).

## 3. Alternatives at 4B and under

Licence and gating are from the HF API; sizes from the tree listing. Tool-calling numbers are secondary.

| Model (GGUF repo) | Licence (HF) | Gated | Q4_K_M file | Size | Tool-calling evidence |
|---|---|---|---|---|---|
| Qwen3-4B-Instruct-2507 (`unsloth/Qwen3-4B-Instruct-2507-GGUF`) | apache-2.0 | no | `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` | 2.5 GB | Secondary (TinyLLM preprint): BFCL overall 62.04% in prompt mode, live 75.52%, multi-turn 35.25%. A separate paper reports about 96% on one non-live parallel category for the thinking variant. |
| SmolLM3-3B (`ggml-org/SmolLM3-3B-GGUF`) | apache-2.0 | no | `SmolLM3-Q4_K_M.gguf` | 1.92 GB | Secondary: claims BFCL parity with a Llama tool-call fine-tune (92.3), unverified. Supports JSON/XML (`xml_tools`) and Python-style (`python_tools`) call formats. |
| Llama-3.2-3B-Instruct (`unsloth/Llama-3.2-3B-Instruct-GGUF`) | llama3.2 (Llama 3.2 Community License, not OSI; text not read) | no | `Llama-3.2-3B-Instruct-Q4_K_M.gguf` | 2.02 GB | No BFCL figure found. Has a native template in llama.cpp. |
| Granite 4.0 Micro (`ibm-granite/granite-4.0-micro-gguf`) | apache-2.0 | no | `granite-4.0-micro-Q4_K_M.gguf` | 2.1 GB | None gathered (unverified). |
| Phi-4-mini-instruct (`unsloth/Phi-4-mini-instruct-GGUF`) | mit | no | `Phi-4-mini-instruct-Q4_K_M.gguf` | 2.49 GB | None gathered (unverified). |

Serving detail matters: one paper ran Llama 3.2 with the `llama3_json` and `pythonic` parsers and Qwen3 with `hermes`, so parser choice moves scores (secondary). Qwen3 falls to the "Generic" handler in the llama.cpp list above unless newer builds added one (unverified).

Sources: [SmolLM3 repo](https://huggingface.co/ggml-org/SmolLM3-3B-GGUF/tree/main), [Qwen3 repo](https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/tree/main), [Llama 3.2 repo](https://huggingface.co/unsloth/Llama-3.2-3B-Instruct-GGUF/tree/main), [Granite repo](https://huggingface.co/ibm-granite/granite-4.0-micro-gguf/tree/main), [Phi-4-mini repo](https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF/tree/main), TinyLLM preprint (https://arxiv.org/pdf/2511.22138, search snippet only).

## 4. Speed, RAM and hardware tiers

### Speed

No rigorous llama-server benchmark for these models was found. Figures from informal guides (secondary, unverified for our setup):

- Gemma 4 E2B Q4 generation via Ollama (which wraps llama.cpp): about 26 tok/s on an i5-12400 with DDR4-3200, about 40 on an i7-13700K with DDR5-5600, about 44 on a Ryzen 7 7700X with DDR5-6000, quoted as plus or minus 20%.
- A different guide gives E4B 5 to 10 tok/s and E2B 30 to 50 tok/s at Q4 on the same CPU class. The gap is wider than the size difference explains, so treat both with caution.
- Older laptops: a 3B Q4 about 20 tok/s and a 7B Q4 about 8 tok/s on a dual-channel DDR4 i7 (InsiderLLM table); a 4B Q4_K_M about 4 tok/s on an older i5 (It's FOSS). Generation scales roughly with memory bandwidth.
- Prompt-processing speed was not found. For a tool loop with a long transcript it matters most and must be measured.

Measure on the target machine with `llama-bench` against the exact GGUF and thread count, and compare with `llama-server`'s timing output.

### RAM

Proposal (unverified): RAM needed ≈ GGUF file size + KV cache for the chosen context + 1 to 2 GB runtime. At 8K context a 5 GB Q4 model on an 8 GB machine is tight; a 2.5 to 3.1 GB model fits comfortably.

### Tiers (from [the evaluation plan](../evals/model-evaluation-plan.md))

| Tier | Hardware | Candidate |
|---|---|---|
| A | 8 GB RAM, CPU only | Gemma 4 E2B Q4_K_M (3.11 GB), or Qwen3-4B Q4_K_M (2.5 GB), or SmolLM3 Q4_K_M (1.92 GB) |
| B | 16 GB RAM, CPU or iGPU | Gemma 4 E4B Q4_K_M (4.98 GB) |
| C | discrete GPU, 8 GB or more VRAM | Gemma 4 E4B Q8_0 (8.19 GB), or a larger model if the eval finds it helpful (unverified) |

### Auto-pick (proposal)

1. Read total RAM and, if present, VRAM.
2. Choose the largest candidate whose file size + 2 GB ≤ 60% of available memory (VRAM when offloading with `-ngl`).
3. Run a short warmup. If generation is under about 5 tok/s, step down one tier and record the choice.

These thresholds are not measured. They belong in an ADR once the eval runs.

## 5. Download

- **URL:** `https://huggingface.co/<repo>/resolve/<revision>/<file>`. Pin `<revision>` to a commit SHA, not `main`, so a re-upload cannot change the bytes under a shipped version.
- **Resume:** send `Range: bytes=<n>-` to a partial `.part` file and append. Standard HTTP; HF's support for it is unverified here.
- **Verify:** the tree API's `lfs.oid` is the SHA-256 of the file (git-lfs spec; the value was read from the API). Compare before renaming `.part` to the final name.
- **Gating:** Gemma 4 repos are `gated: false`. Earlier Gemma releases were gated (secondary, unverified). Map a 401/403 to a clear "accept the licence" message anyway.
- **Disk locations (proposal; Tauri path conventions unverified):** Windows `%LOCALAPPDATA%\<app>\models\` (local, not roaming, because files are several GB); macOS `~/Library/Application Support/<app>/models/`; Linux `$XDG_DATA_HOME/<app>/models/`, default `~/.local/share/<app>/models/`. Keep the runtime under `runtime/<build-tag>/` so a new build never overwrites a working one.

## 6. Making small models reliable at tool calling

- **Constrained decoding** (`json_schema` or `--grammar`): guarantees parseable, schema-valid arguments. It does not guarantee the right tool or values. Issue 29089 shows the grammar can be effectively unconstrained under `tool_choice: required` in some builds, so test the constraint itself.
- **Fewer, coarser tools.** The eval plan already does this (`remove_silences`, `cut_by_transcript`). Expected, not measured.
- **Short descriptions, enum parameters, few optional parameters** (common practice, unverified).
- **Validate, then retry with the error.** Parse `arguments`, validate against the schema, return the error as the tool result, and allow a bounded retry (two). Matches the eval plan's "failures are returned to the model as clear errors".
- **Plan then act.** A first turn emits a short plan of tool names; the next executes. Or restrict the tool set per step (unverified benefit).
- **Keep multi-turn short.** Secondary evidence: Qwen3-4B's BFCL multi-turn accuracy (about 35%) is far below its live score (about 75%) (TinyLLM preprint, search snippet). Trim tool results and summarise old turns.
- **Strip thinking from history.** The Gemma 4 card says to drop earlier thinking, except in tool-call turns where it is kept.
- **Pin the chat template.** The template decides the tool-call format. Use `--jinja` and, if a template is broken, `--chat-template-file` with a reviewed copy in the repo.
- **Keep the KV cache at full precision.** llama.cpp warns that extreme KV quantization such as `-ctk q4_0` "can substantially degrade" output.

## Pitfalls and fixes

1. **Broken or changed GGUF files.** Secondary reports say the first Gemma 4 GGUFs had a faulty template and that some July files would not load in LM Studio. Fix: pin revision and SHA-256, run a tool-calling probe on each file before shipping, and keep a known-good list in the repo.
2. **Tool calls lost or malformed.** Issue 22786 returned a well-formed call as `content`; issue 29089 left the grammar unconstrained under `tool_choice: required`; issue 29655 emitted calls before arguments finished streaming. Fix: pin the build, use `--jinja`, do not stream tool-turn arguments without waiting for complete JSON, validate every call, treat tool-call markup in `content` as invalid and retry once, and add a startup probe that sends a one-tool request and asserts a non-empty `tool_calls`.
3. **Silent loss in a wrapper.** A secondary report says an Ollama build dropped Gemma 4 tool responses. The app does not use Ollama, but any proxy in the path has the same failure class (no error, no tool call). Fix: no wrapper between the app and `llama-server`; log raw responses in the eval.
4. **Release asset names that differ per platform.** The build number appears in most names but not in the Windows CUDA runtime name, and the `latest` page disagreed with the `bNNNN` list. Fix: per-platform name templates, a pinned tag, and a HEAD check on each URL in the release job.
5. **Sampling settings that disagree.** Google recommends temperature 1.0, top_p 0.95, top_k 64; the eval protocol uses temperature 0. A model can look worse under the other setting. Fix: report both in the eval results, and record the product default in an ADR.

## Open questions (not answered here)

- Do Gemma 4 E2B or E4B reach 90% on the core suite at temperature 0 on a pinned build that has the grammar fix?
- Real prompt-processing and generation speeds on tier A and tier B hardware.

## Sources

Fetched on 2026-10-18:

- llama.cpp: [server README](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/server/README.md), [function-calling doc](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/docs/function-calling.md), [LICENSE](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/LICENSE), [releases](https://github.com/ggml-org/llama.cpp/releases), [releases/latest](https://github.com/ggml-org/llama.cpp/releases/latest) (conflicting `v0.7.0`), issues [22786](https://github.com/ggml-org/llama.cpp/issues/22786), [29089](https://github.com/ggml-org/llama.cpp/issues/29089), [29655](https://github.com/ggml-org/llama.cpp/issues/29655), [issue list](https://github.com/ggml-org/llama.cpp/issues?q=is%3Aissue+gemma+4+tool+call)
- Google: [Gemma 4 E4B-it model card](https://huggingface.co/google/gemma-4-E4B-it), [HF API for it](https://huggingface.co/api/models/google/gemma-4-E4B-it), [Gemma docs](https://ai.google.dev/gemma/docs/core), [Apache text](https://ai.google.dev/gemma/apache_2)
- GGUF repos (tree and HF API): [ggml-org E4B](https://huggingface.co/ggml-org/gemma-4-E4B-it-GGUF), [ggml-org E2B](https://huggingface.co/ggml-org/gemma-4-E2B-it-GGUF/tree/main), [unsloth E4B](https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/tree/main), [unsloth E2B](https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/tree/main), [bartowski E4B](https://huggingface.co/bartowski/google_gemma-4-E4B-it-GGUF/tree/main), [Qwen3-4B-Instruct-2507](https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/tree/main), [SmolLM3-3B](https://huggingface.co/ggml-org/SmolLM3-3B-GGUF/tree/main), [Llama-3.2-3B](https://huggingface.co/unsloth/Llama-3.2-3B-Instruct-GGUF/tree/main), [Granite 4.0 Micro](https://huggingface.co/ibm-granite/granite-4.0-micro-gguf/tree/main), [Phi-4-mini](https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF/tree/main)
- Hacker News search via Algolia returned no hits for the query. Reddit could not be fetched or searched from this session.

Search results only (not opened):

- [TinyLLM preprint](https://arxiv.org/pdf/2511.22138), [small reasoning models in function calling](https://arxiv.org/pdf/2608.22472), [Gemma 4 CLI setup guide](https://codex.danielvaughan.com/2026/04/10/gemma-4-local-model-codex-cli-setup-guide), [HF forum: Gemma 4 bug fixes](https://discuss.huggingface.co/t/gemma-4-bug-fixes-and-research-request/176979), [KDnuggets: small models for tool calling](https://www.kdnuggets.com/5-small-language-models-for-agentic-tool-calling), [InsiderLLM: CPU-only LLMs](https://insiderllm.com/pdfs/cpu-only-llms-what-actually-works.pdf)
