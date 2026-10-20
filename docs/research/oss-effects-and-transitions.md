---
type: Research
title: Open-source effects and transitions
description: Which Premiere, After Effects and CapCut style effects can run as pure FFmpeg filters, which need a separate plugin process, and which open-source licences rule options out.
tags: [research, ffmpeg, effects, transitions, color, licensing, plugins]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T19:20:00Z
---

# Research: open-source effects and transitions

Scope: transitions, colour grading, and highlight or attention effects for dax-editor's render path (`packages/core/src/render.ts`, `overlay-filters.ts`), with the intake rules from `AGENTS.md` (free, permissive licences, LGPL-safe FFmpeg, no AGPL, must run locally).

Test conventions. **Tested** means the command ran on the local FFmpeg 6.1.1 with exit code 0, and where stated the output was checked by frame or pixel. Outputs were written to a scratch directory outside the repo. **Unverified** means it was not run. Stack Overflow and Reddit did not return usable results from the search tool, so the gotchas below cite FFmpeg mailing-list and bug-tracker threads, plus one fetched guide.

## Recommendation

1. **Baseline: pure FFmpeg, ship in core.** Transitions (`xfade`), colour (`lut3d`, `eq`, `colorbalance`, `curves`, `vignette`, `unsharp`, `noise`), punch-in zoom and shake, spotlight and callouts (`geq`, `drawbox`), RGB split, freeze frame, speed ramp, blur-background reframe, picture-in-picture, split screen, mask reveal, green screen (`chromakey`, `colorkey`), and stabilisation with `deshake`. Every fragment in section 3 ran here. `deshake` is in libavfilter, which is LGPL-2.1 or later.
2. **Plugin: separate process.** Anything that needs a model or computer vision: subject cut-out, face tracking for auto-reframe, cursor-driven auto-zoom capture. The `dnn_processing` filter is compiled into this build, but none of its backends is enabled (tested), so model-based effects cannot run inside FFmpeg here.
3. **Reject.** RMBG-2.0 (CC BY-NC 4.0, non-commercial). Cap's editor code (AGPL-3.0). In a shipped LGPL FFmpeg build: `libvidstab`, `librubberband`, `frei0r`, `libx264` and `libx265`, because FFmpeg's configure keeps them behind `--enable-gpl` (section 0).
4. **Transitions.** Ship stock `xfade` with the curated 12 in section 1. gl-transitions (MIT) is the best source of extra looks, but both wrappers need a patched or custom FFmpeg build, so treat it as an optional plugin.
5. **LUTs.** Generate our own `.cube` files from formulas. We did this for one look (`teal_orange.cube`, 17 points per axis). Do not ship a third-party LUT pack until its licence is checked against its primary page.

Curated 12 transitions (all 58 `xfade` names were tested; these are the ones to expose in the UI):

| Group | Names |
|---|---|
| Dissolves | `fade`, `fadeblack`, `dissolve` |
| Directional | `wipeleft`, `slideleft`, `smoothleft` |
| Shape | `circleopen`, `circlecrop`, `radial` |
| Style | `zoomin`, `pixelize`, `squeezeh` |

## 0. Build licensing (read first)

- The local binary is a GPL build. `ffmpeg -L` reports `--enable-gpl`, and the build includes `libx264`, `libx265`, `libvidstab`, `librubberband` and `frei0r`.
- FFmpeg's configure script defines `EXTERNAL_LIBRARY_GPL_LIST` as `avisynth frei0r libcdio libdavs2 libdvdnav libdvdread librubberband libvidstab libx264 libx265 libxavs libxavs2 libxvid` (fetched from the configure script).
- The FFmpeg legal page says the LGPL route is a build "without `--enable-gpl` and without `--enable-nonfree`" (fetched). Its default licence is LGPL-2.1 or later.
- Consequence for the shipped build: `vidstab*`, `rubberband`, `frei0r`, `libx264` and `libx265` are unavailable. Encoder selection already avoids `libx264` in `render.ts`. `libopenh264` is listed there too, but its licence was not checked here.
- vid.stab's repository now states LGPL-2.1 or later and says older releases were GPL (fetched). FFmpeg's configure still gates `libvidstab` behind `--enable-gpl`, so it cannot be used in a shipped build. Use `deshake` instead.
- The GPL rule in `AGENTS.md` allows a GPL program only as a separate process. None of the vidstab, rubberband or frei0r filters is a standalone program, so they cannot be used through that route.

## 1. Transitions

### 1.1 Stock `xfade` (baseline)

`xfade` in FFmpeg 6.1 takes 58 named transitions (`transition=` 0 to 57) plus `custom` (expression-based, not tested here). Every named value was run through a short two-clip graph, and all 58 exited 0 (tested).

Full name list: `fade wipeleft wiperight wipeup wipedown slideleft slideright slideup slidedown circlecrop rectcrop distance fadeblack fadewhite radial smoothleft smoothright smoothup smoothdown circleopen circleclose vertopen vertclose horzopen horzclose dissolve pixelize diagtl diagtr diagbl diagbr hlslice hrslice vuslice vdslice hblur fadegrays wipetl wipetr wipebl wipebr squeezeh squeezev zoomin fadefast fadeslow hlwind hrwind vuwind vdwind coverleft coverright coverup coverdown revealleft revealright revealup revealdown`.

Tested fragment (duration 1 s, offset 2 s, two 3 s inputs, output 5.0 s):

```
[0:v][1:v]xfade=transition=fade:duration=1:offset=2,format=yuv420p
```

Rules found while testing:

- **Use names, not numbers.** `transition=2` fails with `const_values array too small for transition`. Named values work.
- **Output length is `a + b - duration`.** Confirmed: 3 s + 3 s with a 1 s transition gave 5.0 s.
- **The offset must fit inside the first input.** `offset` is measured from the start of the first input, and the transition must finish before that input ends. An overrun does not error. With a 3 s first input, offset 2.5 and duration 1, the output became 5.5 s and the transition was cut short (tested). A mailing-list reply on the same failure reads "Your first input finishes before the transition is completed" (fetched).
- **Inputs must match.** A 320x180 input and a 640x360 input fail with `First input link main parameters (size 320x180) do not match the corresponding second input link xfade parameters (size 640x360)` (tested). `render.ts` already normalises size, fps and pixel format per clip, so this holds in the render graph.
- **No audio.** `xfade` only handles video. Pair it with `acrossfade` of the same duration (reported on the mailing list; not tested here).
- **Graph shape.** `render.ts` joins clips with `concat`. Transitions need a chain of `xfade` nodes with computed offsets at each clip boundary. Plan for that change in the schema (section 5).

### 1.2 gl-transitions (MIT, plugin tier)

- Licence: MIT, "Copyright (c) 2017-present gl-transitions contributors" (fetched `LICENSE`).
- Content: the `transitions/` directory listing shows 100 `.glsl` files. The page truncates at 100, so the real count is higher (fetched). Each shader defines `transition(uv)` and reads frames through `getFromColor` and `getToColor`.
- **ffmpeg-gl-transition** (MIT, "MIT (c) Travis Fischer", fetched): a native C filter, `vf_gltransition.c`, which must be copied into `libavfilter/` and applied as a patch. It needs `--enable-opengl --enable-filter=gltransition`, plus GLEW with EGL or glfw. Both inputs must be the same size. Not tested here: this build has no `gltransition` filter (`ffmpeg -filters` lists none).
- **xfade-easing** (MIT, fetched): patches `vf_xfade.c` and adds `xfade-easing.h`. It adds `easing=cubic-in-out` and CSS bezier curves to `xfade`. Not tested.
- Verdict: plugin tier. Each wrapper requires a forked FFmpeg, which is a maintenance cost we would carry. A lower-cost path is to run GLSL transitions in a separate process and feed frames back, which is unverified and would need its own design. Keep stock `xfade` for the baseline.

## 2. Colour

### 2.1 Recipes (all tested, exit 0)

| Step | Fragment | Result |
|---|---|---|
| LUT | `lut3d=file=<path>` | Mean RGB on the test pattern moved by +2.0, +2.0, -1.6. Subtle, so tune the formula. |
| Exposure and contrast | `eq=contrast=1.08:saturation=1.12:gamma=1.02` | Exit 0. |
| Colour balance (teal shadows, orange highlights) | `colorbalance=rs=-0.12:gs=0.04:bs=0.10:rm=-0.04:bm=0.06:rh=0.10:bh=-0.08` | Exit 0. |
| Curves preset | `curves=preset=cross_process` | Exit 0. |
| Custom curves | `curves=r='0/0 0.5/0.56 1/1':b='0/0 0.5/0.46 1/1'` | Exit 0. |
| Vignette | `vignette=angle=PI/4` | Exit 0. |
| Sharpen | `unsharp=lx=5:ly=5:la=0.8:cx=3:cy=3:ca=0.4` | Exit 0. |
| Film grain | `noise=alls=14:allf=t+u` | Exit 0. |

**Look preset** (a filter-chain string, tested exit 0):

```
lut3d=file='<absolute path>',eq=contrast=1.06:saturation=1.1,colorbalance=rh=0.04:bh=-0.04,vignette=angle=PI/5,noise=alls=8:allf=t,format=yuv420p
```

Quote the LUT path the way `quoteFilterValue` and `filterPath` already do in `overlay-filters.ts`. Paths can contain `:` and `'`, and Windows paths need forward slashes.

### 2.2 LUT sources and licences

- **Q-DDL free LUT packs.** The 80.lv article states the packs are CC BY 4.0 and allow personal and commercial use (fetched). CC BY requires attribution. The primary page `quickddl.net` did not resolve from this sandbox, so this is **unverified** against the primary source.
- **Filmic Blender repository.** The `luts` and `looks` folders have no licence statement in the fetched page (fetched). Do not use until the licence is confirmed.
- **Other packs.** A search snippet mentioned a commercial pack with personal-use terms. It was not fetched, so it is not used here.
- **Recommendation.** Generate LUTs from formulas in our own code, licensed with the repo. This avoids third-party terms entirely. The generator used for `teal_orange.cube` was a short Python script that writes a 17-point `.cube` file (`TITLE`, `LUT_3D_SIZE 17`, red-fastest rows). Commit the generator, not the output, if we want the LUT files to be reproducible.

## 3. Highlight and attention effects

Columns: parameters a UI would expose, the FFmpeg fragment, the test status, and the verdict. "Baseline" means pure FFmpeg in core. "Plugin" means a separate process.

### 3.1 Baseline effects

| Effect | UI parameters | Fragment | Status | Verdict |
|---|---|---|---|---|
| Punch-in zoom on a beat | strength, beat length, decay, centre x/y | see 3.2 | Tested. Beat frames put a white box edge at px 36 (expected about 35) against 100 unzoomed. | Baseline |
| Shake | amplitude, frequency, decay | see 3.2 | Tested exit 0. | Baseline |
| Spotlight (dim outside a circle) | centre, radius, dim amount | see 3.2 | Tested exit 0. Visual check: outside dimmed. | Baseline (per-frame `geq` is slow at high resolution, unverified) |
| Box callout | x, y, w, h, colour, stroke, in/out | `drawbox=x=300:y=200:w=400:h=220:color=yellow@0.9:t=6:enable='between(t,1,3)'` | Tested exit 0. | Baseline |
| Circle callout | centre, radius, stroke, colour | see 3.2 | Tested. Pixel at (840,360) = (254,230,0). | Baseline |
| Arrow callout | start, end, colour | Not tested. Draw with a PNG asset and `overlay` (unverified). | Unverified | Baseline with an asset |
| RGB split / glitch | shift px, edge mode | `rgbashift=rh=-6:bh=6:edge=smear` | Tested exit 0 (shift not measured). | Baseline |
| Freeze frame with sound effect | frame time, hold length, sound effect | see 3.2 | Tested exit 0 (video). Sound mix tested exit 0. | Baseline |
| Speed ramp | keyframes (time, speed) | see 3.2 | Tested exit 0 (video). Audio 2 s + 2 s at half speed gave 5.98 s (expected 6.0). | Baseline |
| Blur background (vertical reframe) | blur radius, output aspect | see 3.2 | Tested exit 0. Visual check: sharp centre over blurred fill. | Baseline |
| Picture-in-picture | size, corner, start/end | `[1:v]scale=426:-2[pip];[0:v][pip]overlay=W-w-32:H-h-32:enable='gte(t,1)'` | Tested exit 0. | Baseline |
| Split screen | layout, gap | `hstack=inputs=2` (or `xstack`) | Tested exit 0. | Baseline |
| Mask reveal | direction, feather | see 3.2 | Tested. Visual check: left side transparent, right side opaque. | Baseline (xfade wipes also reveal) |
| Green screen | key colour, similarity, blend | see 3.2 | Tested. Pixel check: keyed centre (253,0,0), no green in the corner. | Baseline |
| Colour key (RGB) | colour, similarity, blend | `colorkey=0x00b140:0.12:0.08` | Tested exit 0 (not visually checked). | Baseline |
| Stabilisation | shakiness, smoothing, edge mode | `deshake=x=-1:y=-1:w=-1:h=-1:rx=16:ry=16:edge=mirror` | Tested exit 0 on a synthetic shake (stability not measured). | Baseline (LGPL) |

### 3.2 Tested fragments

Punch-in zoom with `scale` evaluated per frame, then a fixed crop (tested; the beat frames fall at 0, 0.5 and 1.0 s):

```
scale=w='1280*(1+0.12*exp(-8*mod(t,0.5)))':h='720*(1+0.12*exp(-8*mod(t,0.5)))':eval=frame,crop=1280:720:(in_w-1280)/2:(in_h-720)/2
```

Punch-in zoom with `zoompan` (tested; beat result identical, edge at px 36):

```
zoompan=z='1+0.12*exp(-8*mod(time,0.5))':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=30
```

Time window for the zoom (tested; edge 100 px outside the window, 36 px at the beat inside it). This is the recommended gating pattern, because it works with filters that do not support `enable`:

```
[0:v]split=2[a][b];[b]scale=w='1280*(1+0.12*exp(-8*mod(t,0.5)))':h='720*(1+0.12*exp(-8*mod(t,0.5)))':eval=frame,crop=1280:720:(in_w-1280)/2:(in_h-720)/2[z];[a][z]overlay=enable='between(t,1,2)'
```

Shake (tested; `crop` `x` and `y` vary per frame, `w` and `h` are fixed):

```
crop=w=iw*0.94:h=ih*0.94:x='(iw-ow)/2+8*sin(2*PI*23*t)*exp(-2*t)':y='(ih-oh)/2+6*cos(2*PI*19*t)*exp(-2*t)'
```

Spotlight (tested; dims outside a radius-260 circle at the frame centre):

```
format=gbrp,geq=r='r(X,Y)*if(lt(hypot(X-640,Y-360),260),1,0.35)':g='g(X,Y)*if(lt(hypot(X-640,Y-360),260),1,0.35)':b='b(X,Y)*if(lt(hypot(X-640,Y-360),260),1,0.35)',format=yuv420p
```

Circle callout ring (tested; pixel at (840,360) is (254,230,0)):

```
format=gbrp,geq=r='if(lt(abs(hypot(X-640,Y-360)-200),4),255,r(X,Y))':g='if(lt(abs(hypot(X-640,Y-360)-200),4),230,g(X,Y))':b='if(lt(abs(hypot(X-640,Y-360)-200),4),0,b(X,Y))',format=yuv420p
```

Freeze frame (tested; `setpts` resets timestamps after the loop):

```
loop=loop=45:size=1:start=60,setpts=N/FRAME_RATE/TB
```

Freeze with a sound effect (tested exit 0):

```
[1:a]adelay=1500|1500,volume=0.8[sfx];[0:a][sfx]amix=inputs=2:duration=first:normalize=0
```

Speed ramp, video (tested exit 0). Speed is 0.5x after 2 s:

```
setpts='if(lt(T,2),T,2+(T-2)*2)'
```

Speed ramp, audio (tested: 5.98 s output for 2 s at 1x plus 2 s at 0.5x, expected 6.0 s):

```
[0:a]atrim=0:2,asetpts=PTS-STARTPTS[a1];[0:a]atrim=2:4,asetpts=PTS-STARTPTS,atempo=0.5[a2];[a1][a2]concat=n=2:v=0:a=1
```

Blur background for vertical reframe (tested exit 0, visually checked):

```
[0:v]split=2[bs][fs];[bs]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:5[bg];[fs]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p
```

Mask reveal (tested visually). The gradient is generated in FFmpeg, so no asset is needed:

```
[0:v]format=yuva420p[v];[1:v]format=gray[m];[v][m]alphamerge,format=yuva420p
```

with input 1 = `color=c=white:s=1280x720:d=4,format=gray,geq=lum='255*X/W'`.

Green screen (tested; keying happens on the green layer, then the result is overlaid on the background):

```
[0:v]chromakey=0x00b140:0.12:0.08,format=yuva420p[k];[1:v][k]overlay=shortest=1,format=yuv420p
```

with input 0 = a green screen with a red subject, input 1 = the background.

Stabilisation (tested exit 0 on a synthetic shake; stability not measured):

```
deshake=x=-1:y=-1:w=-1:h=-1:rx=16:ry=16:edge=mirror
```

### 3.3 Plugin-tier effects

| Effect | Candidate | Licence (checked) | Test status | Verdict |
|---|---|---|---|---|
| Background removal, a non-commercial model | RMBG-2.0 | CC BY-NC 4.0. Commercial use needs a separate agreement (fetched model card). | Not run | Reject |
| Background removal, a framework | rembg | MIT code (fetched). Model weights have their own licences. The default BRIA model needs a paid agreement for commercial use (fetched). | Not run | Plugin only, after each model's licence is checked |
| Background removal, u2net weights | U-2-Net | Repository is Apache-2.0 (fetched). Weights licence not checked separately. | Not run | Plugin candidate |
| Video matting | Robust Video Matting | GPL-3.0 code (fetched). Weights licence not stated. | Not run | Separate process only, and defer |
| Subject segmentation | MediaPipe | Framework Apache-2.0 (fetched). Per-model licences not checked. The installed package (1.1.1) has no bundled selfie-segmentation model that the search found. | Not run | Plugin candidate, after the model is found and checked |
| Face detection | YuNet (OpenCV Zoo) | MIT (fetched). The model is stored via Git LFS, so it was downloaded from the LFS media host. | Loads and runs: `cv2.FaceDetectorYN` (OpenCV 5.0.0, headless) returned 0 faces on a grey frame. Detection accuracy not tested (no face image). | Plugin, best face candidate |
| Screen-recording auto-zoom (Screen Studio style) | Cap | AGPL-3.0 for the editor. Only the `cap-camera*` and `scap-*` crates are MIT (fetched). | Not run | Reference for ideas only. Do not copy code. |
| Screen-recording auto-zoom (Screen Studio) | Screen Studio | Not open source (not fetched; not checked here). | Not run | Not an option |

Cursor highlight and auto-zoom split into two parts. Capture (cursor position and clicks) is outside FFmpeg and must be a plugin. Render (zoom, highlight ring, and crop following the cursor) is baseline: the punch-in and crop fragments in 3.2 accept keyframe-driven expressions. Keyframes would be a nested `if(lt(t,t1),v0,if(lt(t,t2),...))` chain. That is **unverified** beyond roughly 20 keyframes, and the expression length grows linearly with the keyframe count.

Face tracking for auto-reframe follows the same split. The detector (YuNet via OpenCV) is the plugin, and it writes a keyframe list. The render step turns that list into the `crop` `x` expression (tested pattern: `x` varies per frame). A runtime-update option (`sendcmd`) was not tested.

## 4. Baseline versus plugin (summary)

| Tier | Effects |
|---|---|
| Baseline (pure FFmpeg, LGPL-safe) | All of section 3.1. Also transitions via `xfade`, LUT-based grading via `lut3d`, and `deshake`. |
| Plugin (separate process) | Subject cut-out, video matting, face tracking, cursor capture, and any detector that writes keyframes for the baseline render step. |
| Not shippable | `vidstab*`, `rubberband`, `frei0r`, `libx264`, `libx265` in an LGPL build. RMBG-2.0 (non-commercial). Cap's editor code (AGPL). |

## 5. Proposed schema for an effect on a clip

Effects attach to a clip, with times in clip-local seconds (`start` and `end` measured from the start of the clip, consistent with the "times are seconds" rule in `AGENTS.md`). Parameters are typed and validated, never raw FFmpeg arguments.

```json
{
  "effects": [
    { "id": "fx-1", "type": "lut", "start": 0, "end": 12.5,
      "params": { "file": "looks/teal_orange.cube", "strength": 1 } },
    { "id": "fx-2", "type": "punch_zoom", "start": 4.0, "end": 8.0,
      "params": { "beat": 0.5, "amount": 0.12, "decay": 8, "cx": 0.5, "cy": 0.5 } },
    { "id": "fx-3", "type": "subject_cutout", "start": 0, "end": 12.5,
      "engine": "plugin:<id>", "params": { "quality": "fast" } }
  ],
  "transitions": [
    { "id": "tr-1", "between": ["clip-a", "clip-b"], "name": "circleopen", "duration": 0.8 }
  ]
}
```

- `type` is a closed enum: `lut`, `grade`, `grain`, `vignette`, `punch_zoom`, `shake`, `spotlight`, `callout_box`, `callout_ring`, `rgb_split`, `freeze`, `speed_ramp`, `blur_background`, `picture_in_picture`, `split_screen`, `mask_reveal`, `chroma_key`, `stabilise`. Plugin types (`subject_cutout`, `face_track`, `cursor_zoom`) also carry `engine`.
- `transition.name` must be one of the curated 12 in the UI, though the schema can accept any stock `xfade` name.

**Renderer chaining.**

1. Per-clip chain stays as today: `trim`, `setpts=PTS-STARTPTS`, `scale`, `pad`, `fps`, `format`, then the existing fades. Clip-local `t` is valid from `setpts=PTS-STARTPTS` onwards.
2. Clip effects follow in `start` order. A time-gated effect uses the split-and-overlay pattern from 3.2. Some filters support timeline editing (their `-filters` flag includes `T`, for example `eq`, `lut3d`, `colorbalance`, `vignette`, `geq`, `rgbashift`). `crop` and `zoompan` do not, so they need the split-and-overlay gate.
3. Transitions replace `concat` at a clip boundary. The graph becomes a chain of `xfade` nodes, with each offset equal to the cumulative length minus the transition duration, and with `acrossfade` for audio.
4. Text overlays are drawn after the join, as now. Their times are timeline times.
5. Paths reach the filter graph only through the existing quoting helpers.

## 6. Pitfalls

### 6.1 Reproduced locally

- **`crop` cannot vary `w` or `h` with `t`.** `crop=w='iw/(1+0.12*exp(-8*mod(t,0.5)))'` fails with `Error when evaluating the expression` (tested). `w` and `h` are evaluated once, when `t` is still NaN. Only `x` and `y` change per frame. Use `scale` with `eval=frame` (3.2).
- **`crop` has no `eval` option in 6.1.** `eval=frame` fails with `Option not found` (tested).
- **A time-gated zoom inside `scale` gave a misaligned crop.** With `between(t,1,2)` multiplied into the zoom term, the edge at the beat was 112 px instead of 36 px. The cause was not found. The split-and-overlay gate (3.2) works, so use that.
- **Numeric `xfade` transitions fail** (`const_values array too small`). Use names.
- **`xfade` overrun is silent.** The output lengthens and the transition is cut (tested). Validate `offset <= length(first) - duration` in the schema layer.
- **`xfade` size or fps mismatch fails** with a message (tested). `render.ts` normalises first, so this is handled in the render path.
- **`chromakey` keys the layer it is given.** Our first attempt keyed the background and overlaid the subject, which produced a solid red frame. Key the green screen layer, then overlay it on the background (3.2).
- **`atempo` accepts 0.5 to 100 in 6.1.** `atempo=0.25` fails with `out of range [0.5 - 100]` (tested). Chain two `atempo=0.5` for 0.25x (tested exit 0).
- **The DNN filter has no backend in this build.** `dnn_processing` with `dnn_backend` 0, 1, 2 or 3 reports `Module backend_type N is not supported or enabled` (tested). Model-based effects must run in a separate process.
- **Speed ramps need audio handled separately.** `setpts` changes video only. Use `atrim` and `atempo` segments to keep audio in step (tested).
- **`freeze` loops keep the original timestamps.** Add `setpts=N/FRAME_RATE/TB` after `loop` (tested exit 0). We did not compare the output timing against a no-`setpts` run.

### 6.2 Reported upstream, not reproduced here

- **`zoompan` with `x` or `y` set gives a shaky image.** FFmpeg trac ticket 4298 (reported about ten years ago) describes jerky output when `x` or `y` is set. The ticket page was blocked by bot protection, so only the search snippet was read (unverified). Our tested path avoids this by using `scale` and `crop`.
- **A mailing-list thread on `xfade`** confirms the offset rule: "Your first input finishes before the transition is completed" (fetched).
- **MP4 cannot carry alpha.** The dev.to guide states that "MP4 with H.264 can't carry transparency" (fetched). Chroma-keyed layers must be composited inside the same filter graph before encoding, which `render.ts` already does. Output with alpha needs WebM (VP9, `yuva420p`) or ProRes 4444 MOV (per the same guide; not tested here).

### 6.3 Not tested

- Real-time performance of `geq` (per-pixel expressions) at 4K.
- `sendcmd` for updating crop keyframes at runtime.
- `libopenh264` as the shipped H.264 encoder, and its licence.
- Quality of `deshake` on real handheld footage (only exit 0 on a synthetic shake).
- All plugin-tier models (section 3.3) except the YuNet load test.

## Sources

Fetched with WebFetch or curl (URLs actually fetched):

- https://github.com/gl-transitions/gl-transitions
- https://raw.githubusercontent.com/gl-transitions/gl-transitions/master/LICENSE
- https://github.com/gl-transitions/gl-transitions/tree/master/transitions
- https://github.com/transitive-bullshit/ffmpeg-gl-transition
- https://github.com/scriptituk/xfade-easing
- https://github.com/PeterL1n/RobustVideoMatting
- https://huggingface.co/briaai/RMBG-2.0
- https://github.com/danielgatis/rembg
- https://github.com/CapSoftware/Cap
- https://github.com/georgmartius/vid.stab
- https://github.com/google-ai-edge/mediapipe
- https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet
- https://github.com/sobotka/filmic-blender
- https://80.lv/articles/800-free-luts-released
- https://github.com/xuebinqin/U-2-Net
- https://raw.githubusercontent.com/FFmpeg/FFmpeg/master/configure
- https://ffmpeg.org/legal.html
- https://ffmpeg.org/pipermail/ffmpeg-user/2021-June/053116.html
- https://dev.to/javidjamae/ffmpeg-chromakey-filter-remove-green-screen-backgrounds-pjk
- https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx (model file, downloaded with curl and loaded in OpenCV)

Seen in search results only, not fetched (cited in text as unverified): FFmpeg trac ticket 4298, the quickddl.net LUT page (did not resolve), and the Cinecom LUT pack terms.
