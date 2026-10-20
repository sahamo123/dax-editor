---
type: Research
title: A/V sync at cut joins and breath attenuation recipes
description: Measured causes of audio and video drift at cut joins in the render path (concat takes the longer stream per segment; per-clip fps adds frames), the verified fix (one fps pass per source before trim, cut points on the frame grid), VFR and avg_frame_rate evidence, and tested FFmpeg recipes for breath attenuation with the exact render.ts change.
tags: [research, cuts, render, ffmpeg, av-sync, vfr, fps, concat, breaths, volume, recipes]
status: stable
generated:
  by: process:scribe
  at: 2026-10-19T12:00:00Z
---

# A/V sync at cut joins and breath attenuation recipes

Written 2026-10-19 by the scout. It reads [cut intelligence](cut-intelligence.md), [cut quality field notes](cut-quality-field-notes.md) and `packages/core/src/render.ts` first. It does not repeat the design; it measures the two open problems and gives the change.

**How to read the claims.** *(measured)* means run on this machine with FFmpeg 6.1.1 on generated lavfi or synthetic media, this session. *(fetched)* means a page read with a fetch tool this session. *(search snippet)* means only a search result was seen. *(code read)* means read in this repository. *(reasoning)* means inferred, not run.

Scripts live in `/tmp/claude-0/-home-user-dax-editor/2f7e5b03-6060-578c-95f7-af9dd44657ba/scratchpad/av/` (not committed): `sync_test.py`, `stage_test.py`, `fix_test.py`, `vfr_test.py`, `unified_test.py`, `audio_chain.py`, `breath_test.py`, `gain_in_clip.py`.

---

## 0. Implementation status

The A/V drift fix (sections 2 to 4) is implemented on branch `claude/exciting-lamport-1k91fh`. Breath attenuation (section 5) is **not** implemented.

| Item | Status | Where |
|---|---|---|
| One `fps` pass per source before any trim, split into one copy per clip (4.2) | Implemented | `packages/core/src/render.ts`, `buildRenderPlan` |
| No per-clip `fps` filter | Implemented | `render.ts` |
| Trim and atrim on frame boundaries; cut points on the grid in the model (4.3, item 1) | Implemented | `timeline.ts` (`snapToFrame`, `deleteRange`, `splitAt`, `trimClip`, `appendClip`, `assetRangesToTimeline`); `cuts.ts` applies plans through `assetRangesToTimeline` |
| Exact NTSC rates in the filter (4.3, item 2) | Implemented for 23.976, 29.97 and 59.94: a stored decimal maps to its fraction. The project schema still stores a number | `timeline.ts` (`frameRate`) |
| Regression tests (4.3, item 3; section 6 gates) | Implemented | `av-sync-render.test.ts` (60 joins, 59.94 CFR and VFR sources), `timeline-grid.test.ts` |
| Breath attenuation (5) | Not implemented | none |

Differences from the sketch in 4.2, decided while implementing:

- Snapping also runs in `assetRangesToTimeline`. A silence or filler cut that removes no whole frame is no longer counted. Before, `remove_silences` could report "Removed 1 silence(s), 0s" and add a history entry on a second pass.
- Trim times are printed 0.5 ms before their frame boundary (`FRAME_NUDGE`). Six-decimal printing can round an exact boundary a hair past its frame, which keeps or drops one frame.
- A clip that rounds to no whole frame is left out of the render. Only projects saved before this change can contain one.
- The end of a source is clamped to its last whole frame (`snapToFrame(..., "floor")`), so a clip never runs past the frames the source has.
- Projects saved before this change are not re-quantised on open. Their off-grid cuts are snapped at render, so the timeline can differ from the output by up to half a frame per old cut. This is the section 8 decision, left open.

Measured after the change, with ffprobe stream `start_time + duration` against `timelineDuration`. Sixty joins, 320x180 at 30 fps, mpeg4 and AAC:

| Source | Before: picture | Before: sound | After: picture | After: sound | After: picture minus sound |
|---|---|---|---|---|---|
| 59.94 CFR (`testsrc2`) | +500.5 ms | +488.9 ms | +0.0003 ms | -0.67 ms | +0.67 ms |
| VFR, 24 fps average (every fifth frame dropped) | +1633.8 ms | +1696.8 ms | +0.0003 ms | -0.67 ms | +0.67 ms |

Before the change, picture minus sound was +11.7 ms for the CFR source and -63.0 ms for the VFR source. After it, both sources give the same output length, because the cut points fall on the same grid. The -0.67 ms sound offset was not investigated. It is about 32 samples at 48 kHz and well inside one frame.

One-off memory check (not in the tests): peak resident memory of the FFmpeg render process for 60 joins from one source was 243 MB for a 640x360 source of 120 s, 243 MB for 240 s, and 393 MB for 1280x720 at 120 s. The `split` could in principle queue frames for later clips; these runs show no growth with source length. The old graph was not measured for comparison.

Not verified: real footage (lip sync was not checked by eye), 29.97 and 23.976 projects (only the rate mapping is unit tested), sources with a non-zero start time, 48 kHz source audio, FFmpeg 7, Windows and macOS encoders, and export with libx264 (the tests use mpeg4).

## 1. Verdicts

| # | Question | Verdict |
|---|---|---|
| V1 | Is the drift caused by the probe's `r_frame_rate`? | **No.** `render.ts` never reads `asset.fps` (code read; only `media.ts` sets it). The drift is inside the filter graph. |
| V2 | Cause of the per-join error | **Two causes, both measured.** (a) `fps=` per clip adds about half a frame per clip. (b) `concat` takes the longer of the two streams in each segment, and cut points off the frame grid make the video segment overshoot. |
| V3 | Keep `trim`/`setpts` or switch? | **Keep `trim` + `setpts=PTS-STARTPTS` and `atrim` + `asetpts`.** Both are exact (audio-only error 0.5 ms). Keep the **concat filter** (`v=1:a=1`). Do not use the concat demuxer (see section 3.4). |
| V4 | Where does `fps=` go? | **Once per source, before the trim (`[k:v]fps=F,split=m`).** Not per clip (drift), not once after concat (still 0.18 s off on the fixture). |
| V5 | Snap cut points? | **Yes, to the project frame grid, nearest frame, in the model (planner and trim/split) and in render as a safety net.** Measured error 0.0 ms. |
| V6 | `-fps_mode` / `-vsync` on the output | **Do not rely on it.** The error arises inside the graph before the muxer (reasoning). Not measured as a fix. |
| V7 | `-avoid_negative_ts` | **Not needed.** Every output starts at pts 0.000 (measured). |
| V8 | Probe `avg_frame_rate` as the VFR test | **Insufficient alone.** An MP4 remux of a VFR file reports avg 24 fps, but the MKV of the same packets reports 30/30 (measured). Count packets over duration instead. Not on the drift path. |
| B1 | Breath attenuation method | **ADOPT gain automation on the clip** (`volume=volume='<expr>':eval=frame`, 20 ms ramps, clip-local time). Measured -12.00 dB inside the span, 0.00 dB outside. |
| B2 | Clip split at the breath | **REJECT.** It adds a picture cut inside the pause (reasoning). Keep one join and extend the preceding clip instead (section 5.3). |
| B3 | `compand` expander | **REJECT for breath.** Breath -7.5 dB, but a soft word at -34 dB loses 7.7 dB and room tone 4.6 dB (measured). |
| B4 | `afftdn` | **REJECT for breath.** The breath moved +0.5 dB; room tone fell 12 dB (measured). It is a room-tone tool, not a breath tool. |
| B5 | `enable=` step gain | **Not adopted.** The gain is correct (-12 dB, measured) but the click at the step was not measured. Ramps cost nothing extra, so use them. |

---

## 2. A/V drift: what happens and what it measures

### 2.1 Fixture

Source A: 59.94 fps CFR (`60000/1001`), 120 s, 320x180 testsrc2, 1 kHz sine at 44.1 kHz, AAC. *(measured fixture)*

Source B: VFR, 30 fps timestamps with every fifth frame dropped (`select` with `-fps_mode passthrough`), 120 s, 44.1 kHz audio. Packet gaps are 0.033 s and 0.066 s, so the average is 24 fps. *(measured)*

Cuts: 60 keep-segments of 0.4 to 2.5 s separated by gaps of 0.2 to 1.0 s, seeded. Timeline 85.954 s unsnapped, 85.903 s snapped to the 59.94 source grid, 85.70 s snapped to the 30 fps grid. Output: 30 fps mpeg4 plus AAC 192 kbit/s (LGPL-safe encoder, as in `encoderArgs`). Errors are container stream durations from `ffprobe` minus the baseline the graph was asked to produce. The baseline is the sum of the snapped segment lengths when the variant snaps.

### 2.2 Results (full pipeline, 60 joins)

| Variant | Video end error | Audio end error | Video minus audio | Note |
|---|---|---|---|---|
| Current `render.ts` pattern: `fps=30` per clip, cuts unsnapped | **+546 ms** (16.4 frames) | **+567 ms** | -21 ms | about 9 ms or 0.27 frame per join on this fixture |
| `fps=30` once after concat, cuts unsnapped | +180 ms | +191 ms | -12 ms | concat effect (section 2.3) |
| Cuts snapped to nearest source frame, `fps=30` once after concat | -2.5 ms | +0.5 ms | -3 ms | |
| Cuts snapped outward (floor in, ceil out), `fps=30` after concat | +13 ms | +0.4 ms | +13 ms | snapping outward adds about one frame per cut, so the baseline changes |
| Cuts snapped outward, output at `60000/1001`, no `fps` filter | 0.0 ms | +0.4 ms | -0.4 ms | baseline includes the outward growth |
| **Recommended: `fps=30` on each source before trim, cuts on the frame grid** | **0.0 ms** | **0.0 ms** | **0.0 ms** | 60 joins, CFR 59.94 source |
| Same, 30 fps VFR source (24 fps average) | 0.0 ms | 0.0 ms | 0.0 ms | |
| Same, a second random cut set (seed 11) | 0.0 ms | -0.7 ms | +0.7 ms | |

VFR source, unsnapped: current pattern +580 ms video, +617 ms audio; `fps` once after concat +380 ms. Snapped and `fps` once after concat, on the same VFR source: +367 ms video (this is the `current_clip` label in `vfr_test.py`, which was snapped; it is not the current render path).

### 2.3 Stage isolation (video-only and audio-only graphs)

Video-only, 60 joins, FFV1 in Matroska (lossless, no encoder priming):

| Graph | End error |
|---|---|
| Per-clip `fps=30`, unsnapped | +479 ms |
| Per-clip `fps=30`, snapped | +464 ms |
| No `fps`, unsnapped | +82 ms |
| No `fps`, snapped | +0.5 ms |
| `fps=30` after concat, unsnapped | +79 ms |

Audio-only, same cuts, `atrim` + `asetpts` + `aresample=48000` per clip (as in `render.ts`): +0.48 ms. With `aresample` after concat: -0.04 ms. The audio graph is exact.

**Reading.**

1. **Per-clip `fps` adds frames.** Each clip is a separate `fps` pass that emits whole frames. A clip of 2.3 frames gives 3 frames, so the error does not cancel. This holds even when the cut is snapped (+464 ms), so snapping alone does not fix it.
2. **Concat uses the longer stream of each segment.** The audio-only graph is exact, yet the audio end in the full mp4 is +191 ms. The audio is stretched to the video segment. The concat documentation, as quoted in FFmpeg trac #6479 (fetched, see section 7), says it uses "the duration of the longest stream in each segment (except the last one)". Our data agrees: with sub-frame cut points the video segment overshoots by up to one source frame, and the audio follows it.
3. **Snapping removes the overshoot.** When every cut is on the source frame grid, each trimmed video segment is an integer number of frames, so video and audio lengths match and the error is 0.5 ms (video-only).
4. **Why the per-join number is small.** On this fixture the error per join is about 1.4 ms (video-only, no `fps`) to 9 ms (current render pattern), not one frame. The total depends on where the cuts fall. Do not assume one frame per join; measure it with the eval gate in section 6.

### 2.4 Does the source fps matter?

`render.ts` uses the project fps for every clip (`fps=${fps}`), not the source fps. The source fps only matters through the grid. So:

- A 59.94 source into a 30 fps project needs a 30 fps grid for the cuts. The `fps=30` pre-pass gives that grid (measured exact).
- A VFR source into a CFR project works the same way, because the `fps` filter maps pts to the grid before the trim (measured exact on the 24 fps average source).
- `project.timeline.fps` is a JavaScript number. `fps=29.97` is not `30000/1001`. Over one hour the difference is about 0.36 frame. Store and emit the rate as a rational (section 4.3).

---

## 3. How the tools and bug reports handle this

### 3.1 auto-editor

- Issue #424, "Desync Davinci Resolve" (fetched). The reporter saw about 0.02 s of audio lag with 0.01 s gaps between cuts, on a source with the fractional rate `1731213000/28881053`. The maintainer suspected that rate and suggested `-r 60`. Closed as completed on 2024-04-24. No code change is named. Our reading: a non-standard rate makes the per-clip grid mismatch larger; the fix is to put the output on a rational grid, which section 4 does.
- Issue #403, "20min > 1sec - 59.999024" (fetched). The reporter recorded with OBS to MKV, converted to MP4, and said that recording directly to MP4 fixed it. Closed the same day. The thread does not show an auto-editor fault. **Correction to the field notes:** section F9 of [cut quality field notes](cut-quality-field-notes.md) cites #403 as auto-editor drift. The fetched thread does not support that.

### 3.2 FFmpeg behaviour

- Concat longest-stream rule: FFmpeg trac #6479 (fetched). The ticket is "new" with no developer analysis. It reproduces a 16.17 s output where 13 s was expected, because the longer audio set the last segment's length. Our measurements in section 2.3 agree.
- Related trac tickets (search snippets only, not opened): #4769, "Audio and video out of sync after a couple of rounds" of concatenation, and #6664, "ffmpeg concat audio not in sync". Both are open or new. #5058 reports that concat ignores the audio delay of the second segment. Use them as reports to watch, not as proof.
- `fps` filter: round mode defaults to `near` (local binary, `ffmpeg -h filter=fps`). Its `eof_action` defaults to `round`. The per-clip frame excess comes from `near` plus the end-of-stream handling (reasoning, consistent with the measurements).
- Output modes (fetched, `ffmpeg.html`): `-fps_mode passthrough` "Each frame is passed with its timestamp from the demuxer to the muxer"; `cfr` "Frames will be duplicated and dropped to achieve exactly the requested constant frame rate"; `vfr` passes frames through "or dropped so as to prevent 2 frames from having the same timestamp"; `auto` is the default. `-avoid_negative_ts` is named in the passthrough text and no values were listed in the fetched excerpt.
- Concat demuxer: FFmpeg trac #4768 (fetched) says that using it for TS to MP4 gives per-file audio/video offsets that vary "in unpredictable ways", and "it still wouldn't be completely constant frame rate". Do not use it.
- `-vsync cfr` duplicating the wrong frames: FFmpeg trac #8063 (search snippet only).

### 3.3 VFR sources

- The MP4 remux of the VFR test file reports `r_frame_rate=30/1` and `avg_frame_rate=24/1` (measured). The same packets in MKV report `30/1` and `30/1`, because the MKV header reports 30/1 for both (measured); the cause was not checked, and the header's default frame duration is the likely reason (reasoning). A probe that reads only `avg_frame_rate` can therefore miss VFR. Use packet count over duration: 2880 packets over 120.0 s is 24.0 fps (measured).
- A VFR-to-CFR conversion before editing is the common workaround (VideoHelp, search snippet, not opened). Our in-graph `fps` pre-pass does the same job without a separate file, and it is exact on the fixture.

### 3.4 Concat filter versus trim and setpts

- `trim` plus `setpts=PTS-STARTPTS` and `atrim` plus `asetpts=PTS-STARTPTS` are correct and must stay. Output first pts is 0.000 on both streams (measured).
- The concat filter with `v=1:a=1` is correct when the segments are exact. The problem is the per-segment length rule, not the choice of filter.

### 3.5 Other NLE behaviour

Not checked in this session. The field notes list Adobe bug reports (search snippets), which describe the same class of symptom in product form.

---

## 4. Recommended change to `render.ts`

### 4.1 The graph (tested)

The shape below was run on the CFR fixture and gives 3.900 s for both streams and 117 frames (= 3.9 x 30) for a two-clip example (measured):

```sh
ffmpeg -y -i in.mp4 -filter_complex "\
[0:v]fps=30,split=2[s0][s1];\
[s0]trim=start=1.2:end=3.4,setpts=PTS-STARTPTS,format=yuv420p[v0];\
[s1]trim=start=5:end=6.7,setpts=PTS-STARTPTS,format=yuv420p[v1];\
[0:a]atrim=start=1.2:end=3.4,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,afade=t=out:st=2.192:d=0.008[a0];\
[0:a]atrim=start=5:end=6.7,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:st=0:d=0.008[a1];\
[v0][a0][v1][a1]concat=n=2:v=1:a=1[ov][oa]" -map "[ov]" -map "[oa]" out.mp4
```

Rules the graph depends on:

- Every cut point, for video and audio, is `round(t * fps) / fps`. In the example the cuts are 1.2, 3.4, 5.0 and 6.7 at 30 fps (all whole frames).
- `fps=F` appears once per source, before any `trim`, and the output of that pass is split into one label per clip that uses the source.
- No `fps` filter after the trim, and none after the concat, when the project rate is the grid rate.
- Use `format=yuv420p` per clip as today.

### 4.2 Proposed `render.ts` diff (sketch; not applied, not compiled)

The FFmpeg shape is the tested graph above. The TypeScript is a sketch to be checked by the owner of the file.

```ts
/** Round a time in seconds to the nearest frame of a rational frame rate, so each clip is whole frames. */
export function snapToFrame(t: number, fps: number): number {
  return Math.round(t * fps) / fps;
}
```

In `buildRenderPlan`, before `clips.forEach`, count clips per asset and emit one pre-trim pass per source:

```ts
// One fps pass per source, before any trim: every source frame then lies on the project grid.
const uses = new Map<string, number>();
for (const c of clips) uses.set(c.assetId, (uses.get(c.assetId) ?? 0) + 1);
const sourceLabels = new Map<string, string[]>(); // assetId -> one label per clip, consumed in order
```

When an asset is first opened (`addInput`), emit:

```ts
const m = uses.get(asset.id) ?? 1;
const labels = Array.from({ length: m }, (_, j) => `[src${k}_${j}]`);
filters.push(`[${k}:v]fps=${fps}${m > 1 ? `,split=${m}` : ""}${labels.join("")}`);
sourceLabels.set(asset.id, labels);
```

In the per-clip head, use the snapped times for both streams and drop the per-clip `fps`:

```ts
const inS = snapToFrame(c.in, fps);
const outS = snapToFrame(c.out, fps);
const dur = outS - inS;          // replaces clipDuration(c) in the fades
const label = sourceLabels.get(c.assetId)?.shift();   // take the next label; avoid a non-null assertion
const head = `${label}trim=start=${n(inS)}:end=${n(outS)},setpts=PTS-STARTPTS`;
const tail = `setsar=1,format=yuv420p${vFade}[v${i}]`;   // no fps= here any more
// audio: atrim=start=${n(inS)}:end=${n(outS)} in place of c.in / c.out
```

`label` may be `undefined` if the map is empty. The code should throw a clear error in that case, not use `!`.

### 4.3 Required model change (not optional)

Render snapping alone is not enough. Clip times in the model are used for overlays, captions, zoom and `timelineDuration` (`timeline.ts`: `clipDuration` returns `c.out - c.in`; `timelineDuration` uses `clipEnd`). If render snaps but the model does not, the timeline positions drift from the output by up to half a frame per clip.

So:

1. **Quantize at the model.** The planner in `cuts.ts`, and the trim and split commands in `timeline.ts`, store `in` and `out` on the frame grid (`snapToFrame`). The render snap then does nothing for new projects and is a safety net for old ones.
2. **Store the rate as a rational.** Map 59.94 to `60000/1001` and 29.97 to `30000/1001` (for example, `fps` as `{num, den}`, or a helper `rationalFps(number)` for the common NTSC values). Emit that rational in the `fps=` filter, and use it in `snapToFrame`.
3. **Add a test.** After quantization, `timelineDuration(project)` must equal the rendered duration within 1 ms, and the eval in section 6 must pass.

### 4.4 What this changes for behaviour

- Cuts move by at most half a frame (16.7 ms at 30 fps, 8.3 ms at 60). The field notes require at least 80 ms of pad around words, so a nearest-frame snap stays inside the pad. Cut-into-word is not measured here, because the fixture has no word truth; add it to the eval.
- Snapping outward (floor in, ceil out) would never cut into speech but adds about one frame per cut (+13 ms on the fixture, and about 1.1 s of extra length over 60 cuts). Use nearest unless the pad test fails.

---

## 5. Breath attenuation

### 5.1 Fixture and measurement

Fixture (48 kHz mono, 4 s), dBFS RMS over 20 ms or longer windows: loud word 1 kHz at -20; room tone white noise at -60; a 0.4 s breath at -38 (one-pole lowpassed noise, 30 ms in and out) at 0.50 to 0.90 s inside a gap; a soft word at -34 at 1.30 to 1.60 s. Measured with pure Python; recipes are FFmpeg filters.

| Recipe | Breath | Soft word | Room | Word | Verdict |
|---|---|---|---|---|---|
| Input | -38.0 | -34.0 | -60.1 | -20.0 | |
| Gain automation on the breath span, -12 dB, 20 ms ramps | **-50.0 (-12.0)** | -34.0 (0.0) | -60.1 (0.0) | -20.0 (0.0) | **ADOPT** |
| `volume=0.251:enable='between(t,0.50,0.90)'` (step) | -50.0 (-12.0) | -34.0 | -60.1 | -20.0 | Not adopted: click not measured |
| `compand` expander, points `-60/-60\|-38/-50\|-20/-20` | -45.5 (-7.5) | **-41.7 (-7.7)** | -64.7 (-4.6) | -20.0 | REJECT: not selective |
| `afftdn=nr=12:nf=-50` | -38.5 (+0.5) | -34.0 | -72.1 (-12.0) | -20.0 | REJECT for breath: a room-tone tool |

Caveat: the fixture breath is lowpassed noise, and the soft word is a tone. Real breaths have more structure. Re-run the table on real clips before tuning the depth.

### 5.2 The adopted recipe

Gain automation in clip-local time (`t` is seconds from the clip start, because `asetpts` resets it), for a span from `a` to `b` in seconds at gain `g` (linear), with 20 ms ramps:

```
volume=volume='if(lt(t,a-0.02),1,if(lt(t,a),1-(1-g)*(t-(a-0.02))/0.02,if(lt(t,b),g,if(lt(t,b+0.02),g+(1-g)*(t-b)/0.02,1))))':eval=frame
```

Worked example, verified (`gain_in_clip.py`): a clip starting at source 1.0 s, breath at source 1.5 to 1.9 s (clip-local 0.5 to 0.9 s), gain -12 dB. In the chain `atrim, asetpts, aresample=48000, aformat, volume=1, <breath volume>`, the window inside the breath is -12.00 dB against the plain render, and the windows before and after are 0.00 dB. This is the position in the chain `render.ts` would use: after the existing `volume=${c.volume}` and before the join fades.

### 5.3 Integration rule (planner, design)

A breath inside a removed gap must not add a picture cut. Current behaviour removes `[a.end + left, b.start - right]`, one join per pause. Keep that single join:

1. Find breath spans in the gap (150 to 600 ms, 15 to 30 dB below the surrounding speech, from the same 20 ms frames).
2. Extend the preceding kept clip to `breathEnd + pad_post`, so its audio ends after the breath. The video is continuous through the breath, with one cut at the same place as today.
3. Give that clip a gain entry for `[breathStart, breathEnd]` at -12 dB (the `standard` value; `podcast` -10 dB).
4. Kept pause length becomes `breathEnd + pad_post - (a.end + left)`, which is longer than `keep_pause`. The field notes gate ("output gap at most `keep_pause` + 0.05 s") must allow the breath length when a breath is kept. This is a product choice (section 8).

Schema: a clip-level `gains` list (`{from, to, db}` in clip-local seconds). This is a change to the timeline model and needs a spec under `docs/specs/` (AGENTS.md: architectural changes need a spec).

---

## 6. Eval gates (for the harness)

Use the generators in section 1 of the scratchpad scripts as the seed of an eval, with no committed media (AGENTS.md).

| Metric | Gate |
|---|---|
| Video end minus timeline (60 joins, 30 and 59.94 sources, VFR source) | at most 1 output frame (33 ms at 30 fps) |
| Audio end minus timeline | at most 1 ms |
| Video end minus audio end | at most 1 output frame |
| Timeline duration (model) minus render duration | at most 1 ms |
| Breath gain inside span | -12 dB plus or minus 0.5 dB; 0 dB outside the span plus ramps |
| Soft word at -34 dB inside a gain window | unchanged (0 dB) |

---

## 7. Sources

Fetched this session:

- auto-editor issue #424, "Desync Davinci Resolve", https://github.com/WyattBlue/auto-editor/issues/424
- auto-editor issue #403, "20min > 1sec - 59.999024", https://github.com/WyattBlue/auto-editor/issues/403
- FFmpeg trac #6479 (concat uses the longer stream per segment), https://ffmpeg.org/pipermail/ffmpeg-trac/2017-June/040178.html
- FFmpeg trac #4768 (CFR preservation, concat demuxer offsets), https://ffmpeg.org/pipermail/ffmpeg-trac/2016-January/032174.html
- FFmpeg documentation, output options (`-fps_mode`), https://ffmpeg.org/ffmpeg.html (second page)
- Local FFmpeg 6.1.1 help: `ffmpeg -h filter=volume` (has `eval=frame` and timeline `enable`), `ffmpeg -h filter=fps` (`round`, `eof_action`), `ffmpeg -h filter=concat`.

Search snippets only, not opened:

- FFmpeg trac #4769, "Audio and video out of sync after a couple of rounds", https://lists.ffmpeg.org/pipermail/ffmpeg-trac/2015-August/029356.html
- FFmpeg trac #6664, "ffmpeg concat audio not in sync", https://lists.ffmpeg.org/pipermail/ffmpeg-trac/2017-September/040952.html
- FFmpeg trac #5058, concat ignores audio delay of second segment, https://lists.ffmpeg.org/pipermail/ffmpeg-trac/2015-December/031303.html
- FFmpeg trac #8063, `-vsync cfr` duplicates the wrong frames, https://lists.ffmpeg.org/pipermail/ffmpeg-trac/2020-January/052372.html
- FFmpeg user list, concat durations and audio/video length (blocked by bot protection when fetched), https://lists.ffmpeg.org/pipermail/ffmpeg-user/2018-January/038706.html
- VideoHelp, VFR to CFR before editing, https://forum.videohelp.com/threads/400694-VFR-to-CFR-conversion-before-editing

Not reachable: the FFmpeg filter reference page is over 590k characters, and the sections for `concat`, `fps` and `volume` were beyond the portion read. The concat wording above comes from the trac ticket, which quotes it.

---

## 8. Needs a human

- **Model invariant.** Cut times on the frame grid (section 4.3) change the timeline model. Write a spec under `docs/specs/` and decide whether old projects are re-quantized on open or only at render.
- **Rate representation.** Storing fps as a rational changes the project schema. Decide the representation.
- **Breath versus pause length** (section 5.3, step 4). Keeping the breath lengthens the kept pause. Decide whether that is acceptable or whether the breath should replace some of the pause.
- **Output rate for 59.94 sources.** Converting 59.94 to 30 changes the picture rate. Product choice; the render is exact either way.

---

## 9. What was not measured

- Real footage: the fixtures are a sine, testsrc2 and synthetic noise. Lip sync was not checked by eye; the end-time metrics and the per-segment length argument are the evidence.
- Per-join start alignment: alignment is inferred from exact segment lengths. A marker test (flash plus beep at each cut) would confirm it.
- `-fps_mode cfr` on the output as an alternative to the pre-pass: not run.
- Cut into word: no word truth in the fixture.
- 48 kHz source audio: the audio test used a 44.1 kHz source with `aresample`; the 48 kHz path has no resample and is expected to be exact (reasoning).
- The `enable=` step click: not measured.
- Other NLEs' export behaviour: not checked.
