---
type: Research
title: Cut intelligence
description: Open-source state of the art for making good automatic cuts, with a recommended cut-engine design, default parameters, cut-quality metrics and the pitfalls behind each rule.
tags: [research, cuts, vad, silence, transcript, llm-planning, ffmpeg, evals, licensing]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T19:07:37Z
---

# Cut intelligence

Written 2026-10-18. Cutting decides whether an edit succeeds, so this note is written to be acted on: a recommended engine first, then the evidence.

**How to read the claims.** *(verified)* means read from a primary file or page this session (repository LICENSE, source code, official docs, model card). *(search snippet)* means taken from a search result only, not opened. *(unverified)* means from memory or a single secondary source. *(local experiment)* means measured on this machine with FFmpeg 6.1.1 and the synthetic fixtures described in section 2. Numbers marked *design default* are our proposal, to be tuned by the eval harness, not facts from a source.

Experiment scripts live in `/tmp/claude-0/cuts/` (not committed). Fixtures are synthetic: white-noise room tone, tone bursts for speech, known word positions. They prove mechanisms, not real-world accuracy.

---

## Recommendation: the cut engine

**Core idea.** The cut engine is deterministic. Signal analysis and transcript timing propose and validate every cut. A language model, if used, only chooses among candidates the engine already validated, by id, never by timestamp. Every decision is a reviewable item with a reason, a confidence and a kind, so the user can approve, reject or undo each one.

### Algorithm (5 steps)

1. **Perceive.** Probe the file (ffprobe). Estimate the room-tone floor per asset: the 10th percentile of 20 ms RMS frames in dB (design default). Find speech spans with a floor-relative energy detector, and optionally a VAD model (see section 2). Transcribe to word timestamps with a local engine, using a non-normalised output so filler words survive (section 4). Optionally detect visual idle spans (freezedetect, blackdetect, scene) for screen recordings.
2. **Propose.** Generate candidates from rules, always on: pauses longer than `pause_min`, filler words that stand alone, false starts (a repeated opening word or phrase), and head or tail silence. Repeated sentences go in a separate "retake" class with a score, not an automatic cut.
3. **Validate and snap.** Snap every cut to word boundaries: keep `pad_pre` before the next word and `pad_post` after the last one, and never cut inside a word. Move each cut point to a nearby zero crossing (within 5 ms). Merge gaps under 150 ms. Drop kept islands shorter than `min_keep`. Attenuate breaths (about -12 dB) rather than deleting them when they sit inside a shortened pause. Reject any candidate that fails a hard check and record why.
4. **Plan.** Emit a cut plan (section 5 for the data model): each decision has `range` in source seconds, `kind`, `action`, `reason`, `confidence`, `source` and `status`. Default status is `proposed` for anything with confidence below 0.9 or kind `retake`/`off_topic`; the rest may be `approved` by the preset. The user reviews by item or in bulk, and undo works per decision group.
5. **Render and verify.** Render by re-encoding (frame-accurate trim, section 3). Join each kept span with a 15-20 ms overlap crossfade across the removed pause, pad each side by half the overlap so the total duration is preserved. Then run the metrics in section 5 on the rendered output. If a hard metric fails, re-render with the next looser preset or report the failing cuts instead of shipping them.

### Default parameters (design defaults, to be tuned by evals)

All times are seconds of source time unless noted. Presets select these values; `standard` is the default.

| Parameter | gentle | standard | tight | podcast | tutorial |
|---|---|---|---|---|---|
| `pause_min` (pauses longer than this are shortened) | 0.90 | 0.60 | 0.35 | 1.20 | 0.80 |
| `keep_pause` (length left after shortening) | 0.50 | 0.30 | 0.15 | 0.60 | 0.40 |
| `pad_pre` (kept before a word) | 0.15 | 0.10 | 0.06 | 0.15 | 0.10 |
| `pad_post` (kept after a word) | 0.20 | 0.12 | 0.08 | 0.20 | 0.15 |
| `min_keep` (shortest island kept) | 0.50 | 0.30 | 0.25 | 0.50 | 0.40 |
| Fillers | off | remove standalone | remove standalone | only if isolated and at least 0.25 s | remove standalone |
| Breaths inside a cut pause | keep | attenuate -12 dB | remove if longer than 0.25 s | attenuate -10 dB | attenuate -12 dB |
| Retakes | suggest only | auto-apply if confidence at least 0.9 | auto-apply if confidence at least 0.9 | suggest only | suggest only |
| Visual idle (screen only) | off | off | off | off | freeze of 4 s or more with no audio, shortened to 1.0 s |

Shared defaults across presets:

- Speech-on threshold `floor + 10 dB`, speech-off threshold `floor + 6 dB` (hysteresis). Speech shorter than 0.15 s is ignored, so clicks and coughs do not split a pause.
- If a VAD model is used, speech-on probability 0.5 and speech-off probability 0.35 (a fixed gap of 0.15, matching the model's own default rule). Minimum silence 0.25 s, speech padding 0 (the engine applies its own padding). These differ from the model's library defaults (section 2).
- Join crossfade 15-20 ms (overlap, duration-preserving) inside speech pauses; no transition in video; per-clip fades only at head and tail.
- Punch-in (optional, off by default): 1.04x scale ramp over 0.25 s on a jump cut inside one shot when the removed span is shorter than 1.5 s. Off for tutorial.

Justification anchors: auto-editor's `--margin` default is 0.2 s and its audio threshold example is 0.04 linear, about -28 dB (both verified via README summary). Our standard pads (0.10 s before, 0.12 s after) are of the same order as that margin. These are proposals, not optima; the eval gates in section 5 decide them.

### LLM role (planner, not cutter)

- The LLM sees numbered words with ids (`w0412`), plus pause and filler ids the engine already found. It returns JSON that references ids only. It never writes timestamps.
- A deterministic validator then checks every item: ids exist; spans are in order and do not overlap protected words (sentence starts, names, words within 100 ms of a speaker change); each drop falls on a pause, filler, or whole sentence; repeated-sentence claims are confirmed by a token-similarity check; removed time stays under a budget (design default: 25% of duration unless the user raises it). Failures are dropped with a reason in the plan.
- Long transcripts use map-reduce: chunks of about 3-4 minutes (roughly 500-700 words) with 15% overlap; each chunk returns candidates; the reduce step merges by word id; duplicate detection runs deterministically across chunks before any second model pass over the candidate pairs.
- Put the instructions and the output schema first and the candidate list last. Position matters for long contexts (section 4).

---

## 1. Existing tools: what they do, and what we can use

Licence rows were checked against the LICENSE file in the repository, or PyPI metadata where noted.

| Tool | Licence | Use for us | What it gets right | What it gets wrong or lacks |
|---|---|---|---|---|
| auto-editor | Unlicense (verified LICENSE) | Reference only; no copy of code | Cuts on loudness threshold, with `--margin` padding (default 0.2 s, verified via README summary); also motion method (`--edit motion:threshold=0.02`); combinable with `or` (verified via README summary) | Per-cut decisions are not reviewable; no transcript awareness; no retake or filler logic |
| jumpcutter (carykh) | MIT (verified LICENSE) | Reference | Simple idea: loudness threshold and speed-up of silence | Author no longer maintains it (verified README); saves every frame as an image to a temp folder, so disk use is large (verified README) |
| LosslessCut | GPL-2.0 (verified LICENSE) | Not usable as code. A separate process only, if at all | Stream-copy cutting with a clear keyframe caveat (search snippet only) | GPL; keyframe-snapped stream copy is not frame-accurate |
| OpenChatCut | AGPL-3.0 (verified LICENSE) | Ideas only, as already noted in `docs/research/openchatcut-learnings.md` | Transcript word-cuts and a draft-approve flow (already recorded) | AGPL: no code, no close paraphrase |
| clipsai | MIT on PyPI (verified metadata) | Reference for shorts pipeline | Packages a transcription and shorts pipeline; its dependency list includes pyannote.audio, mediapipe, scenedetect and torch (verified metadata). Its clip-ranking method is unverified | Depends on pyannote.audio, whose weights are gated (section 2); the dependency licence chain must be checked before use |
| ShortGPT | No licence field on PyPI (verified metadata); GitHub LICENSE not reachable at main or master (verified 404) | Do not use | Unknown | Unlicensed as far as we can see: treat as all rights reserved |
| Descript, Premiere, CapCut | Proprietary (unverified) | Concept reference | Text-based editing: edit the transcript, the timeline follows (Fried et al. 2019 describes the research version, verified abstract) | Closed |
| Silero VAD | Code MIT (verified LICENSE and PyPI classifier) | Candidate for the optional VAD step | Robust on noise and music in the vendor's own table (section 2) | Model weights licence not confirmed: the README badge says CC BY-NC 4.0 while the text says MIT (verified README). Must be checked against the weights file before shipping |

**Takeaway.** Existing open tools cut on loudness, pad with a fixed margin, and stop there. Nothing open combines word-level transcript evidence, reviewable decisions and a verified render. That gap is the engine.

---

## 2. Speech and silence detection

### What FFmpeg silencedetect does (verified from the local binary)

- Defaults: `noise` 0.001 (about -60 dB, linear amplitude), `d` 2 seconds. Our `detectSilence` passes `-30dB` and `0.5` explicitly (`packages/core/src/media.ts`).
- Observed (local experiment): detection works per sample rather than on RMS. A noise floor whose peaks exceed the threshold never registers as silence, even when its RMS is far below it. The mechanism comes from behaviour, not from reading the source *(unverified source reading)*.

### Local experiment: fixed threshold versus floor-relative energy

Synthetic talk: 40 s, 65 words of 0.30 s tone bursts with 20 ms fades, 0.10 s between words, five words per phrase, 0.9 s pauses with a 0.4 s breath at -38 dBFS. Room tone is white noise at three levels. Speech total 19.5 s; non-speech 20.5 s. "Leftover" counts non-speech kept; "truncated" counts speech removed.

| Room tone | Method | Leftover non-speech (of 20.5 s) | Words truncated (of 19.5 s) |
|---|---|---|---|
| -60 dBFS | silencedetect -30 dB, d 0.5 | 9.75 s | 0.16 s |
| -60 dBFS | silencedetect -50 dB, d 0.3 | 20.5 s (nothing detected) | 0 |
| -60 dBFS | floor-relative energy, +10 dB | 3.79 s | 0.17 s |
| -60 dBFS | floor-relative energy, +15 dB | 3.03 s | 0.17 s |
| -45 dBFS | silencedetect -30 dB, d 0.5 | 9.96 s | 0.16 s |
| -45 dBFS | silencedetect -40 dB, d 0.3 | 20.5 s (nothing detected) | 0 |
| -45 dBFS | floor-relative energy, +10 dB | 0.17 s | 0.17 s |
| -35 dBFS | any silencedetect setting tried (-30 to -60 dB) | 20.5 s (nothing detected) | 0 |
| -35 dBFS | floor-relative energy, +6 dB | 0.17 s | 0.17 s |
| -35 dBFS | floor-relative energy, +10 dB | 0.12 s | 0.72 s |
| -35 dBFS | floor-relative energy, +15 dB | 0.00 s | 1.30 s |

*(local experiment)* The 0.16-0.17 s "truncated" floor is the 20 ms fade ramps at word edges, about 2-3 ms per word, not audible.

**Reading.** A fixed threshold works only when the room is quiet. Once the floor reaches about -45 dBFS, fixed thresholds stop finding pauses. Floor-relative energy at +10 dB handles all three floors. At +15 dB on a noisy floor it starts to clip word edges, so the margin should be capped near 10 dB and paired with padding. This is a synthetic result; real rooms have hum and spectral structure, so the defaults must be checked on real fixtures.

### VAD options

| Option | Licence | Status for us |
|---|---|---|
| Energy + floor (our own, section above) | ours | Default. No model, no licence risk, deterministic |
| Silero VAD | Code MIT (verified LICENSE). Weights unclear: badge says CC BY-NC 4.0, text says MIT (verified README). PyPI 6.2.3 classifier MIT (verified) | Optional, only after the weights licence is verified from the model file itself |
| WebRTC VAD (py-webrtcvad) | Wrapper MIT; bundled WebRTC code under a BSD-style licence (verified LICENSE) | Acceptable fallback; vendor table reports poor noise separation (below) |
| pyannote (speaker-diarization-3.1) | Model card says MIT (verified), but access is gated: users must accept conditions and "accept pyannote/segmentation-3.0 user conditions" (verified model card). Commercial terms of the gated dependency unverified | Exclude from the default path. Diarization is not needed for single-speaker cutting |
| whisper-based (word timestamps as speech evidence) | Whisper code and weights MIT (verified LICENSE for code) | Use for words, not as the sole VAD |

**Silero's own comparison** (vendor wiki, *unverified as independent measure*): ROC-AUC at 31.25 ms segments, WebRTC vs Silero v6: Multi-Domain 0.73 vs 0.97; VoxConverse 0.65 vs 0.94; ESC-50 noise accuracy 0 vs 0.87 (verified wiki page). Use these as a reason to test, not as a result.

**Silero defaults (verified raw code).** `threshold` 0.5, `min_speech_duration_ms` 250, `min_silence_duration_ms` 100, `speech_pad_ms` 30, negative threshold `max(threshold - 0.15, 0.01)`. These are tuned for captioning, not for editing: a 100 ms silence floor and 30 ms padding will cut between words.

**faster-whisper defaults (verified raw code).** `min_silence_duration_ms` 2000, `speech_pad_ms` 400. These are the opposite extreme: they keep most pauses. Set our own values, never inherit either library's defaults.

### Thresholds across loudness and noise

- Use a floor-relative threshold per asset, not a global dB number. Estimate the floor from the 10th percentile of frame dB, so a quiet and a noisy clip each get their own threshold.
- Hysteresis: start speech at floor + 10 dB, end it at floor + 6 dB. This avoids chatter on breaths. (Design default; not tested in the experiment.)
- Normalise loudness per asset before comparing across files (EBU R128 loudnorm or a simple gain match). Multi-file projects otherwise mix two floors.
- Music beds and laughter: an energy detector counts them as speech. Use the VAD (if licensed) or a music-presence check, and do not cut inside a span flagged as music.

### Breaths and room tone

- Practitioners agree on two rules: do not delete every breath, because the result sounds rushed; and do not chop breaths in half, because it is noticeable. Lower a breath's level instead of deleting it. *(search snippet: SoundGirls article mirror, Auddy article)*
- A removed span must not leave digital silence. Fill the join with room tone from the same asset: loop a short spare room-tone segment under the pause, fade it in and out (BH Photo guide, *search snippet*). The crossfade in section 3 does the join; room tone stops the dead-air sound.
- Breath detection (design, unverified): a breath is 150-600 ms, broadband (high spectral flatness), and 15-30 dB below speech. Remove or attenuate only when it sits inside a pause we are already shortening.

---

## 3. Cut quality rules

### Word boundaries and padding

- Cut only between words, never inside one. Word timings from Whisper-family output can be wrong by several seconds: the WhisperX README says Whisper's timestamps "are at the utterance-level, not per word, and can be inaccurate by several seconds" (verified). Use forced alignment, or snap each boundary to the nearest energy minimum within 80 ms (design default).
- Padding: keep at least `pad_pre` before and `pad_post` after each word. Practitioners ask for adjustable padding because fixed or zero padding gives rough jump cuts (CyberLink and Shotcut forum threads, *search snippets*). Our defaults are in section "Default parameters".
- Minimum keep: an island shorter than `min_keep` (0.25-0.5 s) reads as a stutter. Drop it into the removed span, or merge it into the neighbouring cut.

### Clicks and zero crossings

Local experiment: 200 random splices of a sustained vowel-like tone (150 Hz with harmonics). Metric: max sample jump at the join divided by the median sample jump of the signal (1.0 means no discontinuity above normal). *(local experiment)*

| Join method | Median ratio | 90th percentile | Max |
|---|---|---|---|
| Hard splice | 25.4 | 53.2 | 65.4 |
| Snap both sides to nearest zero crossing | 3.44 | 3.74 | 4.12 |
| Dip to zero, 10 ms out and in | 0.16 | 0.24 | 0.25 |
| True overlap crossfade, 5 / 10 / 20 ms | 1.7-1.8 | 3.4-3.5 | 3.6-3.9 |

**Reading.** A hard splice in a sustained sound produces a jump about 25 times normal, which is an audible click. Zero-crossing snapping alone cuts that by a factor of about seven but leaves a slope mismatch. A dip to zero has the lowest jump but leaves a short level dip; in a speech pause it sounds like dead air, so it is for sustained content only. A true crossfade removes the level step. The metric is crude, so the threshold for the eval gate should come from listening tests on the same fixtures.

**Two implementation pitfalls, both observed:**

- `acrossfade` overlaps the two inputs, so the output is shorter by the overlap. A test with `d=0.02` turned two 0.30 s segments into 0.58 s. Timeline accounting must include that loss, or the render must pad each side by half the overlap. The half-overlap padding is our design and not yet tested; the eval gate for duration must confirm it.
- `acrossfade` with no `d` uses `nb_samples` 44100, which is 1 second at 44.1 kHz. A forgotten `d=` gives a long, mushy crossfade (verified defaults from the local binary; `duration` default is 0).

Working commands (verified to run on FFmpeg 6.1.1):

    ffmpeg -i w1.wav -i w2.wav -filter_complex "[0][1]acrossfade=d=0.02:c1=tri:c2=tri" out.wav
    ffmpeg -i w1.wav -i w2.wav -filter_complex "[0]afade=t=out:st=0.28:d=0.02[a];[1]afade=t=in:st=0:d=0.02[b];[a][b]concat=n=2:v=0:a=1" out.wav

### Frame-accurate versus keyframe cuts (why we re-encode)

Local experiment: 10 s, 30 fps, keyframe every 2 s; cut requested from 3.1 s to 5.0 s. *(local experiment)*

- Stream copy (`-ss 3.1 -to 5.0 -c copy`): the first packet is a keyframe at pts -1.1 s, so the output starts about 1.1 s early and relies on the player honouring the edit list. Frame count 57 (1.9 s).
- Re-encode (`-ss 3.1 -to 5.0 -c:v mpeg4 -q:v 4`): first frame at pts 0, 57 frames, keyframes every 0.4 s.

**Decision.** Re-encode every cut. Stream copy is only safe when the in-point lands on a keyframe. The render path already uses `trim` with `setpts=PTS-STARTPTS` and per-clip `afade` (`packages/core/src/render.ts`), which is frame-accurate. Encoder selection stays as it is: libx264 is GPL, so shipped builds rely on the platform encoder and fall back (`PREFERRED_ENCODERS` in `render.ts`). The experiment used mpeg4, which is LGPL-safe, so it does not depend on libx264.

### Video joins and jump cuts

- A cut inside one continuous shot shows a visible jump. Common fixes: a punch-in zoom on the next clip (auto punch-in is a feature of several tools, *search snippets*), a B-roll cover, or a split-edit J/L cut so the sound carries across the picture change.
- J-cut: the incoming clip's audio starts before its picture. L-cut: the outgoing clip's audio continues after the picture changes. *(search snippets: Epidemic Sound, TechSmith)*. Our timeline is a single gapless track (`packages/core/src/timeline.ts`, v0.1), so J and L cuts need a per-clip audio offset first. Not in scope for the default engine.
- Cutting on motion, blinks or mid-gesture: a blink-aware cut needs a face-landmark model (unverified; not evaluated here). v1 cuts on audio pauses and accepts the visual jump, mitigated by punch-in.

---

## 4. Content-aware cutting from transcripts

### Filler words and disfluencies

- Whisper's English normaliser removes `hmm`, `mm`, `mhm`, `mmm`, `uh` and `um` from the text it returns. This is in `EnglishTextNormalizer.__init__` as `self.ignore_patterns = r"\b(hmm|mm|mhm|mmm|uh|um)\b"`, applied with `re.sub` in `__call__` (verified from the source). The filler words are gone before our code sees them.
- Consequence: the transcript cannot be the only filler detector. Options: (a) use a non-normalised output path, if the engine exposes one; (b) prompt the decoder with a short hesitation text, which community tools use but which can cause hallucinated words (*search snippet*, arXiv disfluency study); (c) detect candidate fillers acoustically, using short voiced segments between pauses, then confirm with the transcript (design, unverified). Verify with a fixture that has known filler positions before trusting any option.
- Note `DEFAULT_FILLERS` in `packages/core/src/transcript.ts` includes `er` and `erm`, which can be real words in some contexts. Keep them behind the `standard` preset only.
- Practitioners keep occasional fillers and remove frequent ones (SoundGirls mirror, *search snippet*). Our rule: remove fillers only when they stand alone, not inside a phrase, and at most a fixed count per minute unless the preset says otherwise (design).

### False starts and repeated takes

- A false start repeats the opening words of a phrase before it resumes ("so the, so the main point"). Detect by matching the first 2-3 tokens of consecutive sentences, then keep the later one.
- Repeated takes ("let's do that again") need a stronger rule. Candidate: two sentences with normalised token similarity at or above 0.8 within 60 seconds, plus a cue word or a pause of 1 second or more between them.
- Choosing the best take. Academic work treats retake detection as clustering with motion and colour features (2011 LNCS paper, *search snippet*), and graph matching to pick the best instance (Ren, Punitha and Jose, *search snippet*). Commercial tools keep the best take by default and do not publish methods (*search snippets*). Our proposal (design, unverified weights): score each take as 0.4 x mean word confidence + 0.3 x energy relative to floor + 0.2 x fluency (no fillers, no false start, rate within 20% of the median) + 0.1 x recency. Ties go to the later take. Auto-apply only at confidence 0.9 or more; otherwise suggest.
- Failure mode: rephrased retakes look different in text. Keep both when confidence is below 0.9, and say so in the plan.

### Off-topic and low-information segments

- No open tool we checked does this reliably. Options: an LLM judges each chunk with a fixed rubric and returns ids (section "LLM role"); or a cheap heuristic (speech density, repeated n-grams, long pause plus no content words). Mark every such decision `kind: "off_topic"` and `status: "proposed"`. Never auto-apply.

### Chapters and topic segmentation

- Topic segmentation can use TextTiling-style similarity on sentence embeddings. A permissive embedding model would need its licence checked (unverified). Not needed for the first cut engine.

### Highlight extraction for shorts

- clipsai (MIT on PyPI, verified metadata) is the open option to study for shorts; its ranking method is unverified. HIVE (arXiv 2507.02790, verified summary of the abstract) splits editing into highlight choice, opening and closing selection, and pruning, and says it "consistently outperforms existing baselines"; it contrasts itself with prior methods that rely mainly on transcript cues. Its numbers were not in the fetched text, and it also uses visual understanding, which we do not have in v1.
- Our plan: highlight extraction is a later spec, not part of the cut engine. The output of extraction is a set of source ranges with the same plan model, snapped to sentence boundaries, 20-60 s long.

### LLM as planner: evidence and limits

- A pattern many open projects share: the model reads a timestamped transcript and emits an edit list, and a deterministic renderer cuts. Several guides say grounding every sentence in word-level timestamps matters (*search snippets*, not independently checked).
- Evidence of failure is thin and mostly from vendors. One vendor's test reports 11 of 11 cuts falling mid-sentence and 93% target miss (*search snippet*, vendor test, treat with caution). We do not rely on this number; the design avoids the failure mode by letting the model choose ids, not times.
- Lost in the middle (Liu et al., arXiv 2307.03172, *search snippet*): models use information near the start and end of long inputs better than the middle, and accuracy falls as input grows. Hence the chunking, overlap, and "instructions first, candidates last" layout.
- Small local models: keep chunks short, give one example, and validate every output. Schema-constrained decoding, if the runtime supports it, is worth testing (unverified for our runtime).
- A verification loop works in at least one open project: render a draft, inspect every cut boundary, and retry up to three times (video-use project, *search snippet*). Our step 5 uses deterministic metrics instead of model inspection.

---

## 5. Cut plan data model, review, and metrics

### Data model

Each decision is one item in the plan. Times are source seconds (AGENTS.md rule); the timeline position is derived later.

```json
{
  "id": "cut_0007",
  "asset": "asset_a1",
  "range": { "start": 12.34, "end": 13.10 },
  "action": "remove",
  "kind": "pause",
  "reason": "Pause of 1.20 s between words w0412 and w0413 exceeds pause_min 0.60 s (standard)",
  "confidence": 0.93,
  "source": "energy+asr",
  "evidence": { "words": ["w0412", "w0413"], "floor_db": -52.1, "gap_s": 1.20 },
  "status": "proposed",
  "group": "plan_20261018_01"
}
```

- `kind`: `pause`, `filler`, `false_start`, `retake`, `off_topic`, `head_tail`, `breath`, `visual_idle`.
- `action`: `remove`, `shorten` (keep `keep_pause` seconds), `attenuate` (gain in dB), `keep` (a protective item, for the audit trail).
- `status`: `proposed`, `approved`, `rejected`, `applied`. Undo reverses one `group`, not one item, so the user can undo a whole pass.
- Review UX: list items with reason and confidence, filter by kind, approve all at or above a threshold, reject individually. Playing a 2-second window around each cut is the fastest way to check it.

### Presets

Presets are the table in the Recommendation. Each preset is a named object of parameters, stored in the core package, so the CLI, the MCP server and the desktop app share one definition.

### Metrics and tests for the eval harness

Each metric runs on the rendered output, with the synthetic truth known. Thresholds marked *gate* block a merge; others are reported.

| Metric | Definition | Gate | Baseline from experiments |
|---|---|---|---|
| Words truncated | Count of words where a cut falls inside the word, or within 10 ms of its edges | 0 | Floor-relative energy: 0.17 s total (fade ramps) |
| Recall of kept content | Share of non-removable words present in re-transcribed output (word error rate on kept text against the expected text) | at least 0.98 | not measured |
| Leftover non-speech | Seconds of non-speech in output longer than `keep_pause` + 0.05 s | report; gate for `tight` | 0.00-3.79 s depending on method |
| Join discontinuity | Sample-jump ratio at each join, as in section 3 | at most 5 for speech joins | Hard 25.4; zero-cross 3.44; crossfade 1.8 |
| Join level step | Level change across join in a 10 ms window either side, after removing the expected room-tone difference | within 3 dB | not measured |
| Pad adequacy | 5th percentile of pad before and after each word | at least 80 ms | not measured |
| Filler precision and recall | Against known filler positions, matched at IoU at least 0.5 | recall at least 0.9, precision at least 0.9 | not measured |
| Retake choice accuracy | On synthetic duplicate takes where the best take is known | at least 0.85 | not measured |
| Plan validity | Share of plan items that pass the validator without a repair | at least 0.95 for model-proposed items | not measured |
| Over-cut guard | Removed share of duration against the preset budget | at most budget (25% default) | not measured |

Acceptance tests (synthetic fixtures, no network, as AGENTS.md requires):

- A word-level talk fixture like the one above, at three room-tone levels, with a known truth.
- A sustained-tone splice fixture for join metrics.
- A filler-injected fixture with known filler times, to test the normaliser path.
- A screen-recording fixture for freeze and black detection.

Listening: keep a small set of real clips and a blinded A/B listen for each preset. No metric replaces this for clicks and dead air.

---

## 6. Frames: how visual information should influence cuts

### Cheap FFmpeg detectors (local experiment)

Synthetic screen recording: 0-3 s static colour, 3-6 s moving test pattern, 6-7 s black, 7-10 s static colour. 30 fps, mpeg4. *(local experiment)*

| Filter | Setting | Result | Reading |
|---|---|---|---|
| `select='gt(scene,0.3)'` | threshold 0.3 | Changes at 3, 6, 7 s | Finds the transitions; misses the motion itself. Our `detectScenes` default is 0.4 (`media.ts`) |
| `freezedetect` | `n=0.003:d=1` | Freeze 0-3 s, 6-7 s, 7 s to end | Finds idle screen spans. Cursor blinks and clock ticks will break freezes on real captures (unverified) |
| `blackdetect` | `d=0.5:pix_th=0.10` | Black 6-7 s | Exact |
| `mpdecimate` | defaults | 93 of 300 frames kept | Drops duplicate frames for output. Changes frame timing; not a cut decision (unverified for variable frame rate sources) |

Filter defaults from the local binary: `freezedetect` `n` 0.001 and `d` 2; `blackdetect` `d` 2, `picture_black_ratio_th` 0.98, `pixel_black_th` 0.1; `mpdecimate` `hi` 768, `lo` 320, `frac` 0.33 (verified via `ffmpeg -h filter=...`).

### How visuals should influence cuts

- Audio decides where talk is cut. Visuals decide what else is removed: idle screen spans (screen recordings), black or blank leads, and scene boundaries where a cut is free.
- Scene changes are good cut points when the audio is also quiet; the engine should prefer a pause that coincides with a scene change.
- Presenter leaves frame, slide vs speaker, and eye blinks need a detector (person or face). A vision model is worth it only for those decisions and only after the audio path works. Use a sampled frame rate (about 2 fps) to keep cost down (design, unverified cost).

---

## Pitfalls and fixes

1. **Fixed dB thresholds miss quiet pauses in noisy rooms.** Observed: no silence found at a -35 dBFS floor with any silencedetect setting tried. Fix: floor-relative thresholds per asset.
2. **Per-sample detection and crest factor.** Noise peaks above the threshold break silence even when RMS is well below it (observed). Fix: energy on 20 ms RMS frames, not sample peaks.
3. **Library VAD defaults are wrong for editing.** Silero's library default gives 100 ms silence and 30 ms padding (cuts between words); faster-whisper's gives 2 s and 400 ms (keeps almost everything). Fix: set our own values; never inherit.
4. **Whisper removes fillers before we see them.** Verified in the normaliser source. Fix: non-normalised output path, or acoustic filler detection, verified on fixtures.
5. **Word timestamps are approximate.** Whisper-family timings can be several seconds off at utterance level (WhisperX README, verified). Fix: forced alignment or energy-minimum snapping within 80 ms.
6. **Hard splices click.** 25 times the median sample jump in a sustained sound. Fix: zero-crossing snap plus 15-20 ms overlap crossfade.
7. **Crossfades shorten the output.** Verified: 0.60 s became 0.58 s. Fix: pad each side by half the overlap so the duration is preserved; keep timeline accounting in source seconds.
8. **`acrossfade` default length is one second.** Verified default `nb_samples` 44100. Fix: always pass `d=`.
9. **Dead air after a removed pause.** Digital silence sounds unnatural. Fix: fill with room tone from the same asset, faded in and out.
10. **Deleting every breath sounds rushed; chopping breaths sounds wrong.** Fix: attenuate by about 12 dB inside shortened pauses (practitioner consensus, *search snippets*).
11. **Over-editing removes pauses that carry meaning.** Fix: presets, with `gentle` for interviews and `podcast` for conversation (*search snippet*: SoundGirls mirror).
12. **Stream-copy cuts start at the previous keyframe.** Observed: pts -1.1 s with a 2 s GOP. Fix: re-encode every cut.
13. **Model-written timestamps are invented.** Fix: model returns ids; a validator maps ids to times and refuses cuts inside words.
14. **Long transcripts lose the middle.** Fix: chunk with overlap, put instructions first and candidates last, and do a second pass only on candidate pairs.
15. **Retake detection over-matches.** Rephrased sentences look different. Fix: keep both below confidence 0.9 and surface the choice.
16. **Silero weights licence is ambiguous.** README badge says CC BY-NC 4.0; text and code say MIT (verified). Fix: check the weights file and model hub licence before adopting; until then the default path does not use it.
17. **pyannote is gated.** Model card requires accepting conditions (verified). Fix: exclude from the default path.
18. **Parakeet-family weights are CC-BY-4.0.** Model card says commercial use is allowed with attribution (verified). Our intake list names MIT, Apache-2.0, BSD, ISC and MPL-2.0. CC-BY-4.0 is not on that list, so adopting it needs an ADR.
19. **ShortGPT has no licence.** Treat as unusable (verified metadata).
20. **Music and laughter read as speech.** Fix: VAD if licensed, or a music check; never cut inside a music-flagged span.
21. **Speeding up before detecting silence degrades detection.** Practitioner advice (*search snippet*, low-quality source, unverified). Fix: detect first, then speed.
22. **mpdecimate changes timing on variable-frame-rate sources.** (unverified.) Fix: do not use it for cut timing.
23. **Multi-file projects mix floors.** Fix: per-asset floor and loudness normalisation before comparison.

---

## Sources

### Verified (fetched this session)

- auto-editor LICENSE, https://raw.githubusercontent.com/WyattBlue/auto-editor/master/LICENSE (Unlicense)
- auto-editor README, https://raw.githubusercontent.com/WyattBlue/auto-editor/master/README.md (read via summary; defaults and options)
- jumpcutter README, https://raw.githubusercontent.com/carykh/jumpcutter/master/README.md (maintenance status, frame images)
- jumpcutter LICENSE, https://raw.githubusercontent.com/carykh/jumpcutter/master/LICENSE (MIT)
- LosslessCut LICENSE, https://raw.githubusercontent.com/mifi/lossless-cut/master/LICENSE (GPL-2.0)
- OpenChatCut LICENSE, https://raw.githubusercontent.com/0xsline/OpenChatCut/main/LICENSE (AGPL-3.0)
- Silero VAD LICENSE, https://raw.githubusercontent.com/snakers4/silero-vad/master/LICENSE (MIT, copyright 2020-present Silero Team)
- Silero VAD README, https://raw.githubusercontent.com/snakers4/silero-vad/master/README.md (badge conflict)
- Silero VAD quality metrics wiki, https://github.com/snakers4/silero-vad/wiki/Quality-Metrics (vendor-reported)
- Silero VAD utils, https://raw.githubusercontent.com/snakers4/silero-vad/master/src/silero_vad/utils_vad.py (defaults)
- Silero VAD PyPI metadata, https://pypi.org/pypi/silero-vad/json (MIT classifier, 6.2.3)
- py-webrtcvad LICENSE, https://raw.githubusercontent.com/wiseman/py-webrtcvad/master/LICENSE (MIT; WebRTC BSD-style)
- whisper.cpp LICENSE, https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/LICENSE (MIT)
- whisper.cpp CLI README, https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/examples/cli/README.md (flags)
- OpenAI Whisper LICENSE, https://raw.githubusercontent.com/openai/whisper/main/LICENSE (MIT)
- OpenAI Whisper English normaliser, https://raw.githubusercontent.com/openai/whisper/main/whisper/normalizers/english.py (filler removal)
- OpenAI Whisper spelling map, https://raw.githubusercontent.com/openai/whisper/main/whisper/normalizers/english.json (spelling only; checked, not a filler list)
- faster-whisper LICENSE, https://raw.githubusercontent.com/SYSTRAN/faster-whisper/master/LICENSE (MIT)
- faster-whisper VAD, https://raw.githubusercontent.com/SYSTRAN/faster-whisper/master/faster_whisper/vad.py (defaults)
- WhisperX LICENSE, https://raw.githubusercontent.com/m-bain/whisperX/main/LICENSE (BSD-2-Clause)
- WhisperX README, https://raw.githubusercontent.com/m-bain/whisperX/main/README.md (timestamp accuracy, alignment)
- pyannote speaker-diarization-3.1 model card, https://huggingface.co/pyannote/speaker-diarization-3.1 (MIT tag; gated)
- pyannote.audio LICENSE, https://raw.githubusercontent.com/pyannote/pyannote-audio/develop/LICENSE (MIT, CNRS)
- pyannote.audio PyPI metadata, https://pypi.org/pypi/pyannote.audio/json (no licence field)
- NVIDIA Parakeet TDT 0.6B v2 model card, https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2 (CC-BY-4.0, commercial use)
- PySceneDetect LICENSE, https://raw.githubusercontent.com/breakthrough/PySceneDetect/master/LICENSE (BSD-3-Clause)
- TransNetV2 LICENSE, https://raw.githubusercontent.com/soCzech/TransNetV2/master/LICENSE (MIT code; weights not covered by the text)
- clipsai PyPI metadata, https://pypi.org/pypi/clipsai/json (MIT; depends on pyannote.audio and torch)
- ShortGPT PyPI metadata, https://pypi.org/pypi/shortgpt/json (no licence field; last upload 2023)
- FFmpeg filters documentation, https://ffmpeg.org/ffmpeg-filters.html (afade, acrossfade; page truncated before silencedetect)
- Fried et al. 2019 abstract, https://arxiv.org/abs/1906.01524
- HIVE abstract, https://arxiv.org/abs/2507.02790

Not reachable: GitHub API access for these repositories returned 403 for this session. Videomaker article returned 403. ShortGPT and clipsai GitHub LICENSE paths returned 404 on main and master.

### Search snippets only (not opened)

- Lost in the Middle, arXiv 2307.03172 (https://arxiv.org/abs/2307.03172v3)
- Whisper disfluency and prompting discussion and arXiv study on non-native ASR (https://arxiv.org/pdf/2503.06924)
- SoundGirls, "How to Avoid Over-Editing Podcasts" (https://soundgirls.org/how-to-avoid-over-editing-podcasts/)
- BH Photo, podcast editing guide (https://www.bhphotovideo.com/explora/node/114521)
- Descript feedback board on zero-crossing cut snapping (https://feedback.descript.com/feature-requests/p/feature-request-automated-cut-adjustment-based-on-audio-waveforms)
- CyberLink and Shotcut forum threads on automatic silence removal (https://forum.shotcut.org/t/automatic-silence-removing/32775?page=2)
- Epidemic Sound, J-cuts and L-cuts (https://www.epidemicsound.com/blog/j-cuts-and-l-cuts/) and TechSmith (https://www.techsmith.com/blog/video-cuts-you-should-know/)
- Wisecut auto punch-in help page (https://help.wisecut.video/article/what-is-auto-punch-inout)
- Vendor LLM editing test (https://cutback.video/blog/how-to-edit-videos-using-an-llm-chatgpt-vs-claude-vs-selects), treat as unverified marketing
- Video-use project (https://themenonlab.blog/blog/video-use-ai-video-editing-claude-code)
- Retake detection, 2011 LNCS paper "Improving Retake Detection by Adding Motion Feature" (https://www.academia.edu/82379968/Improving_Retake_Detection_by_Adding_Motion_Feature)
- Ren, Punitha and Jose, graph matching for re-takes (https://eprints.gla.ac.uk/39548)
- Patent US 2023/0064035, text-based re-take system (https://patents.justia.com/patent/20230064035)
- RankCut, IUI 2026 (named in search results only; no link fetched)
- Tella silence-removal guide (https://www.tella.com/edit-with-ai/remove-silence-from-video.md) and Rendi silence-detection docs (https://www.rendi.dev/docs/silence-detection-removal)
- Silero VAD integration copies on Hugging Face (defaults differ by wrapper; not authoritative)

### Local experiments (reproducible from `/tmp/claude-0/cuts/`, not committed)

- `gen.py`, `gen2.py`: synthetic talk fixtures (word-level truth) at room tone -60, -45, -35 dBFS.
- `eval_vad.py`, `eval3.py`: silencedetect and floor-relative energy scoring.
- `joins.py`: splice metrics. `gop.mp4` and the copy/re-encode outputs: keyframe test. `screen.mp4`: frame detector test.
