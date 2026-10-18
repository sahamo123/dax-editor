---
type: Research
title: Local speech-to-text with word timestamps
description: "Options for an offline, cross-platform speech-to-text step that returns word-level timestamps for transcript display, captions and filler or silence cuts, with the flags, model URLs and pitfalls checked against primary sources where possible."
tags: [research, speech-to-text, whisper, whisper-cpp, word-timestamps, filler-words, transcript, licensing]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T19:40:00Z
---

# Local speech-to-text with word timestamps

Scope: a free (Apache-2.0-compatible) local transcriber that ships with the desktop app, returns word start and end times, and supports cutting "um", "uh" and silences. Consumers: the `Transcriber` interface in `packages/core/src/transcript.ts` (returns a `Transcript` of `Word`s in source-time seconds) and the cut engine in `packages/core/src/cuts.ts`.

Items marked **(unverified)** were not confirmed from a fetched primary source. Items marked **(search snippet)** came from a search result only.

## Recommendation

1. **Default: whisper.cpp (MIT code, MIT weights), `whisper-cli`, with a quantized model** (`ggml-base.en-q5_1.bin` for English, `ggml-small-q5_1.bin` for multilingual). It runs on CPU, supports word-level output through `-ojf -ml 1 -sow`, and has Silero VAD (separate model file). Quantized files are small (57 and 181 MiB).
2. **Bundle the binary per OS, built in CI with CMake.** A v1.9.5 release exists, but its asset list was not readable, so do not depend on an official prebuilt CLI until checked (section 1).
3. **Fallback: sherpa-onnx (Apache-2.0)** with a Parakeet-TDT model (CC-BY-4.0 weights, English among 25 languages). Its word-timing output is not verified for the sherpa-onnx path; test on a fixture before relying on it for cuts.
4. **Do not use** the normalised output of Whisper's English normaliser for filler detection. It strips `um`, `uh`, `hmm`, `mm` (section 3). Filler words need a second signal.
5. **Set our own VAD and no-speech values;** do not inherit library defaults (see `docs/research/cut-intelligence.md`, section 2).
6. **Do not bundle CrisperWhisper** (verbatim fillers, the best-known fit for this need) without a licence decision: its licence is CC-BY-NC-4.0, which is non-commercial.

## 1. whisper.cpp

Sources: [whisper.cpp README](https://github.com/ggml-org/whisper.cpp/blob/master/README.md), [examples/cli README](https://github.com/ggml-org/whisper.cpp/blob/master/examples/cli/README.md), [cli.cpp](https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/examples/cli/cli.cpp), [releases](https://github.com/ggml-org/whisper.cpp/releases), [ggerganov/whisper.cpp model repo](https://huggingface.co/ggerganov/whisper.cpp).

**Binary and build (verified from README).** The CLI is `whisper-cli`, built to `./build/bin/whisper-cli`:

```sh
cmake -B build
cmake --build build -j --config Release
./build/bin/whisper-cli -f samples/jfk.wav
```

**Prebuilt binaries (unverified).** The releases page lists tags up to v1.9.5 (marked Latest, 2 assets). The fetched page did not show the asset names, so a Windows, macOS or Linux CLI zip is not confirmed. The README lists an XCFramework zip (iOS, visionOS, tvOS, macOS), Docker images (`ghcr.io/ggml-org/whisper.cpp:main`, `main-cuda`, `main-musa`, `main-vulkan`) and Conan packages. Check the v1.9.5 asset list directly, or build per OS in CI.

**Input (verified from README).** `whisper-cli` "currently runs only with 16-bit WAV files." Convert with:

```sh
ffmpeg -i input.mp4 -ar 16000 -ac 1 -c:a pcm_s16le output.wav
```

For video input, add `-vn` so ffmpeg drops the video stream (standard ffmpeg flag, not in the README command).

**Output and timing flags (verified from examples/cli README and cli.cpp):**

| Flag | Default | Meaning |
|---|---|---|
| `-oj` / `--output-json` | false | write JSON next to the input or to `-of` |
| `-ojf` / `--output-json-full` | false | JSON plus a `tokens` array per segment; turns on JSON output |
| `-of FNAME` / `--output-file FNAME` | empty | output path without extension |
| `-ml N` / `--max-len N` | 0 | max segment length in characters; above 0 also enables token timestamps |
| `-sow` / `--split-on-word` | false | split on words instead of tokens |
| `-wt N` / `--word-thold N` | 0.01 | word timestamp threshold |
| `-nth N` / `--no-speech-thold N` | 0.60 | no-speech probability threshold |
| `-nf` / `--no-fallback` | false | disable temperature fallback |
| `-tp N` / `--temperature N` | 0.00 | starting temperature |
| `-tpi N` / `--temperature-inc N` | 0.20 | temperature step on fallback |
| `--prompt PROMPT` | empty | initial prompt, at most n_text_ctx/2 tokens |
| `-ng` / `--no-gpu` | GPU on | disable GPU; `-dev N` selects the device |
| `-ps` / `--print-special` | false | print special tokens |
| `-dtw MODEL` / `--dtw MODEL` | empty | token-level timestamps by DTW (README; a Remotion doc says it needs a build later than 1.0.55 (search snippet)) |

Word-level command, using the documented flag names:

```sh
./build/bin/whisper-cli -m models/ggml-base.en-q5_1.bin -f in.wav \
  -ojf -ml 1 -sow -of out
```

The README does not show this exact combination as a recipe, and a search did not find a whisper.cpp issue or doc confirming its per-word accuracy. Measure word boundaries on a fixture before trusting them for cuts. Whisper-family timing is known to be weak (section 5).

**VAD (verified from README).** Silero VAD, a separate model. Enable with `--vad`, point to the model with `--vad-model` (`-vm`). Download with `./models/download-vad-model.sh silero-v6.2.0`, from [ggml-org/whisper-vad](https://huggingface.co/ggml-org/whisper-vad). Flags: `--vad-threshold`, `--vad-min-speech-duration-ms`, `--vad-min-silence-duration-ms`, `--vad-max-speech-duration-s`, `--vad-speech-pad-ms`, `--vad-samples-overlap`. Only detected speech goes to Whisper. Whether `whisper-cli` reports times in source time when VAD trims the audio is **(unverified)**; test.

**Models (verified).** Download with `sh ./models/download-ggml-model.sh base.en`, or fetch `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-<name>.bin`. `ggml-base.en-q5_1.bin` and `ggml-small-q5_1.bin` resolved with HTTP 200 (after redirect) and `ggml-silero-v6.2.0.bin` resolved from `ggml-org/whisper-vad`, all checked on 2026-10-18. Sizes from the model listing:

| Model | Size | Model | Size |
|---|---|---|---|
| tiny, tiny.en | 75 MiB | tiny-q5_1 / .en-q5_1 | 31 MiB |
| tiny-q8_0 / .en-q8_0 | 42 MiB | | |
| base, base.en | 142 MiB | base-q5_1 / .en-q5_1 | 57 MiB |
| base-q8_0 / .en-q8_0 | 78 MiB | | |
| small, small.en | 466 MiB | small-q5_1 / .en-q5_1 | 181 MiB |
| small-q8_0 / .en-q8_0 | 252 MiB | | |
| medium, medium.en | 1.5 GiB | medium-q5_0 / .en-q5_0 | 514 MiB |
| medium-q8_0 / .en-q8_0 | 785 MiB | | |
| large-v3-turbo | 1.5 GiB | large-v3-turbo-q5_0 | 547 MiB |

Quantized suffixes seen in the listing: `q5_1` (tiny, base, small), `q5_0` (medium, large-v3-turbo) and `q8_0` (most sizes). The README example uses `ggml-base.en-q5_0.bin`, made with `quantize`. Repo licence: MIT.

**GPU and acceleration build flags (verified from README):** CUDA `-DGGML_CUDA=1`; Vulkan `-DGGML_VULKAN=1`; HIP/ROCm `-DGGML_HIP=1`; OpenBLAS `-DGGML_BLAS=1`; OpenVINO `-DWHISPER_OPENVINO=1`; Core ML encoder `-DWHISPER_COREML=1`. Apple Silicon runs on Metal without a listed flag. Default build: CPU. Add Vulkan or CUDA as opt-in builds.

## 2. Quality and speed on CPU

**Speed (fetched, but on ARM, not x86).** A [Turing Pi RK3588 write-up](https://turingpi.com/whisper-cpp-piper-tts-arm64-turing-pi-rk3588/) timed whisper.cpp on a 5-minute 16 kHz mono English recording. The board has 4 Cortex-A76 and 4 Cortex-A55 cores. Quantization is not stated, and the model files are inferred from the download-script convention.

| Model | Threads | Wall time (5 min audio) | Real-time factor | Peak RSS |
|---|---|---|---|---|
| tiny | 8 | 29.8 s | 0.10 | 299 MB |
| base | 8 | 48.6 s | 0.16 | 410 MB |
| small | 8 | 141.9 s | 0.47 | 889 MB |
| medium | 8 | 454.0 s | 1.51 | 2.14 GB |

Derived for a 10-minute video at the same rate (linear, unverified on x86): tiny about 1 min, base about 1.6 min, small about 4.7 min, medium about 15 min. A 4-core x86 laptop is likely slower than the 8-core RK3588 mix, so measure it. A dev write-up on an old Intel laptop exists (whisper.cpp discussion 3752), but it used an 11-second sample, so it does not give long-form speed (search snippet).

**Quality.** Not measured in this pass **(unverified)**. Working default for English tutorials: `base.en-q5_1`. For other languages: `small-q5_1`. Test both on our own fixtures with a word error rate and a boundary check before locking in.

## 3. Filler words ("um", "uh")

**Verified.** Whisper's English normaliser removes disfluencies from the returned text. The repo note in `docs/research/cut-intelligence.md`, section 4, quotes `EnglishTextNormalizer.__init__`: `self.ignore_patterns = r"\b(hmm|mm|mhm|mmm|uh|um)\b"`. An [openai/whisper discussion](https://huggingface.co/spaces/openai/whisper/discussions/30) (search snippet) reports the same and names `normalize=False` on the transformers side.

Approaches, with the evidence level:

- **Filler-heavy initial prompt** (`--prompt "Um, so, uh, I think, er..."`). An OpenAI community user reported it kept "um" and "uh", but it also dropped words the speaker repeated on purpose (search snippet, not measured). Hallucinated words are a risk **(unverified)**. Test before use.
- **Verbatim decoding settings** in other tools: mlx-whisper's verbatim mode seeds a hesitation prompt and sets `condition_on_previous_text=False` (project notes, search snippet, not measured).
- **Verbatim fine-tune: CrisperWhisper** ([model card](https://huggingface.co/nyrahealth/CrisperWhisper)). Fetched: it transcribes "fillers, pauses, stutters and false starts" and aims for word timestamps "even around disfluencies and pauses." Licence **CC-BY-NC-4.0 (non-commercial)**. The card says v1 is superseded by CrisperWhisper 2.0 and is no longer maintained. Not usable in a free, commercial-compatible default without a separate licence check; not checked further.
- **Acoustic detection** (short voiced bursts between pauses, confirmed by the transcript). The method is the design idea in `cut-intelligence.md` and is **(unverified)** as a working approach.
- **Forced alignment** (WhisperX, Montreal Forced Aligner) fixes timing, not omitted words. WhisperX's README says Whisper timestamps "are at the utterance-level, not per word, and can be inaccurate by several seconds" (verified in `cut-intelligence.md`).

Recommendation until measured: take words from the default transcript; run a prompted second pass only on gaps with no matched word and on short voiced spans; accept a filler only when both signals agree. Build a fixture with known filler positions (record one or generate with TTS) before choosing. `DEFAULT_FILLERS` in `packages/core/src/transcript.ts` includes `er` and `erm`, which are real words in some contexts; keep them to the `standard` preset.

## 4. Alternatives

| Engine | Licence (code / weights) | Word timestamps | Notes |
|---|---|---|---|
| whisper.cpp | MIT / MIT (verified) | via `-ojf -ml 1 -sow` (documented flags; accuracy unverified) | C++ CLI; ship as a separate process |
| faster-whisper | MIT (verified) | yes: `word_timestamps=True`, read `segment.words` (verified) | Python; CTranslate2; GPU needs cuBLAS for CUDA 12 and cuDNN 9 (verified); the repo claims "up to 4 times faster" than openai/whisper; needs a Python runtime in the app |
| NVIDIA Parakeet-TDT 0.6B v3 | CC-BY-4.0 weights (verified) | yes, word and segment (verified card) | 25 European languages incl. English; 600M params; NeMo runtime; card says "optimized to run on NVIDIA GPU" and does not state CPU support; up to 24 min per clip on an A100 with full attention |
| sherpa-onnx | Apache-2.0 (verified) | not stated for Parakeet or Whisper (verified absence) | Linux, macOS, Windows; ONNX runtime; Parakeet TDT 0.6B v2 int8 and Whisper tiny.en are listed; JavaScript and WebAssembly support; npm package `sherpa-onnx-node` named in the README (verified) |
| Vosk | Apache-2.0 (verified) | not stated on the project page (unverified in the API docs) | Models "small (50 Mb)" per the project page (verified); Node.js binding listed (verified); accuracy claims not stated |

**Default:** whisper.cpp. **Fallback:** sherpa-onnx with a Parakeet-TDT model, since its prebuilt runtime and npm package fit an in-process or Node-spawned path. Its word-timing quality and CPU speed are both **(unverified)** for our use. faster-whisper is the Python option; the Python runtime is a bundle-size cost **(unverified size)**.

**Bundle sizes (verified where noted):** whisper.cpp `base.en-q5_1` 57 MiB; `small-q5_1` 181 MiB; Silero VAD file size not confirmed. Parakeet checkpoint size not listed on its card. sherpa-onnx model sizes not checked.

## 5. Hallucination and timestamp drift

Verified:
- Default `-nth 0.6` and temperature fallback on (`-nf` disables it), from the CLI README.
- The [whisper-timestamped README](https://github.com/linto-ai/whisper-timestamped) (search snippet) says whisper.cpp derives word timing from timestamp-token probabilities, which it calls not robust, and that Whisper tends to emit timestamps only at certain points, typically sentence ends. Word times between those points are less reliable.
- An [openai/whisper discussion #435](https://github.com/openai/whisper/discussions/435) (search snippet) reports that cutting silence with VAD and no padding gives much shorter segments with accurate timestamps. Padding and VAD settings matter.

Mitigations to test:
- Run Silero VAD first (`--vad`), so Whisper sees only speech.
- Transcribe long files in chunks of a few minutes with overlap, then merge by source time (matches the map-reduce plan in `cut-intelligence.md`).
- Reject words that fall outside their VAD span.
- Keep fallback on for normal runs, and rerun suspicious segments with `-nf` **(unverified)**.

## 6. Practical: spawning from Node, progress, cancel, model locations

Not verified in this pass. Planned checks: the progress format of `whisper-cli` on stderr; cancel by `SIGTERM` on the child process (standard Node behaviour, untested); per-OS model storage (for example Tauri's app data directory; not checked). First-run download is the chosen model size (table above). Time to transcribe a 10-minute video: derived estimate only (section 2).

## Pitfalls

- Whisper output text is normalised; do not use it as a verbatim record without `--prompt` or a second engine.
- `-ojf` output is large, since each token carries offsets (verified in cli.cpp). Parse once and stream; do not keep the full JSON for long files.
- JSON times are in milliseconds (`offsets`), and `timestamps` are formatted strings. Convert to seconds once at the boundary (repo rule: times are seconds).
- Word timing is weak (section 5). Snap cut boundaries to a nearby energy minimum, as `cut-intelligence.md` proposes.
- Token-to-word mapping relies on the leading-space convention of Whisper tokens **(unverified for this build)**.
- VAD-trimmed timelines need an offset back to source time **(unverified)**.
- Library VAD defaults are wrong for editing (see `cut-intelligence.md`); set our own.

## JSON shape (`-oj` / `-ojf`, verified from cli.cpp)

Top-level keys: `systeminfo`, `model`, `params`, `result`, `transcription`.

- `result.language`: detected or set language.
- `transcription`: array of segments. Each has `timestamps: {from, to}` (formatted strings), `offsets: {from, to}` (integers, milliseconds) and `text`. With `-ojf`, each segment also has `tokens`.
- Each token (full mode only): `text`, `timestamps` and `offsets` (written only when valid), `id`, `p`, `t_dtw`.

Word mapping sketch (to validate on a fixture):

```text
for each segment in transcription:
  words = []
  for each token in segment.tokens:
    if token.text is a special token (e.g. starts with "[_"): skip      # unverified
    if token.text starts with a space or words is empty: start a new word
    else: append token.text to the last word
    word.start = min(word.start, token.offsets.from / 1000)
    word.end   = max(word.end,   token.offsets.to / 1000)
```

Output per word: `{text, start, end}` in source-time seconds, matching `Word` in `packages/core/src/schema.ts`.

## Sources

Fetched in this pass:
- https://github.com/ggml-org/whisper.cpp/blob/master/README.md
- https://github.com/ggml-org/whisper.cpp/blob/master/examples/cli/README.md
- https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/examples/cli/cli.cpp
- https://github.com/ggml-org/whisper.cpp/releases
- https://github.com/ggml-org/whisper.cpp/tree/master/examples/bench
- https://huggingface.co/ggerganov/whisper.cpp
- https://huggingface.co/ggml-org/whisper-vad (file URL checked with HTTP HEAD)
- https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3
- https://huggingface.co/nyrahealth/CrisperWhisper
- https://github.com/SYSTRAN/faster-whisper
- https://github.com/k2-fsa/sherpa-onnx
- https://github.com/alphacep/vosk-api
- https://turingpi.com/whisper-cpp-piper-tts-arm64-turing-pi-rk3588/

Search snippets only (not fetched):
- https://huggingface.co/spaces/openai/whisper/discussions/30
- https://github.com/linto-ai/whisper-timestamped
- https://github.com/openai/whisper/discussions/435
- https://github.com/ggml-org/whisper.cpp/discussions/3752
- https://www.remotion.dev/docs/install-whisper-cpp/transcribe

Repo files read: `AGENTS.md`, `docs/engineering/knowledge-protocol.md`, `packages/core/src/transcript.ts`, `packages/core/src/cuts.ts`, `docs/research/cut-intelligence.md`.

Not yet checked: the v1.9.5 asset list, Vosk word-timing API, reports on Reddit (no Reddit result came back in searches), and whisper.cpp issues about word timing.
