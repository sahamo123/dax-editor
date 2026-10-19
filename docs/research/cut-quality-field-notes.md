---
type: Research
title: Cut quality field notes
description: Real failures users report from automatic cutting tools (clipped words, breaths, music, drift, VFR, clicks), how others fixed them, what packages/core/src/cuts.ts already handles, and the concrete change or test each one needs, plus licence-checked datasets for a cut-quality eval.
tags: [research, cuts, field-notes, silence, eval, datasets, licensing, vfr, music, breaths]
status: draft
generated:
  by: process:scribe
  at: 2026-10-18T21:00:00Z
---

# Cut quality field notes

Written 2026-10-18 by the scout, as a gap sweep on cutting quality. It reads [cut intelligence](cut-intelligence.md) and `packages/core/src/cuts.ts` first, so it does not repeat the design. This note adds what users actually hit, checks each failure against the code, and says what to change.

**How to read the claims.** *(fetched)* means the page or API result was read with a fetch tool this session. *(search snippet)* means only the search result was seen. *(unverified)* means from memory or a secondary source. *(code read)* means read in this repository this session.

---

## 1. Summary

1. **Word endings and onsets get clipped in real use, and our word-gap path does not guard them.** Auto-editor users report word-final "s" sounds cut off, and whole word starts lost, at small margins (fetched: auto-editor issues #419, #364, #582, #176). Our onset and tail handling is symmetric and has no fricative hangover.
2. **Our word-gap pause cut ignores energy, so music and non-speech sound between sentences gets deleted.** This is the largest gap found. `planCuts` cuts any gap longer than `pauseMin` between ASR words, with no look at the audio inside the gap (code read). Commercial tools hit the same failure (fetched: Adobe bug report, March 2026, which says transcript pause removal cut dialogue and removed music). Fix: an energy gate on each gap (section 3, F4).
3. **A/V drift after many cuts is a real, reported failure in other tools**, including 0.02 s per cut and 1 s over 20 minutes at 59.999 fps (fetched: auto-editor #424, #403). Our render path is seconds-based and re-encodes, which is the right design, but the probe reads the wrong frame rate for VFR sources (code read: `media.ts` uses `r_frame_rate`). A drift test is missing.
4. **Breaths are deleted with the pause.** Practitioners and Auphonic keep breath onsets and attenuate instead (fetched: Auphonic blog). Our engine has no breath class (code read).
5. **The filler-word premise in the design note is wrong as stated.** The design says Whisper's English normaliser removes um/uh before our code sees them. The openai-whisper `transcribe()` path does not call any normaliser (fetched: `whisper/transcribe.py` and `whisper/decoding.py`). The filler loss is real in practice, but its cause is not the normaliser. Correction in section 6.
6. **No primary user complaints about Gling or TimeBolt cut quality were found.** Reddit was not reachable (section 2). What exists is marketing copy and one unverified listing (section 5).

---

## 2. Method and limits

- **Reddit:** `WebSearch` refuses reddit.com as a domain, and `WebFetch` on old.reddit.com was refused. No Reddit evidence is included. This is the main gap in this sweep.
- **GitHub:** The `gh api` search endpoint is blocked for this session (403, repository-scoped sessions). `WebFetch` on `api.github.com/search/issues` returned results, and individual issue pages were fetched. Results come through a summariser, so issue text is paraphrased. Quotes are kept short.
- **Hacker News:** Algolia search returned few relevant stories. Comments returned nine matches, mostly opinion on jump cuts (section 3, F14). HN gives no field evidence for clipping.
- **Vendor and aggregator pages:** Used only as evidence of what vendors claim, never as evidence of failure rates.
- **Not checked:** Descript, Kdenlive and Shotcut threads beyond search snippets; jumpcutter issue bodies beyond titles and counts; whisper.cpp filler behaviour.

---

## 3. Failures, evidence, fixes, and what cuts.ts does

Each row: the failure, the evidence, how others solved it, what `cuts.ts` does today (code read), and the change. "Gate" means a test that blocks a merge, per the metrics table in [cut intelligence, section 5](cut-intelligence.md#5-cut-plan-data-model-review-and-metrics).

### F1. Word endings clipped, especially word-final "s" and soft tails

- **Evidence:** auto-editor #419 (opened 2024-01-23): audio "cuts off too early when a word ends in an s sound". Follow-up on 2026-06-24 cites "process" (fetched). #582 (2024-10-31): default silence removal "sometimes cut word endings or half of a word" on a quiet, inconsistent-volume podcast. Denoising with RNNoise helped only partly (fetched). #176 (2021): "speech tends to start loudly and fade at the end, so a single margin can clip word endings". Fixed by separate start and end margins, `--frame_margin 3,8` (fetched).
- **How others solved it:** Asymmetric padding, with more kept after speech than before it (#176). Tella keeps quiet consonants by protecting soft speech from cuts (fetched: Tella docs).
- **cuts.ts today:** Word path: `left = max(padPost, keepPause/2)` and `right = max(padPre, keepPause/2)`. For `standard` both are 0.15 s, so the pad is symmetric (code read). Speech-span path (no transcript): spans end where energy falls below `floor + 6 dB`, and the cut starts `left` after that. A tail that is quieter than `floor + 6 dB` for more than 0.15 s is cut.
- **Change:**
  - Split the pause so the tail gets more: for `standard`, `left` 0.20 and `right` 0.10. The sum stays 0.30 (the keep length), so the total is unchanged.
  - Add a hangover to speech-span ends: keep speech 120 ms past the `floor + 6 dB` crossing, unless the next 120 ms are below `floor + 3 dB`.
  - Snap rules from the design (zero-crossing snap, energy-minimum snap within 80 ms) may only move an end later, never earlier.
  - **Test:** synthetic word of 0.30 s tone followed by a 0.20 s fricative (noise) at `floor + 4 dB`. Gate: fricative kept in full (no cut inside it, and at most 10 ms lost).

### F2. Word starts clipped, soft onsets lost

- **Evidence:** auto-editor #364 (opened 2023-08-08): clips "start too late when the margin is below 6"; "Now" begins at "ow". Some clips "lose the last word or part of it". Fixed in 23w32a, per the maintainer (fetched).
- **How others solved it:** A larger start margin (6 frames). The maintainer's fix was not described in the thread (fetched).
- **cuts.ts today:** Head pad is `padPre` (0.10 standard) before the first word, and the word path does not look at energy at all, so a soft onset is safe when a transcript exists. The speech-span path starts speech at `floor + 10 dB`, so a soft "s" or "f" onset may be missed, and then trimmed by the pad. Note that `padPre` in the preset table is overridden by `keepPause/2` (code read), which the design note does not say.
- **Change:** Document the effective pads (`max(preset pad, keepPause/2)`) in the design note, and decide whether the preset values or the derived values are intended. For the speech-span path, look 60 ms before each span start for energy above `floor + 6 dB` and extend the start there.
- **Test:** synthetic onset with a 0.08 s soft consonant at `floor + 6 dB` before a vowel. Gate: onset kept.

### F3. Noisy or quiet rooms: pauses missed, or speech cut

- **Evidence:** #582 as above. Tella handles steady noise such as fans or hiss by not letting it block pauses, while protecting quiet speech (fetched). Violet Recording's tool asks users to raise the threshold when quiet speech is cut and lower it when hiss is kept (search snippet only).
- **cuts.ts today:** Handled. Per-asset floor (10th percentile, 20 ms RMS) and hysteresis are implemented (code read; tests at `cuts.test.ts` lines 37-95 and 334-346 cover noisy and quiet rooms).
- **Change:** None to the detector. For the word path the floor is not used at all, so F4's gate is the place to add it. A pre-denoise step is an option (speech denoising is a separate plugin, see [open-source voice and audio](oss-voice-and-audio.md)). Denoising helped partly in #582, but it changes the sound, so it should be opt-in and checked by the eval.

### F4. Music, laughter and non-speech sound inside a cut gap (largest gap)

- **Evidence:**
  - Adobe Premiere bug report, 2026 (fetched): pause detection in transcript editing "is misaligned with the waveform", so "removing pauses ... can cut spoken audio". A later user (June 2026) reports clips starting with several seconds of dead air and dialogue cut short (fetched). A user editing piano content says the transcript tool also removed music (search snippet on the community thread).
  - Silero VAD issue #663 (closed, not planned): piano and guitar are detected as speech (fetched). Issue #121 asks for music classification (fetched, closed, no implementation).
  - jumpcutter (code, quoted in search snippet): loudness threshold is relative to the file's peak, so a constant music bed never reads as silence.
  - Tella (fetched): a pause counts as silence only when every audible track is quiet at the same time. Loud music, applause and sound effects are always kept.
  - Auphonic (fetched): after the opening silence is removed, no further cuts are made under background music.
- **cuts.ts today:** Word path: any gap between consecutive ASR words longer than `pauseMin` is cut, and the energy inside the gap is never read (code read, lines 312-343). So a music bed or laughter between two sentences, which ASR does not transcribe, is removed. The speech-span path is safer, because music counts as speech there and is never cut, but it loses real pauses.
- **Change (highest priority):**
  - Pass the audio levels into the planner: add an optional `levels?: AudioLevels` to `PlanInput`.
  - For each candidate pause, take the maximum 20 ms frame level inside the gap. If it is at or above `floor + 10 dB` (the speech-on threshold), do not propose a pause cut. Record it as a decision with `kind: "pause"`, `status: "proposed"`, and reason "gap is not silent (music or sound), not cut", so the user can still choose it. A new `CutKind` value such as `non_silent_gap` is cleaner.
  - Keep the head and tail rules as they are, but apply the same check to them.
  - **Test:** a music fixture (sum of sines at -30 dBFS under speech, with 1.5 s gaps that contain only the music) with word timings from the speech only. Gate: 0 s of music removed, and the same fixture without music still removes the gaps (no regression on pause removal).
  - **Second test:** a fixture where an Adobe-style offset error moves the transcript word boundaries 0.3 s late. Gate: no word removed (the energy check and the pad combined should catch it).

### F5. Breaths deleted with the pause (rushed or chopped sound)

- **Evidence:** Auphonic (fetched) keeps breath onsets just before speech resumes, so the recording sounds natural. Tella does not discuss breaths (fetched). SimpleClean and StreamGeeks (search snippets) recommend reducing breaths, not deleting them, to avoid robotic silence. The consensus is in [cut intelligence, section 2](cut-intelligence.md#breaths-and-room-tone).
- **cuts.ts today:** No breath class. A breath inside a long gap is removed with the gap, because the cut covers `[a.end + left, b.start - right]`. Presets do not differ on breaths (code read).
- **Change:** Add a breath check inside each removed gap: a run of 150-600 ms whose level is 15-30 dB below the surrounding speech, found from the same 20 ms frames. Keep it, and attenuate it by 12 dB, by splitting the clip at the breath and setting the clip `volume` (the render path already supports per-clip volume, code read). Add `CutKind` `breath` with `action` attenuate. Preset values follow the design table.
  - **Test:** synthetic 0.40 s breath at -38 dBFS in a 1.0 s gap. Gate: breath present in output at -12 dB ±1 dB; output gap total still at most `keepPause` + 0.05 s.

### F6. Over-cutting: pauses that carry meaning, flattened pacing

- **Evidence:** Tella's three modes (natural, fast, faster) and Kapwing's advice to lower sensitivity for podcasts (search snippet) show that users need levels of aggressiveness. SoundGirls (search snippet) warns against over-editing podcasts.
- **cuts.ts today:** Five presets exist, and `podcast` keeps 0.6 s pauses at `pauseMin` 1.2 s (code read). `tight` cuts pauses above 0.35 s down to 0.15 s, which is short for natural speech.
- **Change:** None to presets now. Add the leftover-pause metric from the design note as a report, and gate `tight` only. Ask the owner whether a fourth axis is needed (a "keep pauses over X seconds" option, like Tella's modes) before adding one.

### F7. Filler words: missed, or real words removed

- **Evidence:**
  - Community reports: mlx-whisper drops most "um/uh" by default; the fix is a hesitation prompt plus `condition_on_previous_text=False`, and the author warns this can hallucinate words (search snippet, third-party tool).
  - An arXiv study on non-native speech says prompting makes disfluencies more likely and also causes hallucinated words (search snippet).
  - HN comment 26559366 (2021): "automated tools struggle to remove ums and ahs or trim stutters" (fetched via HN comment search).
  - CrisperWhisper keeps fillers, but its licence is CC-BY-NC-4.0 (search snippet). Denied by policy.
- **cuts.ts today:** `DEFAULT_FILLERS` in `transcript.ts` is `um, umm, uh, uhh, er, erm, hmm, mm` (code read). `er` and `erm` can be real words. `mm` removes listener backchannels ("mm-hmm") from the other speaker in a two-person recording, which is a crosstalk failure. Presets use the same list.
- **Change:**
  - Drop `er` and `erm` from the default list. Keep them only for a `standard` preset opt-in, as the design note says.
  - Do not remove `mm`, `mhm` or `hmm` when the next word is from another speaker or starts within 0.3 s of another speaker's word (needs speaker turns; without them, do not remove `mm` at all).
  - **Test:** fixture with "I mean er the plan" (real word "er" as a stutter) and "mm-hmm" as a backchannel between two sentences. Gate: backchannel kept; filler only where the preset says so.
  - Correct the claim about the normaliser (section 6).

### F8. Retakes and false starts: near-misses and mis-timed matches

- **Evidence:** Practitioner advice in the design note (search snippets). No primary OSS complaint was found this sweep.
- **cuts.ts today:** False start is a restated first two tokens, at confidence 0.75, proposed only. Retake is a Jaccard similarity of at least 0.8 over at least four tokens, at 0.6, proposed only. Phrases split at gaps of 0.5 s or more (code read). Both are proposals, so no auto-apply risk.
- **Change:** A retake separated by 0.4 s of pause is not split into two phrases, so it is missed. Lower the phrase gap to 0.3 s for the retake check only, and add a test. Keep both as proposals.

### F9. Audio and video drift after many cuts

- **Evidence:**
  - auto-editor #424 (2024-02-04): drift of about 0.02 s per cut in DaVinci Resolve, with 0.01 s gaps (fetched).
  - auto-editor #403 (2023-11-25): about 1 s late over 20 minutes, Premiere, source 59.999024 fps (fetched).
  - auto-editor #38 (2020): speed option caused drift that grew over time; fixed in 20w29a (fetched).
  - jumpcutter #104: audio lags video in mp4, mkv and ts outputs (fetched via the jumpcutter issue list, title and count only).
  - Adobe and Cinelerra threads (search snippets): cuts off frame boundaries desync audio.
- **cuts.ts and render today:** Cuts are in source seconds. Render uses `trim` and `atrim` on the input, `setpts`/`asetpts` reset, `aresample=48000` and an `fps` filter per clip (code read, `render.ts` lines 101-160). This is frame-accurate and re-encodes, so per-cut drift from keyframes does not apply. But `media.ts` takes `asset.fps` from `r_frame_rate` (code read, line 58), which is the lowest common rate, not the true average, for VFR sources.
- **Change:**
  - Probe `avg_frame_rate` as well, and mark an asset VFR when the two differ by more than 0.1 %.
  - Add an eval (not a unit test): build a 59.94 fps fixture and a VFR fixture (timestamps jittered with `setpts`), apply 50 random cuts, render, and compare video duration with audio duration. Gate: difference at most one frame (16.7 ms at 60 fps) at the end, and at most 0.5 frame at any cut.
  - Do not use the CFR conversion in the StaxRip wiki as the default. It says CFR conversion can leave mid-video drift on highly variable VFR (fetched). Ingest-time CFR conversion should be a logged, separate step.

### F10. VFR sources in general

- **Evidence:** StaxRip wiki (fetched): VFR or dropped frames throw off sync in frame-indexed tools; fixes are remux to MKV, timestamp extraction, or CFR conversion at the source; VFR to CFR can still drift.
- **cuts.ts today:** Not handled beyond F9 (code read).
- **Change:** As F9. Add a warning to the plan result when the source is VFR, so the user knows the cut times are reliable but the picture was re-timed.

### F11. Clicks and pops at cut joins

- **Evidence:** Audacity and video forum threads (search snippets): cut at a non-zero crossing gives a click; fix with a zero-crossing snap and a crossfade of about 10 ms; long fades dull consonants. The community notes are general, not about auto-editor.
- **cuts.ts and render today:** Each kept clip has an 8 ms fade at each join side (`JOIN_FADE`, code read in `render.ts`), and a test for sustained-tone splices exists (`cuts.test.ts` line 366). No zero-crossing snap is implemented. The design note recommends a 15-20 ms overlap crossfade with duration preservation (cut-intelligence, step 5). The code does not do that.
- **Change:** Decide between the two designs. The current one dips to near zero for about 16 ms at each join. That may be inaudible between words, but it has not been measured. Add the zero-crossing snap (within 5 ms, moving the cut only into the pad). Gate: sample-jump ratio at most 5, as in the design note.

### F12. Multi-speaker crosstalk and speaker turns

- **Evidence:** No open cut-tool complaint found this sweep. VoxConverse (fetched) is a research dataset of overlapping speech, but its licence wording is a problem (section 4).
- **cuts.ts today:** Speaker identity is not used. Overlapping words make a negative gap, which is never cut (safe). But a cut can fall between one speaker's last word and another's reaction, with nothing to protect the reaction (code read).
- **Change:** Unverified need. Add a test with a two-speaker synthetic fixture where speaker B's short reply sits in A's pause. Gate: B's reply kept. Speaker turns can come from a diarisation step later (see the licence notes on pyannote in cut-intelligence).

### F13. Transcript and audio disagree (ASR timing)

- **Evidence:** WhisperX README: utterance-level timestamps "can be inaccurate by several seconds" (verified in cut-intelligence). Adobe report above (F4) is the same failure as a product bug.
- **cuts.ts today:** Trusts word times fully; no check against energy (code read).
- **Change:** Covered by the F4 energy gate, which also protects against timing errors. Add the offset test from F4.

### F14. Jump-cut pacing and viewer taste

- **Evidence:** HN comment 33947617 (2022): "podcast episodes contain many cuts that are hard to hear but obvious on video" (fetched). HN comment 29498476 (2021): YouTube's jump-cut "authentic" style is staged (fetched). Descript made jump cuts optional after feedback (search snippet).
- **cuts.ts today:** Nothing on the picture side; a jump cut is always hard (code read).
- **Change:** The design note already has a punch-in option. Add a plan-level `visual` setting (`hard`, `punch`, `none`) for later, with a note in the spec. Not urgent.

### Other checks

- **Long files:** A 2021 Adobe thread reports fewer markers on a one-hour file than on a 25-minute one (search snippet only). `analyzeAudio` streams the decode and keeps one float per 20 ms frame (code read), so memory is about 180k numbers per hour. Add a test on a long synthetic file (10 minutes) to confirm that the number of pauses is stable when the file is split and re-joined.
- **Clicks at source boundaries:** No issues found. Covered by F11.

---

## 4. Datasets and benchmarks (licence-checked)

Policy: [open-source radar, intake policy](open-source-radar.md#intake-policy) section 2 and section 4. A dataset's licence is inherited by anything built from it. "Research only" and non-commercial terms are on the deny list, so they are rejected without an exception.

| Dataset or benchmark | Licence (as checked) | Verdict | Use for cut-quality eval |
|---|---|---|---|
| Our synthetic fixtures (FFmpeg `lavfi`, tone bursts, white noise, music from sine chords) | Ours | ADOPT | Primary. Known truth for words, fillers, breaths, music gaps, drift. Already the plan in cut-intelligence section 5. Add the fixtures listed in section 3. |
| LibriSpeech (openslr/HF dataset card) | CC BY 4.0 (fetched HF card, "License: cc-by-4.0") | ADOPT with attribution, if downloaded by a script at eval time and not committed | Clean read speech for a second test set. The card lists no word alignments (fetched). |
| LibriSpeech alignments, repo `CorentinJ/librispeech-alignments` | No LICENSE file and no licence statement (fetched) | REJECT (no licence means all rights reserved, policy section 3.4) | Do not use as ground truth. |
| Montreal Forced Aligner (software) | MIT (search snippet of an aggregator, unverified against the repo LICENSE) | MAYBE, needs a check of the LICENSE file | Could align LibriSpeech locally to make word truth. |
| MFA English acoustic model | Not found (search snippet) | ESCALATE | Needed before any aligner-based truth set. |
| AMI Meeting Corpus | CC BY 4.0, stated on the licence page, royalty-free, no non-commercial term (fetched) | ADOPT candidate for crosstalk tests, with attribution. Word timings not confirmed | Multi-speaker overlap test (F12). Confirm word timings on the corpus page first. |
| VoxConverse | README says "available to download for research purposes under CC BY 4.0", copyright of YouTube sources stays with owners (fetched) | REJECT under the "research only" deny rule; ESCALATE if a human wants an exception | Would be the overlap benchmark. |
| MUSAN (music, speech, noise corpus) | openslr page: one label, "Attribution 4.0 International (CC BY 4.0)", no per-subset licence (fetched). The paper says sources have mixed Creative Commons licences (search snippet). HF mirror claims CC or public domain (search snippet, unverified) | ESCALATE: per-file licence check needed before any use | Music and noise injection. Generating music and noise with `lavfi` avoids the question, so generate instead. |
| PodcastFillers (Zenodo record 7121457, Interspeech 2022) | Metadata licence: "noncommercial research purposes only", and "prohibits deploying technology developed using the PodcastFillers metadata" (fetched). Audio: CC-BY-3.0, CC-BY-SA-3.0, CC-BY-ND-3.0 per episode (fetched). Record Rights field: CC BY-NC 2.0 (fetched) | REJECT (non-commercial and research-only) | Would be the best filler truth set (35k filler labels, fetched). Do not use. |
| CrisperWhisper (verbatim Whisper variant) | CC-BY-NC-4.0 (search snippet) | REJECT (non-commercial) | None. |
| DisfluencySpeech | Licence not checked | UNVERIFIED | Possible filler set. Check the licence before any use. |
| Common Voice | Not checked this session | UNVERIFIED | Not needed for cut timing. |

**Recommended eval set:** synthetic fixtures for every failure in section 3 (they have exact truth and need no licence), plus LibriSpeech downloaded at eval time for a clean-speech check. AMI is an option for F12 after the word timings are confirmed.

---

## 5. Lower-value sources and what was not found

- **Gling:** Search returned product copy and one review on a listing site saying the app is "pretty slow and laggy" (search snippet). Its text editor can restore cuts, which suggests users do hit over-cutting (search snippet). No primary report about clipped words was found. Treat as unknown.
- **TimeBolt:** Search returned vendor pages and review aggregators. One listing says a multi-track audio bug has been open since January 2023 with a four-day support lag (search snippet, unverified). An Adobe Community post from 2021 recommends TimeBolt for silence removal, with no complaints (search snippet). Treat as unknown.
- **auto-editor issues about clipping are old and mostly closed as converted or fixed** (fetched): #364 fixed in 23w32a; #176 solved by comma-separated margins in 22w01a; #582 converted to a discussion (#593) with no code change.
- **auto-editor #85 (multiple audio tracks)** is a crash about a data stream read as audio, not a cut-quality issue (fetched).
- **Silero VAD:** Open issues on noise-only false alarms (#369, closed) and on music as speech (#663, closed not planned). Silero's own tests are vendor-reported (cut-intelligence).
- **jumpcutter:** Most of the 30 most-commented issues are install and environment problems (fetched list). The cut-quality ones are #104 (audio lag, title only), #159 (noise amplified, title only) and #16 (speed). Title-level evidence only.
- **Premiere Pro transcript pause removal:** The bug report (fetched) is the richest primary complaint about pause removal from any product in this sweep, and it lines up with F4.

---

## 6. Corrections to the cut intelligence note

These claims in [cut intelligence](cut-intelligence.md) need a fix from the scribe. This note does not edit that file.

1. **Section 4 and pitfall 4, "Whisper removes fillers before we see them."** The normaliser is not applied in `transcribe()` or in `decoding.py` of openai-whisper (fetched, both files). The Hugging Face discussion cited for this (search snippet, discussion 30) points to the normaliser as the cause in an evaluation context. The filler loss in practice is consistent with the model's learned transcript style, but this is unverified. The fixes in the design (hesitation prompt with `condition_on_previous_text=False`, or acoustic filler detection checked on fixtures) still stand. whisper.cpp was not checked for this.
2. **Section 5 "Default parameters" pads.** The code derives the effective pads as `max(preset pad, keepPause/2)` (code read, `cuts.ts` lines 271-272). The table lists `pad_pre` and `pad_post` as independent values. The two do not match for `standard` (effective 0.15 both sides; table 0.10 and 0.12). Pick one and say so.
3. **Join fade.** Design: 15-20 ms overlap crossfade with duration preservation. Code: 8 ms fade per side, no overlap (`render.ts`, `JOIN_FADE`). Both are untested against the join-ratio gate.
4. **Default filler list.** The design says keep `er` and `erm` behind `standard` only. The code uses them in every preset (code read).

---

## 7. Recommended order for the lead

1. **F4 energy gate on gaps, plus the music and offset tests.** Largest user-visible risk. Touches `cuts.ts` (add `levels` to `PlanInput`) and the caller in the command layer.
2. **F1/F2 asymmetric pads and fricative hangover, with the two synthetic tests.** Small change in `cuts.ts`.
3. **F9/F10 probe `avg_frame_rate`, VFR flag, drift eval.** Touches `media.ts` and adds an eval, not a unit test.
4. **F5 breath attenuation.** Needs a clip split in the timeline. Larger; plan as a spec under `docs/specs/`.
5. **F7 filler list and backchannel protection.** Small.
6. **F11 zero-crossing snap, and a decision on the join design.**

Each change needs a spec or an ADR only if it changes the engine's architecture. Items 1, 2, 5 and the probe in 3 are parameter and detector changes.

---

## 8. Needs a human

- **Dataset exceptions:** VoxConverse ("research purposes") and PodcastFillers (non-commercial) are on the deny list. A human decides whether any internal-only use is acceptable. The scout does not ask for exceptions.
- **MUSAN per-file licences:** Needs a file-by-file check, or a decision to generate music and noise instead.
- **MFA English acoustic model:** Licence not found. Needed before any aligner-based ground truth.
- **Whether to add a fourth preset axis** (keep long pauses, as Tella's modes do) before adding more presets (F6).
- **Visual jump-cut style** (F14), which is a product choice.
- **Join design:** 8 ms per-side fades (current) against the 15-20 ms overlap crossfade (design). This changes the sound, so a listening test should decide.
