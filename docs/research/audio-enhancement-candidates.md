---
type: Research
title: Audio enhancement candidates (denoise, de-reverb, de-ess, leveling, loudness, voice isolation)
description: "Verdicts with licence, maintenance and weight-format evidence for speech denoisers, de-reverb, de-essers, auto-leveling, loudness and voice-isolation tools, with local CPU timings and the FFmpeg wrapper design for the ADOPT items."
tags: [research, audio, denoise, dereverb, loudness, voice-isolation, ffmpeg, intake]
status: draft
generated:
  by: process:scribe
  at: 2026-10-18T21:10:00Z
---

# Research: audio enhancement candidates

Written 2026-10-18 by the scout (researcher) run. It covers the gap that [open-source voice and audio](oss-voice-and-audio.md) left open: cleanup and enhancement of the voice track. TTS and sound sources are not repeated here, except where a correction matters.

**Method and limits.** Licences come from each repository's LICENSE file, fetched raw or from a shallow `git clone` of the default branch (2026-10-18). Commit dates are the newest commit in that clone. Model licences come from the Hugging Face model API (`license` tag, `gated` flag, file list) and model cards. Speed was measured on this sandbox (4 vCPU Intel Xeon 2.1 GHz, 15 GB RAM, Python 3.13, torch CPU), **not on a laptop**. Quality was measured only with a synthetic test (clean eSpeak NG speech, mixed with pink noise or echo), scored as SNR against the clean reference. No listening test was done. GitHub issue lists were read through the public issue page with WebFetch, which shows titles only. The GitHub API and `gh` are blocked for unattached repos in this session, so issue bodies were not read. Items marked **(unverified)** need a check before anyone relies on them.

## Verdicts at a glance

| Gap | Verdict | Candidate | Why |
|---|---|---|---|
| Denoise (no model) | **ADOPT** | FFmpeg `afftdn` (built-in) | No model, no download, LGPL filter family. Objective gain is small on our test (see Measurements). |
| De-ess | **ADOPT** | FFmpeg `deesser` (built-in) | No model. Gotcha: intensity defaults to 0, which does nothing (confirmed). |
| Auto-leveling | **ADOPT** | FFmpeg `speechnorm`, `dynaudnorm`, `acompressor` (built-in) | No model. Quality not listened to. |
| Loudness | **ADOPT** | FFmpeg `loudnorm`, two-pass (built-in) | No model. Measured on test: lands 0.6 LU off target when true peak limits it. |
| Denoise (learned) | **MAYBE** | GTCRN (MIT code, maintained) | Checkpoint is a PyTorch pickle zip, so it escalates. 16 kHz only. Needs a human decision on converting the checkpoint. |
| Denoise (learned) | **REJECT** | DeepFilterNet | Last commit 2024-10-17 fails the 12-month gate. Default model is fetched from GitHub at run time with no hash. Re-open only with a maintained fork or a human exception. |
| Denoise (learned) | **MAYBE** | RNNoise weights through FFmpeg `arnndn` | Code is BSD-3-style. Model archive has no LICENSE file and says it is "not subject to copyright". Open issue asks for the licence. Escalate. |
| Denoise (learned) | **REJECT** | Resemble-Enhance | Last commit 2024-12-03. 713 MB pickle weights, fetched at run time with no hash, over the 500 MB download cap. |
| Denoise (learned) | **REJECT** | Facebook `denoiser` | Code licence is CC BY-NC 4.0. |
| Denoise (learned) | **REJECT** | DTLN | Last commit 2022-04-26. |
| De-reverb | **MAYBE** | SpeechBrain SepFormer WHAMR! enhancement | Apache-2.0 model tag, but a `.ckpt` pickle format, 8 kHz only, and the WHAMR! dataset licence is unverified. |
| De-reverb | **MAYBE** | UVR de-echo/de-reverb models via python-audio-separator | Package is MIT and maintained. Models are downloaded at run time, and their licence is not stated. |
| De-reverb | **REJECT** (for now) | nara_wpe (WPE, MIT) | Last commit 2025-03-19 fails the 12-month gate. No maintained fork found. Idea only. |
| Voice isolation (music or background removal) | **REJECT** | Demucs | Repo says "not maintained anymore", last commit 2023-11-16. Trained on MUSDB HQ (academic terms). |
| Voice isolation | **REJECT** | Open-Unmix | Default `umxl` weights are CC BY-NC-SA 4.0. `umxhq` is trained on MUSDB18-HQ. |
| Voice isolation | **MAYBE** | Spleeter (2 and 4 stems) | Code MIT and maintained (2026-06-18). Weights licence not stated. Escalate. |
| Voice isolation | **MAYBE** | python-audio-separator (UVR MDX and Roformer models) | Code MIT, maintained (2026-10-01). Model licences not stated. Escalate per model. |
| Voice isolation (speech) | **MAYBE** | GTCRN or SpeechBrain | These remove noise, not music. See denoise rows. |
| Loudness helper | **REJECT** | pyloudnorm | Duplicates FFmpeg `loudnorm` measurement. Adds a Python process for no gain. |
| Loudness helper | **REJECT** | ffmpeg-normalize (MIT, maintained 2026-10-14) | Wrapper over the FFmpeg recipe above. Not needed. The engine can call FFmpeg directly. |
| Mastering | **REJECT** | Matchering | GPL-3.0 code. Strong copyleft, human only. |
| Voice isolation / denoise, existing claim | **Corrected** | Demucs (was MAYBE), RNNoise (was ADOPT), DeepFilterNet (was ADOPT) | See Corrections. |

The engine can ship the four **ADOPT** items now. None of them needs a new dependency, a new process or a download. There is **no adoptable de-reverb or voice-isolation tool** yet. Those are gaps for a human decision.

## Measurements (sandbox CPU, not a laptop)

Test material: 130 s of eSpeak NG speech at 48 kHz (`speech.wav`), the same clip mixed with pink noise at amplitude 0.08 (`noisy.wav`), and an echo version (`reverb.wav`). The SNR column is the gain-matched SNR of each output against the clean speech after FFT cross-correlation alignment, so higher is better. The noisy input scores **15.88 dB**.

| Chain | Wall time, 130 s clip | RTF | SNR vs clean | Note |
|---|---|---|---|---|
| `afftdn=nf=-25` | 0.86 s | 0.007 | 16.00 dB | +0.12 dB gain. Pink noise sits in the speech band, so a spectral gate helps little. |
| `afwtdn` | 2.07 s | 0.016 | 15.88 dB | No measurable change. |
| `arnndn` with RNNoise `somnolent-hogwash` model (local test only, licence unclear) | 3.25 s | 0.025 | 16.05 dB | Small gain. |
| `highpass=90,afftdn=nf=-25` | 1.49 s | 0.011 | 8.89 dB | Lower SNR, so the high-pass costs speech content on this material. Do not use blindly. |
| `deesser` (default `i=0`) | 0.34 s | 0.003 | n/a | **Output is identical to the input** (max sample difference 0.0). |
| `deesser=i=0.6` | not timed separately | | n/a | Changes the signal (max difference 0.39). Quality not listened to. |
| `dynaudnorm=f=500:g=31` | 0.52 s | 0.004 | n/a | |
| `speechnorm=e=12.5:r=0.0001:l=1` | 1.57 s | 0.012 | n/a | |
| `acompressor=threshold=-20dB:ratio=3` | 0.64 s | 0.005 | n/a | |
| `loudnorm`, pass 1 (measure) | 3.5 s | 0.027 | n/a | Measured input: I -20.59 LUFS, TP -0.82 dBTP, LRA 1.70, thresh -30.72. |
| `loudnorm`, pass 2 with measured values (`linear=true`) | not separated | | n/a | Result: I **-16.6 LUFS** (target -16), TP -1.5 dBTP, LRA 1.4. |

**Reading the loudness result.** Pass 2 misses the target by 0.6 LU because the -1.5 dBTP ceiling stops it from reaching -16 LUFS. Log this in the engine: when the measured true peak limits the gain, report the real loudness rather than claiming the target.

**Reading the denoise result.** With our in-band pink noise, none of the FFmpeg chains gives much SNR gain. This is the honest result. It does not prove that `afftdn` fails on real room noise, which is often not in-band. Test on real recordings before setting a default.

**Learned denoisers.**

| Model | Input rate | Sandbox RTF (offline, full clip) | Vendor or other claim |
|---|---|---|---|
| GTCRN (DNS3 checkpoint) | 16 kHz only (`infer.py` asserts 16000) | Pending, see below | README: RTF **0.07** streaming on i5-12400 (vendor). 48.2 K params, 33 MMACs/s. |
| DeepFilterNet3 | 48 kHz | **Pending**, see below | Repo and paper claim real time on a notebook CPU (vendor). |

## Candidate details

### ADOPT: FFmpeg built-in filters

- **Source.** Filters `afftdn`, `deesser`, `dynaudnorm`, `speechnorm`, `acompressor` and `loudnorm` exist in the local FFmpeg 6.1.1 (`ffmpeg -filters`, `ffmpeg -h filter=<name>`). Filter code lives in libavfilter, which is LGPL-2.1+ by default. **(unverified for our shipped build.)** ADR 0002 requires an LGPL-safe build, so check with `ffmpeg -buildconf` on the build we ship. The local build is GPL (`--enable-gpl`, `libx264`, `libx265`), so it cannot prove this.
- **Maintenance.** Part of FFmpeg, which is actively released.
- **Gotchas.**
  - `deesser` `i` defaults to **0**, a no-op. Set it explicitly. Our tests confirmed the no-op.
  - `loudnorm` in `linear=true` mode can miss the target when true peak limits gain (measured above). Use `print_format=json` in pass 1 and pass the measured values in pass 2.
  - `afftdn` on in-band noise gives small SNR gains. Do not promise noise removal without a learned model.
  - `highpass` before `afftdn` cost 7 dB of SNR on our material. Keep it optional.
- **Score (reference, no intake needed because nothing new is added):** licence 15 (LGPL build not yet confirmed), maintenance 20, security surface 20 (no network, no download), footprint 15 (already present), fit 15, quality 6 (no tests yet in our repo). **Total 91.**

### MAYBE: GTCRN (Xiaobin-Rong/gtcrn)

- **Code licence.** MIT, LICENSE file fetched (`Copyright (c) 2024 Rong Xiaobin`).
- **Maintenance.** Newest commit 2026-08-03. Open issues include #102 (howling, opened 2026-08-17), #73 (`StreamConvTranspose2d error`, 2025-08-21) and #98 (no VST plugin, 2026-06-02). Titles only, bodies not read.
- **Weights.** `checkpoints/model_trained_on_dns3.tar` (580 KB) and `model_trained_on_vctk.tar` (737 KB). Each is a PyTorch zip archive (`archive/data.pkl`), so loading runs pickle. **Escalates** under the intake policy section 4. The README gives the training sets as DNS3 and VCTK-DEMAND. Their licences are inherited and unverified.
- **Model fit.** 16 kHz only. Our timeline is 48 kHz, so a denoise step would resample down and back up. Expect high-frequency loss. Speed and quality on our material: see the sandbox timing below.
- **Safe path if a human approves.** In a sandbox, load the checkpoint once with `torch.load(..., weights_only=True)`, convert the state dict to `safetensors`, record SHA-256 of both files, and ship only the safetensors file. Note the RTF gap between the README streaming figure and offline inference.
- **Score:** licence 20, maintenance 20, security 10 (pickle source, minus 5 for the native torch code path and 5 for the weights format), footprint 8, fit 15, quality 6. **Total 79 before escalation.** Escalation applies anyway, so verdict MAYBE.

### MAYBE: RNNoise weights (via FFmpeg `arnndn`)

- **Code.** `xiph/rnnoise` COPYING: BSD-style three-clause licence, copyright Valin, Amazon and Mozilla (fetched). Newest commit 2025-02-22, which is about 20 months old. The FFmpeg `arnndn` filter is maintained, so use it as the carrier.
- **Weights.** `GregorR/rnnoise-models` (last commit 2018-09-02) has **no LICENSE file** (raw fetch returned 404). Its README says "none of this work is creative and thus none of it is subject to copyright." That is an author's statement, not a licence, and the policy says a missing licence means all rights reserved.
- **Issues.** xiph/rnnoise #284, opened 2026-09-04 and still open: "Please state the license of the distributed model weights (rnnoise_data-*.tar.gz)". This matches the blocker. Also #250 (poor results at 16 kHz), #262 (reduces some vocals on current main), #242 (why 48 kHz).
- **Decision.** Escalate. Do not ship any model file from that repo until its licence is clear.

### MAYBE: SpeechBrain (speechbrain/speechbrain)

- **Code.** Apache-2.0 (LICENSE fetched). Newest commit 2026-10-14.
- **Models.** `speechbrain/sepformer-whamr-enhancement` (HF tag `apache-2.0`, not gated, last modified 2024-02-25, 8 kHz, denoise plus de-reverb on WHAMR!). `speechbrain/metricgan-plus-voicebank` (apache-2.0, last modified 2024-02-28). Files are `.ckpt`, which is pickle-based and escalates under policy section 4.
- **Dataset licence.** WHAMR! is the training set. Its site (`wham.whisper.ai`) returned a certificate-name error, so its licence is **(unverified)**. Check before shipping, because a non-commercial dataset would bar the model under our rules.

### MAYBE: python-audio-separator (nomadkaraoke) and Spleeter (deezer)

- **audio-separator.** MIT (LICENSE fetched, newest commit 2026-10-01). Models come from the UVR project (Anjok07, aufr33) and are downloaded on first use into `--model_file_dir`, so they are **run-time downloads without pinned hashes**. The README asks users to credit UVR but states no model licence. Its README says the models can remove echo and reverb, which makes it the only de-reverb option with an actively maintained runner. Model licences are **(unverified)** and must be checked per model file.
- **Spleeter.** MIT for the code only ("The code of Spleeter is MIT-licensed", README). Its pretrained models (2-stem and 4-stem, trained on Deezer data) have no stated licence in the repo. Newest commit 2026-06-18. Escalate.

### MAYBE: DeepFilterNet (Rikorose/DeepFilterNet). Verdict: REJECT under the gates

- **Code.** Dual MIT or Apache-2.0 (`LICENSE-MIT` and `LICENSE-APACHE` fetched). Newest commit in the clone: **2024-10-17**. That is about two years old, so it **fails hard gate 6** (12-month maintenance) and has no maintained fork.
- **Weights.** `models/*.zip` are real archives (DeepFilterNet3.zip 7,986,207 bytes, DeepFilterNet3_onnx.tar.gz 7,983,136 bytes). No separate weights licence is stated; the repo LICENSE covers "all code in this repository" (README). The model licence is therefore **(unverified)**.
- **Runtime fetch.** Python `df/enhance.py` `maybe_download_model()` downloads `https://github.com/Rikorose/DeepFilterNet/raw/main/models/<name>.zip` on first use, with no hash check. Our rules forbid runtime fetch without a pinned SHA-256, so a vendored, hash-pinned zip is required.
- **Native code.** The PyPI package `deepfilternet` 0.5.6 (MIT) depends on a native wheel `deepfilterlib`. Native binaries from a download escalate.
- **Issues (titles, from the public issue page).** #661 "DeepFilterNet causes crackling in heard audio only when actively speaking" (closed 2026-01-22). #657 "DeepFilter3 causes spectral distortion" (closed 2025-12-11). #708 "RandReverbSim blends dry speech with a time-unaligned RIR-convolved signal when building the dereverberation target" (open). #353 "[LADSPA] Real-time audio processing produces bad quality and choppy audio" (closed 2023-07-14).
- **Speed (sandbox, offline).** See the measurement table below. The paper and the repo claim real time on a notebook CPU (vendor). Our figure is the one to trust.
- **Why REJECT and not MAYBE.** Gate 6 is a stop, not a score. Escalation is only for licence or format gaps, not for a stale repository. A human could still approve a vendored, hash-pinned copy as an explicit exception, so the project can revisit it.

### REJECT and why

- **Resemble-Enhance** (resemble-ai/resemble-enhance). Code MIT (LICENSE fetched). HF `ResembleAI/resemble-enhance` card `license: mit`, not gated. The **enhancer weights are one 713,176,232-byte `.pt` file** (`enhancer_stage2/ds/G/default/mp_rank_00_model_states.pt`). The code loads it with `torch.load` (pickle) and downloads it with `torch.hub.download_url_to_file` from Hugging Face with **no SHA-256**. The download is over the 500 MB per-plugin cap. Requirements are unpinned (`>=`) and include `deepspeed`. Newest commit 2024-12-03 (fails gate 6).
- **Facebook denoiser** (facebookresearch/denoiser). LICENSE is "Attribution-NonCommercial 4.0 International" (fetched). Deny list.
- **DTLN** (breizhn/DTLN). MIT (LICENSE fetched), newest commit 2022-04-26. Fails gate 6.
- **Demucs** (facebookresearch/demucs). MIT (LICENSE fetched). README: "this repository is not maintained anymore", and the author points to a fork that is also "not actively maintained anymore". Newest commit 2023-11-16. Fails gate 6. The htdemucs model is trained on MUSDB HQ plus 800 songs, and MUSDB terms are academic (see the older research doc). Downgraded from MAYBE.
- **Open-Unmix** (sigsep/open-unmix-pytorch). MIT code, newest commit 2024-04-16 (fails gate 6). Default `umxl` weights: "only licensed for non-commercial use (CC BY-NC-SA 4.0)" (README). `umxhq` is trained on MUSDB18-HQ. Deny.
- **MossFormer2 SE 48K** (modelscope/ClearerVoice-Studio). Code Apache-2.0 (LICENSE fetched), newest commit 2025-08-14 (fails gate 6). HF `alibabasglab/MossFormer2_SE_48K` is Apache-2.0 but ships `last_best_checkpoint.pt` (pickle).
- **nara_wpe** (fgnt/nara_wpe). MIT (LICENSE fetched), newest commit 2025-03-19 (about 19 months, fails gate 6). It is a classical weighted-prediction-error de-reverb with no model file, so the algorithm is a candidate to re-implement from the published method by our own code. That would need its own decision.
- **pyloudnorm** (csteinmetz1/pyloudnorm). MIT, newest commit 2026-01-04. Measurement duplicates FFmpeg `loudnorm`.
- **ffmpeg-normalize** (slhck). MIT (LICENSE.md fetched), newest commit 2026-10-14. Good tool, but it only wraps the FFmpeg recipe that the engine can build itself. Searching its issue list returned no open issues about `loudnorm`.
- **Matchering** (sergree/matchering). GPL-3.0 (LICENSE fetched). Strong copyleft. Human decision only.

### Other older rows

- **RNNoise (code)** is covered above. **Piper, Kokoro, MeloTTS, Chatterbox and the rest** are not repeated; the existing [voice and audio](oss-voice-and-audio.md) research still stands for TTS. Not re-verified in this pass.

## Corrections to the existing voice and audio research

[oss-voice-and-audio.md](oss-voice-and-audio.md) rated three items too high, based on secondary sources:

1. **DeepFilterNet, ADOPT.** Should be **REJECT under the gates** (stale repo, runtime fetch with no hash, native wheel). Its own recommendation to "run DeepFilterNet on the voice track alone" stays true for any future approved use.
2. **RNNoise / `arnndn`, ADOPT (fallback).** Should be **MAYBE**. The weights have no licence, and an open issue asks for one.
3. **Demucs, MAYBE.** Should be **REJECT** (not maintained, last commit 2023-11, MUSDB academic terms).

## Wrapper design for the ADOPT items

None of the ADOPT items needs a separate process beyond the FFmpeg that the renderer already runs, so no new plugin is required. Build a small, typed **enhance-voice** step in `packages/core` that produces one FFmpeg filter chain for the voice track, placed before the existing sidechain ducking in the mix.

**Typed parameters (no free-form arguments, per AGENTS.md):**

| Parameter | Type and range | Maps to |
|---|---|---|
| `denoise` | `"off"` or `{ reductionDb: number }`, `reductionDb` in 0 to 30 | `afftdn=nf=-<reductionDb>` |
| `deEss` | `"off"` or `{ intensity: number }`, intensity in (0, 1] | `deesser=i=<intensity>` (never 0) |
| `leveling` | `"off"`, `"speechnorm"` or `"dynaudnorm"` | `speechnorm=e=12.5:r=0.0001:l=1`, `dynaudnorm=f=500:g=31` (fixed values, tuned later) |
| `loudness` | `{ targetLufs: number, truePeakDb: number }` with targetLufs -24 to -9 and truePeakDb -3 to -1 | two-pass `loudnorm` |

**Pipeline.**

1. Validate the parameter object. Throw a clear error on any value out of range (AGENTS.md: validate, do not use `!`).
2. Build the chain as a pure function that returns the filter string. The function never mutates input, and times are in seconds (timeline time, stated in the doc comment).
3. For `loudness`, run pass 1 with `loudnorm=...:print_format=json -f null -` and parse the JSON from stderr. Pass 2 adds `measured_I`, `measured_TP`, `measured_LRA` and `measured_thresh`, plus `offset` and `linear=true`. Report the achieved loudness and whether the true-peak ceiling limited the gain.
4. Render the cleaned voice track to a temp WAV, then feed it to the existing mix with ducking.

**Tests (offline, lavfi-generated, no committed media).**

- Golden tolerance: `loudness` lands within 0.5 LU of target when the true-peak ceiling does not bind, and reports the limit when it does.
- `deEss` with intensity 0 is rejected by validation, so the no-op gotcha cannot happen silently.
- Denoise output SNR on a synthetic noisy tone is at least the input SNR (no regression), with a tolerance of 0.2 dB.
- Filter string golden test for each parameter combination.

**Not yet decided (for a human).** The default values for `reductionDb`, `intensity` and `targetLufs` need listening tests on real speech before we set them. The LGPL status of the shipped FFmpeg build must be confirmed first (ADR 0002).

## Needs a human

1. **GTCRN checkpoint.** Approve converting the `.tar` pickle zips to `safetensors` in a sandbox and shipping the converted file with its SHA-256, or reject. The model is 16 kHz only.
2. **RNNoise weights licence.** Ask the maintainers of `GregorR/rnnoise-models` (or the xiph issue #284) for a licence. Until then no model file from that repo ships.
3. **De-reverb.** No adoptable tool passes every gate. Decide between (a) a spike that re-implements WPE from the published method in our own code, (b) the UVR de-echo models via audio-separator after their licences are read per file, or (c) skip. Checking the WHAMR! dataset licence (for SpeechBrain) is part of (b).
4. **Voice isolation (music or background removal).** Spleeter and audio-separator need model-licence reads. Demucs and Open-Unmix are rejected. There is no clean option yet.
5. **DeepFilterNet quality exception.** The best measured or reported quality is in a repo two years stale with runtime fetch. If a human wants it, they must approve a vendored, hash-pinned copy and accept the gate-6 exception. Recorded here so the decision is visible.
6. **Voice cloning and consent.** Not in scope here. Any voice-cloning feature still needs the consent review in the existing voice research.

## Sources

Fetched or cloned in this session (2026-10-18):

- Resemble-Enhance: https://raw.githubusercontent.com/resemble-ai/resemble-enhance/main/LICENSE ; https://raw.githubusercontent.com/resemble-ai/resemble-enhance/main/README.md ; https://github.com/resemble-ai/resemble-enhance (git clone, HEAD 8e978149, 2024-12-03; files `resemble_enhance/enhancer/download.py`, `enhancer/inference.py`, `requirements.txt`) ; https://huggingface.co/ResembleAI/resemble-enhance (model API: `license` in card, `gated: false`, file sizes) ; https://huggingface.co/ResembleAI/resemble-enhance/raw/main/README.md
- DeepFilterNet: https://github.com/Rikorose/DeepFilterNet (git clone, HEAD d375b2d8, 2024-10-17; `LICENSE-MIT`, `LICENSE-APACHE`, `README.md`, `models/`, `pyDF`) ; https://pypi.org/pypi/deepfilternet/json (version 0.5.6, MIT, deps) ; https://github.com/Rikorose/DeepFilterNet/issues (titles via WebFetch)
- RNNoise: https://github.com/xiph/rnnoise (git clone, 2025-02-22; `COPYING`) ; https://github.com/GregorR/rnnoise-models (git clone, 2018-09-02; README; raw LICENSE returned 404) ; https://github.com/xiph/rnnoise/issues (titles via WebFetch)
- GTCRN: https://github.com/Xiaobin-Rong/gtcrn (git clone, 2026-08-03; LICENSE, README, `infer.py`, `gtcrn.py`, `checkpoints/`) ; issue titles via WebFetch at https://github.com/Xiaobin-Rong/gtcrn/issues
- Demucs: https://github.com/facebookresearch/demucs (git clone, 2023-11-16; LICENSE, README)
- Open-Unmix: https://github.com/sigsep/open-unmix-pytorch (git clone, 2024-04-16; LICENSE, README)
- Spleeter: https://github.com/deezer/spleeter (git clone, 2026-06-18; LICENSE, README)
- python-audio-separator: https://github.com/nomadkaraoke/python-audio-separator (git clone, 2026-10-01; LICENSE, README)
- Facebook denoiser: https://github.com/facebookresearch/denoiser (git clone, 2022-12-02; LICENSE)
- DTLN: https://github.com/breizhn/DTLN (git clone, 2022-04-26; LICENSE)
- nara_wpe: https://github.com/fgnt/nara_wpe (git clone, 2025-03-19; LICENSE)
- ClearerVoice-Studio: https://github.com/modelscope/ClearerVoice-Studio (git clone, 2025-08-14; LICENSE) ; https://huggingface.co/alibabasglab/MossFormer2_SE_48K (model API)
- SpeechBrain: https://github.com/speechbrain/speechbrain (git clone, 2026-10-14; LICENSE) ; https://huggingface.co/speechbrain/sepformer-whamr-enhancement/raw/main/README.md ; model API for `speechbrain/sepformer-whamr-enhancement`, `speechbrain/metricgan-plus-voicebank`, `speechbrain/sepformer-wham16k-enhancement`
- ffmpeg-normalize: https://github.com/slhck/ffmpeg-normalize (git clone, 2026-10-14; LICENSE.md)
- pyloudnorm: https://github.com/csteinmetz1/pyloudnorm (git clone, 2026-01-04; LICENSE)
- Matchering: https://github.com/sergree/matchering (git clone, 2026-10-07; LICENSE, GPL-3.0)
- Existing research read first: `docs/research/oss-voice-and-audio.md`, `docs/research/open-source-radar.md` (intake policy), `docs/adr/0009-autonomous-open-source-intake.md`.

Local measurements: FFmpeg 6.1.1 (`ffmpeg -filters`, `-h filter=`), espeak-ng test speech, numpy FFT SNR script, torch CPU (GTCRN), DeepFilterNet 0.5.6 Python package with the DeepFilterNet3 model unpacked from the cloned repo. Scratch files are under the session scratchpad and are not committed.

Not reached: WHAMR! dataset site (certificate error). GitHub issue bodies (API and `gh` blocked for unattached repos in this session; titles only via public pages). Listening tests (none).
