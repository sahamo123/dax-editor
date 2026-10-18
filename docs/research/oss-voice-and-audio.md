---
type: Research
title: Open-source voice and audio for video
description: "Free, offline text-to-speech, voice cloning, speech enhancement, source separation and CC0-safe sound sources for dax-editor, with licence verdicts checked against the intake rules."
tags: [research, voice, tts, audio, licensing, ffmpeg, sound-effects]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T19:20:00Z
---

# Research: open-source voice and audio for video

Written 2026-10-18. Licences were read from the repository LICENSE files, Hugging Face model cards and project pages. Speed numbers are either vendor claims or community reports on server CPUs; **no laptop was measured**. Items marked **(unverified)** are secondary sources, third-party guides or inference, and need a check before we rely on them. Intake rules: free; permissive licence (MIT, Apache-2.0, BSD, ISC, MPL-2.0); GPL/LGPL only as a separate process; no non-commercial or research-only terms; no AGPL; model weights must allow commercial use; must run offline.

## Recommendation

1. **Default English narration (CPU): Kokoro-82M (weights Apache-2.0)**, run through **sherpa-onnx** (Apache-2.0, prebuilt wheels) as a spawned process. Community ONNX runs on a 4-core server sit around RTF 0.5 to 0.65 (unverified for laptops).
2. **Multilingual on CPU: MeloTTS (MIT)**, covering EN, ES, FR, ZH, JA and KO per its README. Quality reports are thin, so test on our own scripts.
3. **Higher quality on GPU, and opt-in voice cloning: Chatterbox (MIT code and MIT weights)**. Keep its built-in Perth watermark on. Multilingual V3 covers 23 languages. Cloning is gated behind a consent step.
4. **Speech enhancement: DeepFilterNet (dual MIT / Apache-2.0)** as the default. Fall back to **RNNoise** through FFmpeg `arnndn`, or to FFmpeg `afftdn` with no model at all.
5. **Ducking and loudness: built-in FFmpeg** `sidechaincompress` and `loudnorm`, with no extra dependency. Tested end to end (see below).
6. **Music and SFX: bundle only Freesound CC0 assets**, with a manifest that records each sound ID and its licence. Everything else is link-out or user-supplied.
7. **Voice separation (Demucs): MAYBE only.** Its code is MIT, but the training data is academic-only and the repo is unmaintained. Get a legal read before shipping it.
8. **Reject:** XTTS-v2, F5-TTS (pretrained weights), Fish-Speech / S2-Pro / Drama 3, Supertonic (OpenRAIL-M), Bark (too slow on CPU).

The `tts` plugin is a process: text in via a file or stdin, voice id and engine as typed parameters, WAV out, JSON manifest on stdout. See "How it plugs in".

## Comparison table

RTF = real-time factor (processing time / audio duration; lower is faster). "Code / weights" quotes the licence line the project states.

| Tool | Role | Code / weights licence | Size | Speed (source) | Languages | Verdict |
|---|---|---|---|---|---|---|
| Kokoro-82M | TTS, default EN | Apache-2.0 / Apache-2.0 (HF `license: apache-2.0`) | 82M params, ~327 MB (secondary) | ONNX RTF ~0.5 to 0.65 on 4-core Xeon, community (unverified) | English plus others; count unverified | **ADOPT** |
| sherpa-onnx | TTS/ASR runtime | Apache-2.0 (LICENSE file) | C++ library, pip wheels | Native; no speed claim | Runs Kokoro, Piper/VITS, MeloTTS, KittenTTS and others | **ADOPT** (runtime) |
| MeloTTS | TTS, multilingual CPU | MIT / MIT ("under MIT License, ... free for both commercial and non-commercial use") | Small (unverified) | README: "Fast enough for CPU real-time inference" (vendor) | EN, ES, FR, ZH, JA, KO | **ADOPT** (multilingual CPU) |
| Chatterbox (Turbo 350M, Nano 110M, Multilingual V3 500M) | TTS + zero-shot cloning | MIT / MIT (HF `license: mit`) | 110M to 500M | Nano "3x faster than realtime on 8 CPU cores" (vendor); install ~5 to 6 GB (anecdote) | EN (Turbo, Nano); 23 languages (V3) | **ADOPT** (GPU, opt-in cloning) |
| Dia 1.6B | Dialogue TTS, GPU | Apache-2.0 / Apache-2.0 | 1.6B | GPU only. Speed x1.5 to x2.1 real time with compile, bf16 ~4.4 GB VRAM (README table, its "realtime factor" is a speed multiple); "CPU support is to be added soon" | English (third-party listing, unverified) | MAYBE |
| Orpheus 3B (ft) | LLM-style TTS, GPU | Apache-2.0 (LICENSE file; HF API tag `license:apache-2.0`). Base is Llama-family, see Pitfalls | 3B | ~200 ms streaming latency (vendor); CPU about 37x slower than real time (HF conversion repo, secondary) | EN | MAYBE |
| Parler-TTS mini v1 | Describe-a-voice TTS, GPU | Apache-2.0 / Apache-2.0 (HF `license: apache-2.0`) | mini | CPU speed unverified | EN | MAYBE |
| Piper (OHF-Voice/piper1-gpl) | TTS, fastest on CPU | GPL-3.0 (COPYING), so process only. Voices vary, see Pitfalls | Voice files typically under 100 MB (secondary) | Fast, local engine (README); no RTF figure checked | Many (voice dependent) | MAYBE |
| StyleTTS2 | TTS research | MIT code; pretrained models carry a "tell listeners it is synthetic" condition | not checked | Inference "depends on a GPL-licensed package" (README) | EN | MAYBE |
| Kitten TTS nano 0.8 | Tiny CPU TTS | Apache-2.0 (HF) | ~15M params, ~50 MB | No CPU figure given | Not stated | MAYBE (test) |
| Bark | Text-to-audio | MIT / MIT (README: "now licensed under the MIT License") | Large (unverified) | Needs ~12 GB VRAM full; CPU "significantly slower" (README) | Multilingual | REJECT (speed) |
| XTTS-v2 (Coqui) | Cloning TTS | MPL-2.0 code / **CPML** weights (HF `license: other`, `coqui-public-model-license`) | not checked | not checked | Multilingual | **REJECT** (non-commercial) |
| F5-TTS | Cloning TTS | MIT code / **CC-BY-NC** pretrained weights (README) | not checked | GPU RTF 0.04 to 0.15 (vendor) | ZH, EN | **REJECT** (weights) |
| Fish-Speech (S2-Pro, Drama 3) | Cloning TTS | Fish Audio Community License (revenue cap, no hosted service). S2-Pro: Research License, "Commercial use requires a separate license" | 4B (S2-Pro), 35B-A3B (Drama 3) | not checked | ~100 (S2-Pro) | **REJECT** |
| Supertonic | TTS | MIT code / **OpenRAIL-M** model | not checked | RTX 4090 RTF 0.011 (vendor) | not checked | REJECT (licence not on intake list) |
| DeepFilterNet (v3) | Speech denoise | MIT **or** Apache-2.0 (dual, README); weights in repo, same licence assumed (unverified) | Small | Heavier than RNNoise, still efficient (secondary study) | Language agnostic | **ADOPT** |
| RNNoise | Speech denoise, light | BSD-style (COPYING, Xiph/Mozilla/Amazon copyrights) | Tiny | Near real time, light CPU (secondary study) | Language agnostic | **ADOPT** (fallback) |
| FFmpeg `afftdn` | Denoise, no model | LGPL core (believed; unverified for our build) | not checked | not checked | not checked | **ADOPT** (zero-dependency fallback) |
| Demucs (htdemucs) | Music / voice separation | MIT code (README). Trained on MUSDB HQ, which is "academic purposes" only (sigsep). Repo "not maintained anymore" | not checked | not checked | not checked | **MAYBE** (legal read) |
| Freesound (CC0 filter) | SFX source | Per file. CC0: commercial OK, no credit | not checked | not checked | not checked | **ADOPT** (CC0 only) |
| Pixabay | Music / SFX / video | Pixabay Content License: free, no attribution, but "You cannot sell or distribute Content ... on a Standalone basis" | not checked | not checked | not checked | MAYBE (link out, do not bundle) |
| Openverse | Search across CC content | Per item (cc0, by, by-sa, by-nc filters) | not checked | not checked | not checked | MAYBE (search only; store per-item licence) |
| Free Music Archive | Music | Per track CC licence; NC, ND and SA variants exist | not checked | not checked | not checked | MAYBE (filter to BY or CC0 only) |
| Incompetech (Kevin MacLeod) | Music | Free tier: "Requires that you credit the music." Exact CC version unverified (third-party: CC BY 4.0). Paid Standard licence removes credit | not checked | not checked | not checked | MAYBE (bundle only with credits file) |

## Per-tool notes

### TTS, English narration

- **Kokoro-82M.** Apache-2.0 weights. Python package `kokoro` (needs `espeak-ng`), with voice packs such as `af_heart`. It does **not** clone voices; you pick a voice pack. The model card lists its training data as "permissive/non-copyrighted audio" plus two CC-licensed sets: Koniwa (CC BY 3.0) and SIWIS (CC BY 4.0). Quality is praised in community threads. A comparison blog puts Kokoro ahead of Piper on naturalness, but its listener panel was small (secondary). The HF model card warns that sites with "kokoro" in their domain are not affiliated with the project.
- **sherpa-onnx.** Apache-2.0 (LICENSE file, verified). The PyPI page lists the latest release as 1.13.8 (Sep 2026), with prebuilt wheels for Linux x86-64 and ARM64, macOS (universal2) and Windows (x86, x64, ARM64), plus Android. Install: `pip install sherpa-onnx`. Its TTS docs list Kokoro (v1.0 and v1.1), Piper/VITS, MeloTTS, Matcha, KittenTTS, PocketTTS and ZipVoice, and say some run as C++ executables. This is the cleanest way to spawn one CLI for several engines.
- **Piper.** The original `rhasspy/piper` repo now says "Development has moved" to `OHF-Voice/piper1-gpl`, which is GPL-3.0 (COPYING). The project is "looking for maintainers". The GPL covers the engine only if we link it, so spawn it as a separate process. **Voice licences are separate.** The popular `en_US-lessac` voice's model card points to the Blizzard 2013 dataset. That dataset's licence says "Commercial use: Not permitted" and limits use to "Research Purposes" (verified). Do not ship lessac. Check each voice's dataset page before use. A community answer (unverified) says LJSpeech-based voices are public domain.
- **MeloTTS.** MIT code and MIT model cards (verified). Its README lists EN, ES, FR, ZH (mixed EN), JA and KO. It says it is "fast enough for CPU real-time inference" (vendor claim). Independent CPU benchmarks: none found.
- **Chatterbox.** Code: MIT (LICENSE file). Weights: `license: mit` on ResembleAI/chatterbox (verified). Turbo (350M) and Nano (110M) are English. Multilingual V3 (500M) covers 23 languages. Install: `pip install chatterbox-tts`, Python 3.11 recommended. Every output carries Resemble's **Perth** watermark, described in the README as "imperceptible neural watermarks that survive MP3 compression". Keep that on. The README gives no consent requirement for cloning, so our app must add one.
- **Dia 1.6B.** Apache-2.0 for code and weights (verified). The README says it was "tested on only GPUs (pytorch 2.0+, CUDA 12.6)". Voice cloning uses an audio prompt plus transcript with `[S1]`/`[S2]` tags, about 5 to 10 seconds of reference. Good for two-speaker dialogue. Not for CPU use yet.
- **Orpheus.** Apache-2.0 on the HF API tag and LICENSE file. The HF repo is **gated** (access must be requested). Streaming needs GPU. There is no independent quality review (unverified). See Pitfalls on the Llama-family base.
- **Parler-TTS.** Apache-2.0 for code, data and weights ("fully open-source", HF card). You describe the voice in text rather than cloning it. Good for a "voice design" feature. CPU speed unverified.
- **StyleTTS2.** Code MIT (verified). The pretrained-model clause says you must tell listeners the speech is synthetic "unless you have the permission to use the voice". That is a disclosure condition, not a non-commercial clause, but it creates work for us. The README also says inference depends on a GPL package, which would have to run as a separate process.
- **Bark.** MIT (verified). Quality is good, but CPU inference is far slower than real time and it is hard to predict. Reject for our defaults.
- **Kitten TTS nano 0.8.** Apache-2.0 (HF), about 15M params and 50 MB. It is the smallest candidate. Languages and quality are not stated (unverified). Worth a listening test as a very-low-end CPU option.
- **Supertonic.** Sample code is MIT, but "The accompanying model is released under the OpenRAIL-M License" (verified). OpenRAIL-M carries use restrictions and is not on our intake list. Reject unless that changes.

### Rejected for licence

- **XTTS-v2.** The HF card says `license: other`, `license_name: coqui-public-model-license`, and "This model is licensed under Coqui Public Model License" (verified). The Coqui repo itself is MPL-2.0. The company closed in early 2024 and the repo is not maintained (secondary). Do not use the weights.
- **F5-TTS.** "Our code is released under MIT License. The pre-trained models are licensed under the CC-BY-NC license due to the training data Emilia" (README, verified). The MIT code does not help. Retraining on permissive data would be a separate project.
- **Fish-Speech.** The Community License (dated Oct 2026) allows commercial use only below an Annual Revenue threshold. It also bans offering the models as a hosted service without a separate licence (sections III(a) to III(c), verified). S2-Pro weights use a Research License that requires "a separate license" for commercial use (HF card, verified).

### Speech enhancement and separation

- **DeepFilterNet.** "dual-licensed under either MIT or Apache-2.0 ... at your option" (verified). The README ships a CLI (`--model` defaults to DeepFilterNet2) and a Python `enhance` API. One 2026 self-run PESQ test (secondary) found DeepFilterNet3 scored best on 8 of 9 clips, but it "deletes a music bed almost completely" at default settings. **Do not run it on a mixed music-and-voice track.** Run it on the voice track alone.
- **RNNoise.** Xiph/Mozilla/Amazon copyright notices, with a standard BSD-style permission clause (COPYING, verified). The FFmpeg `arnndn` filter loads RNNoise-style models (`model`/`m`, verified via `ffmpeg -h filter=arnndn`). The rnnoise-models repo says "none of this work is creative and thus none of it is subject to copyright" (author's statement; check before relying on it).
- **FFmpeg `afftdn`.** Built into FFmpeg with no model file. Use as the zero-dependency fallback.
- **Demucs.** "Demucs is released under the MIT license" (README, verified). The htdemucs model "has been trained on the MUSDB HQ dataset + an extra training dataset of 800 songs" (README). The sigsep page says MUSDB tracks "can only be used for academic purposes" and need manual access approval. Whether the weights inherit that restriction is a legal question (unverified). The README also says the repo "is not maintained anymore". Keep it as MAYBE until counsel has read it.

### Sound effects and music sources

- **Freesound.** Three licences are offered: CC0, CC-BY and CC-BY-NC. A legacy Sampling+ licence is being retired (FAQ, verified). CC0 needs no credit and allows commercial use. CC-BY needs credit. CC-BY-NC cannot be used commercially. Filter to CC0 for anything we bundle. Check each sound's page, because licence is per file.
- **Pixabay.** "Use Content without having to attribute the author" is allowed. "You cannot sell or distribute Content ... on a Standalone basis" is prohibited. "Standalone" means "no creative effort has been applied ... and it remains in substantially the same form" (verified). The summary does not say whether a bundled template counts. **Do not bundle Pixabay files** in templates or the repo (inference).
- **Openverse.** Aggregates CC and public-domain items and filters by licence (cc0, by, by-sa, by-nc per third-party docs). Its terms page returned 404 for us, so the rules are unverified. Treat it as a search source only. Store each item's licence and creator per download.
- **Free Music Archive.** The FMA License Guide (verified) gives per-track terms. CC BY allows commercial use and derivatives with credit. CC BY-SA requires the same licence on derivatives. **CC BY-ND "cannot put this song in a video or other derivative work."** CC BY-NC cannot be used commercially. Filter to CC BY or CC0. Some artists run YouTube Content ID.
- **Incompetech.** The official free tier says "Requires that you credit the music." The page also offers a Standard licence for projects "where attribution is not wanted". The exact CC version is not on the page we could read (third-party guides say CC BY 4.0, unverified). Bundling is allowed only with a credits file.

## Voice cloning: ethics and consent

- **Build consent in.** Cloning needs an attestation that the speaker is the user or has given permission. Store the attestation with the voice. Do not offer cloning from a third party's public clip by default.
- **Label synthetic audio.** EU AI Act Article 50(4): "Deployers of an AI system that generates or manipulates image, audio or video content constituting a deep fake, shall disclose that the content has been artificially generated or manipulated" (verified on the Act text). Article 3(60) covers audio that "resembles existing persons" and "would falsely appear to a person to be authentic" (verified). Article 50 has applied since 2 August 2026 (secondary). The artistic-work exception only limits how the disclosure is shown (verified). Our `tts` output should carry a `synthetic: true` flag and a visible or metadata label option.
- **Watermarks.** Chatterbox embeds one by default. Other engines do not (verified from READMEs). Do not strip it. The EU machine-readable marking duty for providers has a grace date of 2 December 2026 (secondary).
- **US law.** Tennessee's ELVIS Act and the NO FAKES Act are reported in secondary sources, with conflicting details (unverified). Check the statute text before stating anything about US exposure.
- **Default to no cloning.** Kokoro and Melo use fixed voices, so the default path carries no cloning risk.

## How it plugs in

**`tts` plugin contract (process, not library):**
- Input: text from a temp file or stdin, `--voice <id>`, `--engine <kokoro|melo|chatterbox|piper>`, `--out <path.wav>`. No free-form extra arguments (AGENTS.md safety rule).
- Output: a WAV (mono 24 kHz is typical for Kokoro and Chatterbox, unverified per engine), then a JSON line on stdout with `engine`, `model`, `licence`, `durationSec`, `sha256`, `synthetic: true`.
- The engine code runs in a separate process, so GPL pieces (Piper, FFmpeg GPL builds) never link into our code.
- The engine picks a licence-checked voice from a manifest. Piper voices with a research-only dataset are listed as blocked.

**Ducking music under voice (FFmpeg, built-in filters):**

```sh
ffmpeg -i music.wav -i voice.wav -filter_complex \
 "[1:a]asplit=2[sc][mix];[0:a][sc]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=300[ducked];\
 [ducked][mix]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[out]" \
 -map "[out]" -ar 48000 -ac 2 mixed.wav
```

- `sidechaincompress` options (from `ffmpeg -h filter=sidechaincompress`, FFmpeg 6.1): `threshold` default 0.125, `ratio` default 2, `attack` default 20 ms, `release` default 250 ms, `level_sc`, `mix`. The voice is the sidechain (input 1).
- `loudnorm` options (from `ffmpeg -h filter=loudnorm`): `I` default -24 LUFS, `TP` default -2 dBTP, `LRA` default 7, `linear` default true. For accurate results run two passes and feed the `measured_I`, `measured_TP`, `measured_LRA` and `measured_thresh` values from pass one.
- **Test run (this session):** synthetic 220 Hz "music" and 440 Hz "voice" bursts, mixed with the chain above, gave integrated loudness **-16.0 LUFS**, true peak **-11.2 dBFS**, LRA 5.9 LU. This proves the graph runs. It does not prove speech quality. Test with real speech before shipping.
- Loudness targets used in the example (-16 LUFS, -1.5 dBTP) are common for narration and podcasts. Platform targets vary, so check them before we set a default (unverified).

**Denoise before ducking:** run DeepFilterNet (or `arnndn`/`afftdn`) on the voice track alone, then use the cleaned voice as the sidechain.

## Pitfalls

- **Licence on the wrapper is not the licence on the weights.** F5-TTS (MIT code, CC-BY-NC weights), XTTS-v2 (MPL code, CPML weights) and Fish-Speech are the examples. Always read the model card or the weights' own licence file.
- **Voice datasets carry their own licences.** Piper `lessac` is trained on Blizzard 2013 (research only). Check every voice's dataset before it enters a voice list.
- **Permissive model, copyleft or attribution-heavy data.** Kokoro's training data includes CC BY 3.0 and CC BY 4.0 sets. Whether attribution is owed for model output is unverified; get a legal read.
- **Gated and base-model licences.** Orpheus is gated on Hugging Face and built on a Llama-family base. Its Apache-2.0 label may not cover the base-model terms (secondary; unverified).
- **GPL in the process tree.** Piper (GPL-3.0) and the StyleTTS2 inference dependency must run as separate programs. The local FFmpeg here is a GPL build (`--enable-gpl`, `libx264`, `libx265`). Our shipped FFmpeg must be LGPL-safe (AGENTS.md). Ship a build without those encoders and check `ffmpeg -buildconf`.
- **Demucs and academic-only data.** The MUSDB18 terms say academic use only. The repo is unmaintained.
- **Pixabay "standalone" rule.** Bundling unaltered Pixabay files in a template is probably barred (inference).
- **FMA and Incompetech variants.** ND and NC tracks cannot be used in a commercial video. Incompetech's credit line must ship with the app.
- **DeepFilterNet on music.** It can erase a music bed. Denoise voice only.
- **Clone-by-default.** A cloning feature on by default would bring the EU deepfake labelling duty into every render. Keep it opt-in.
- **Domain squatting.** The Kokoro HF card warns that "kokoro"-named sites are unaffiliated. Install only from the PyPI project, the sherpa-onnx GitHub release, or the HF repo.
- **Speed claims.** Most speed numbers here are vendor or server-class. We need our own RTF test on a 4-core laptop before we promise real-time playback.
- **Coqui.** The company closed; the upstream repo is no longer maintained (secondary). Do not depend on it for maintenance.

## Sources

Fetched and read in this session:

- Kokoro: https://huggingface.co/hexgrad/Kokoro-82M ; https://huggingface.co/hexgrad/Kokoro-82M/raw/main/README.md
- F5-TTS: https://github.com/SWivid/F5-TTS ; https://raw.githubusercontent.com/SWivid/F5-TTS/main/LICENSE ; https://raw.githubusercontent.com/SWivid/F5-TTS/main/README.md
- Chatterbox: https://github.com/resemble-ai/chatterbox ; https://raw.githubusercontent.com/resemble-ai/chatterbox/master/LICENSE ; https://huggingface.co/ResembleAI/chatterbox/raw/main/README.md
- XTTS-v2: https://huggingface.co/coqui/XTTS-v2/raw/main/README.md ; https://raw.githubusercontent.com/coqui-ai/TTS/dev/LICENSE.txt
- Piper: https://github.com/OHF-Voice/piper1-gpl ; https://raw.githubusercontent.com/OHF-Voice/piper1-gpl/main/COPYING ; https://raw.githubusercontent.com/rhasspy/piper/master/README.md ; https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/lessac/high/MODEL_CARD ; https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html
- MeloTTS: https://raw.githubusercontent.com/myshell-ai/MeloTTS/main/README.md ; https://raw.githubusercontent.com/myshell-ai/MeloTTS/main/LICENSE ; https://huggingface.co/myshell-ai/MeloTTS-English/raw/main/README.md
- StyleTTS2: https://raw.githubusercontent.com/yl4579/StyleTTS2/main/README.md ; https://raw.githubusercontent.com/yl4579/StyleTTS2/main/LICENSE
- Fish-Speech: https://github.com/fishaudio/fish-speech ; https://raw.githubusercontent.com/fishaudio/fish-speech/main/LICENSE ; https://huggingface.co/fishaudio/s2-pro/raw/main/README.md
- Orpheus: https://raw.githubusercontent.com/canopyai/Orpheus-TTS/main/README.md ; https://raw.githubusercontent.com/canopyai/Orpheus-TTS/main/LICENSE ; https://huggingface.co/api/models/canopylabs/orpheus-3b-0.1-ft
- Dia: https://raw.githubusercontent.com/nari-labs/dia/main/README.md ; https://huggingface.co/nari-labs/Dia-1.6B/raw/main/README.md
- Bark: https://raw.githubusercontent.com/suno-ai/bark/main/README.md ; https://raw.githubusercontent.com/suno-ai/bark/main/LICENSE
- Parler-TTS: https://raw.githubusercontent.com/huggingface/parler-tts/main/README.md ; https://huggingface.co/parler-tts/parler-tts-mini-v1/raw/main/README.md
- Kitten TTS: https://huggingface.co/KittenML/kitten-tts-nano-0.8
- Supertonic: https://huggingface.co/Supertone/supertonic/raw/main/README.md
- sherpa-onnx: https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/master/LICENSE ; https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/master/README.md ; https://k2-fsa.github.io/sherpa/onnx/tts/index.html ; https://pypi.org/project/sherpa-onnx/
- DeepFilterNet: https://raw.githubusercontent.com/Rikorose/DeepFilterNet/main/README.md ; https://raw.githubusercontent.com/Rikorose/DeepFilterNet/main/LICENSE-MIT
- RNNoise: https://raw.githubusercontent.com/xiph/rnnoise/main/COPYING ; https://raw.githubusercontent.com/GregorR/rnnoise-models/master/README.md
- Demucs: https://raw.githubusercontent.com/facebookresearch/demucs/main/README.md ; https://raw.githubusercontent.com/facebookresearch/demucs/main/LICENSE ; https://sigsep.github.io/datasets/musdb.html
- Pixabay: https://pixabay.com/service/license-summary/
- Freesound: https://freesound.org/help/faq/
- Free Music Archive: https://freemusicarchive.org/License_Guide
- Incompetech: https://incompetech.com/music/royalty-free/licenses/
- LJSpeech (public domain statement): https://keithito.com/LJ-Speech-Dataset/
- EU AI Act Article 50 and Article 3(60): https://artificialintelligenceact.eu/article/50/
- FFmpeg filter options: local `ffmpeg 6.1.1` `-h filter=` output (sidechaincompress, loudnorm, arnndn, afftdn); the online filters page was too long to read in full.

Secondary (used for context, marked unverified above):

- Kokoro ONNX CPU numbers: https://raw.githubusercontent.com/gauravvij/kokoro-tts-vs-supertonic-3-tts/main/results/benchmark_report.md ; https://prismix.dev/news/5dbcdf80e32e
- Piper vs Kokoro: https://www.codesota.com/text-to-speech/piper-vs-kokoro
- Piper voice licence discussion: https://github.com/rhasspy/piper/discussions/271
- Coqui shutdown: https://github.com/coqui-ai/TTS/discussions/4145
- Dia VRAM: https://codersera.com/blog/nari-dia-1-6b-vs-sesame-csm-1b-which-is-the-best-tts/amp/
- DeepFilterNet vs RNNoise: https://www.creativeainews.com/articles/deepfilternet-vs-rnnoise-vs-ffmpeg-noise-removal-2026/ ; https://publikasi.mercubuana.ac.id/index.php/sinergi/article/view/21917
- EU Article 50 commentary: https://didit.me/blog/eu-ai-act-deepfake-labelling-2026/
- Community TTS comparison (r/LocalLLaMA snapshot, secondary): https://reddit.sentinel-team.org/posts/1tzv1uz/snapshots/2026-06-13T02%3A56%3A06.64152Z

Not reached: Openverse terms (404), Openverse about page (bot challenge), Incompetech licence detail page (no text), Freesound per-sound pages (not sampled).

## Next steps

- Run an RTF test for Kokoro (sherpa-onnx) and MeloTTS on a 4-core laptop, using a fixed 60-second script. Record the numbers in this file.
- Listen-test Kokoro, MeloTTS and Kitten TTS nano on the same narration script. Record the results.
- Get a legal read on Kokoro's CC BY training data, the Orpheus Llama base, and Demucs weights.
- Build a voice manifest that marks each voice's dataset licence, and block research-only voices (Piper `lessac`).
