# packages/stt

Local, free speech-to-text. Implements core's `Transcriber` with the whisper.cpp command-line tool (`whisper-cli`), and manages everything it needs (models, the runtime). Root rules in `/AGENTS.md` apply; this file adds package specifics. Audio never leaves the computer.

## Use it

```ts
import { createTranscriber } from "@dax/stt";

const transcriber = createTranscriber({ dataDir, onSetupProgress, onProgress }); // cheap; nothing runs yet
// inject into CommandContext.transcriber and the server
const transcript = await transcriber.transcribe("/path/video.mp4", { language: "en", signal, onProgress });
await transcriber.setup();      // optional: "Set up speech recognition" button (downloads runtime + model)
await transcriber.status();     // { binary?, model: { id, installed }, ready }
transcriber.models.list();      // SpeechModelManager: list / install / remove / verify
```

`onProgress` receives `{ stage: "extracting" | "analysing" | "recognising" | "finishing", fraction, chunk?, chunks? }`. core's `transcribe` command does not yet forward `signal` or progress to the transcriber (needs a change in `packages/core`, see the work summary).

## Module map

| File | Responsibility |
|---|---|
| `factory.ts` | `createTranscriber(options)`: lazy first-use setup, `status()`, `setup()`. The one call the app makes. |
| `transcriber.ts` | `WhisperCppTranscriber`: pipeline, argument building (`buildWhisperArgs`), progress parsing, failure messages. |
| `audio.ts` | `extractAudio`: any media to 16 kHz mono WAV on disk via FFmpeg (`ffmpegBin()` from core). |
| `whisper-json.ts` | Pure parser of `whisper-cli -ojf` JSON: token merge, special tokens, tags, punctuation. |
| `timing.ts` | Loudness envelope, quiet ranges, `trimWordsToSpeech` (word times tightened by the audio). |
| `squeeze.ts` | Shorten long silences before recognition and map times back (pure maps). |
| `wav.ts` | WAV header parsing and range copying; streams, never loads a file. |
| `chunking.ts` | `planChunks` / `mergeChunkWords` for long files. Pure. |
| `hallucination.ts` | Repeat-loop collapse and words-in-silence filter. Pure. |
| `models.ts` | Model catalog (URLs pinned to a Hugging Face commit, sizes, SHA-256) and `SpeechModelManager`. |
| `download.ts` | `downloadFile`: HTTP Range resume, SHA-256, atomic rename, disk-space check. |
| `binary.ts` | `findWhisperBinary` / `ensureBinary`: official release asset per OS/arch, safe unpack, smoke test. |
| `process.ts` | `runProcess`: spawn with abort, timeout, line callbacks. The only place that starts a process besides FFmpeg wrappers. |
| `paths.ts`, `errors.ts` | App data folder layout; `SttError` with a stable `code`. |

## How a transcription runs

1. FFmpeg writes the whole audio track to a temp 16 kHz mono WAV (streams to disk).
2. A 10 ms loudness envelope is computed (streams, a few MB for hours of audio).
3. **Squeeze:** silences of 1.2 s or more are cut to 0.3 s of padding on each side plus a 0.5 s gap; leading/trailing quiet is trimmed. Reason, measured: Whisper stamps the first word after a pause with the pause's start and invents text ("Thank you.") over silence; whisper.cpp's own `--vad` returns wrong per-word times (mean error 1.5 s on our test), so we do it ourselves and map times back.
4. **Chunks:** audio up to 12.5 minutes is one `whisper-cli` run (best accuracy; the engine carries context between its 30 s windows). Longer audio is cut near every 10 minutes at the middle of a squeezed gap, so no word is cut and no overlap is needed; with no gap the cut is hard with 3 s overlap and each word is kept from the chunk that owns its midpoint. Why chunk at all: bounded memory and temp files, immediate cancel, smooth progress, a repeat loop stays inside one chunk.
5. `whisper-cli -ojf` per chunk, progress from `whisper_print_progress_callback: progress = N%` on stderr (capped at 100: it prints 137% on short audio).
6. Words are merged from sub-word tokens, mapped back to the original timeline, tightened to the loud part of their span, filtered (silence, loops) and returned as core `Transcript` words in seconds.

## Measured behaviour you must not undo (whisper.cpp v1.9.2, CPU)

- **Do not use a priming prompt by default.** `--prompt "Umm, let me think like, hmm..."` makes the model stop emitting segment timestamps (one 30 s segment), and word times collapse (small.en mean start error 4.9 s; the last words of a short file all get the same time). `base.en` and larger keep "um"/"uh" without it; `tiny.en` drops them without it (`disfluencyPrompt: true` is the opt-in for tiny).
- **Do not enable `--vad`** (per-word times wrong, see above). Do not rely on `-dtw` either: it gave better ends but starts about 0.25 s late on average, no net win.
- Word times from whisper.cpp are median-accurate but have outliers of up to a second, mostly the first word after a pause, which `squeeze` and `trimWordsToSpeech` fix. Cuts on word edges should still keep a small pad (core uses 0.02 s).
- Token timestamps have zero-length tails when the audio is shorter than the model window; harmless on long files.

## Tests

Default tests (`pnpm --filter @dax/stt test`) need no network and no model: captured real JSON in `fixtures/`, a fake `whisper-cli` (`test-support/fake-whisper-cli.mjs`, driven by `FAKE_*` env vars), FFmpeg-generated audio, and a local HTTP server with Range support. Live tests (`src/live.test.ts`) run only with `DAX_LIVE_TESTS=1`; add `NODE_USE_ENV_PROXY=1` behind a proxy (Node's fetch ignores `HTTPS_PROXY` otherwise).

Re-capture a fixture with the real binary:

```sh
whisper-cli -m ggml-tiny.en.bin -f sample.wav -ojf -of out -t 2 -np -l en   # then copy out.json into fixtures/
```

## Per-OS runtime

| OS / CPU | Source | Notes |
|---|---|---|
| Linux x64, arm64 | official `whisper-bin-ubuntu-*.tar.gz` of release v1.9.2, SHA-256 pinned in `binary.ts` | Built on Ubuntu 22.04: glibc 2.35+, needs `libgomp1`. All x86 CPU variants included (picked at run time). |
| Windows x64, x86 | official `whisper-bin-x64.zip` / `whisper-bin-Win32.zip` | Needs the Microsoft Visual C++ 2015-2022 runtime. Unpacked with the system `tar.exe`. |
| macOS (arm64, x64) | **none published by whisper.cpp** (only an xcframework library) | `findWhisperBinary` checks `PATH` and the Homebrew locations; otherwise pass `runtimeAssets` for a build that dax-editor publishes, or `binaryPath` for one bundled in the app. The lead decides which (a CI job building `whisper-cli` with Metal on `macos-latest`, statically linked, is the realistic route). |
| Windows arm64, other Linux CPUs | none | `unsupported-platform` error with the fallbacks. |

whisper.cpp releases after v1.9.2 (v1.9.3 to v1.9.5) carry no binary assets (checked 2026-10-18), so the table pins v1.9.2. Bumping it means re-verifying every asset name and recomputing every SHA-256 (whisper.cpp publishes none).

## Rules

- Everything user-visible goes through `SttError` with a `code` and a message that says what to do.
- No shell strings: `runProcess` takes a binary and an argument array. File names come from the caller and may contain anything.
- Archives are listed and refused if any entry is absolute or contains `..` before they are unpacked, then smoke-tested (`--help`) in a staging folder before the rename into place.
- Models and runtimes live under `<dataDir>/speech/`; override the data folder with `DAX_DATA_DIR`, the binary with `DAX_WHISPER_CLI`, FFmpeg with `DAX_FFMPEG`.
- Licences: whisper.cpp and the ggml models are MIT (see `MODEL_LICENSE` in `models.ts`). Keep their notices if you redistribute them.
