---
type: Research
title: FFmpeg animation recipes
description: Tested FFmpeg filter recipes for overlays, zoom, music and sound-effect mixing, B-roll layers, speed ramps and text animation that the renderer does not have yet, with the gotchas found while testing them.
tags: [research, ffmpeg, animation, overlays, audio, zoom, rendering]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T20:05:02Z
---

# Research: FFmpeg animation recipes

Scope: the Premiere-style highlight and motion effects that `packages/core/src/render.ts` cannot produce today. The renderer has per-clip `trim`, `scale`, `pad` or `boxblur` fit modes, `fade` and `afade` on clips, `concat`, `drawtext` overlays (`overlay-filters.ts`: fade, slide-up, slide-left, pop, typewriter, lower-third) and `subtitles` captions (`captions.ts`). It has no image or shape overlay, no second video layer, no music or sound-effect bus and no per-clip zoom. `oss-effects-and-transitions.md` already covers `xfade`, colour, box and circle callouts, freeze, step speed ramp and PIP. This note only adds what is new, and corrects two of its recipes (section "Corrections").

Test conventions. **Tested** means the exact fragment below exited 0 on the local FFmpeg 6.1.1 build, and the stated property was checked. The checks were pixel values, RMS or peak levels, `ebur128`, `ffprobe` durations and frame counts, or a visual look at a 2x2 frame montage. Sources were synthetic: `testsrc2`, `gradients`, `aevalsrc` tones and clicks, flat grey `color` backgrounds, a white box drawn on flat grey, and PNGs made with `geq`. Everything ran in a scratch directory outside the repo. **Failed** means exit code not 0, with the error quoted. **Unverified** means not run, or run without the property being checked. Each fragment is the filter graph only, so `-i` inputs and `-map` are given in the lead-in. Replace `<font>` with the absolute path to `packages/core/assets/fonts/Inter-Bold.otf` or `Inter-Regular.otf`.

## Recommendation: graph shape

1. **Keep the primary track as it is.** Per-clip video and audio chains, then `concat`, give `[v_main]` and `[a_main]`. Nothing downstream changes primary timing.
2. **Second video layer after the join.** Each B-roll insert is prepared as its own chain: `setpts=PTS-STARTPTS+T/TB` moves it to timeline time, `scale` fits it, and `fade` softens it. It is then applied with `overlay` and `enable='between(t,s,e)'`, always with `eof_action=pass` (G4). A full-screen cutaway is the same overlay at 0,0 on a full-size input. The B-roll's own audio is dropped, so the main audio is untouched.
3. **Motion overlays after the video layers.** Each PNG is looped with `-loop 1 -t <duration>`, converted with `format=rgba`, and animated with `fade`, `scale` with `eval=frame`, or an `overlay` expression on `x` and `y`. Shapes that grow use a solid-colour source scaled per frame, not `drawbox` (G1).
4. **Zoom as a per-frame filter on the primary track.** Use `zoompan` with `d=1` for keyframes, or `scale eval=frame` followed by a `crop` whose offset comes from the same zoom expression (G2). A large pre-scale is needed for smooth Ken Burns motion (G8).
5. **Text and captions last,** as now, in timeline time.
6. **Audio as buses that meet in one `amix`.** The voice is `[a_main]`. The music bus is trimmed or looped, faded, and ducked by `sidechaincompress` keyed on a copy of the voice. The SFX bus splits one decoded file with `asplit` into one branch per event, each delayed with `adelay`. One `amix` with `normalize=0` joins voice, ducked music and SFX. Then `alimiter` with `level=disabled`, then `loudnorm`, then `aresample=48000` (G5, G6, G7).
7. **Keep graphs manageable.** Use `-filter_complex_script` for anything large, reuse one input through `split` or `asplit` instead of repeating `-i`, and generate expressions from typed parameters (section 8).

## Corrections to the existing research

- **Speed ramp in `oss-effects-and-transitions.md` section 3.2 is wrong as written.** `setpts='if(lt(T,2),T,2+(T-2)*2)'` exits 0 but writes only 3 frames (tested, see 6.1). A `T`-based setpts expression needs a division by `TB`. The corrected form is in 6.1.
- **The "tested" centring of the zoom crop does not hold.** The `scale eval=frame,crop=1280:720:(in_w-1280)/2:(in_h-720)/2` form exits 0, but after the scale changes size the crop offset stays at zero (G2). The research's 36 px reading at a beat is consistent with an uncentred crop, so that check did not catch it. Use recipe 2.2.

## 1. Overlays and shapes

### 1.1 Logo fade in and out (tested, visual check)

Inputs: `-i main.mp4 -loop 1 -i logo.png -t 6`. The logo fades in from 1 s and out from 3.5 s and is shown from 1 s to 4 s. At 1.3 s it is partly visible, at 2.5 s it is full, and at 3.67 s it is about two-thirds opaque. Frames at 0.5 s show no logo.

```
[1:v]format=rgba,fade=t=in:st=1:d=0.5:alpha=1,fade=t=out:st=3.5:d=0.5:alpha=1[lg];[0:v][lg]overlay=x=W-w-40:y=40:enable='between(t,1,4)'[v]
```

Map `-map "[v]" -map 0:a`. UI parameters: asset, anchor, margin, start, end, fade in, fade out.

### 1.2 Slide in with ease-out (tested, visual check)

Inputs: `-i main.mp4 -loop 1 -i arrow.png`. The arrow slides from off the left edge to x=60 over 0.5 s, starting at 1 s, with a cubic ease-out. At 1.1 s it is just entering, and by 3 s it is at rest.

```
[1:v]format=rgba[ar];[0:v][ar]overlay=x='-w+(60+w)*(1-pow(1-min(1,max(0,(t-1)/0.5)),3))':y=300:enable='gte(t,1)'[v]
```

UI parameters: direction, distance, duration, easing (linear or cubic).

### 1.3 Pop with `scale eval=frame` (tested, visual check)

Inputs: `-i main.mp4 -loop 1 -i logo.png`. The logo grows from 40% to 100% over 0.25 s from 1 s, centred. It is gone at 4.0 s, because the window is half-open.

```
[1:v]format=rgba,scale=w='256*(0.4+0.6*min(1,max(0,(t-1)/0.25)))':h=-2:eval=frame[lg];[0:v][lg]overlay=x=(W-w)/2:y=(H-h)/2:enable='between(t,1,4)'[v]
```

UI parameters: start, grow time, start scale, anchor.

### 1.4 Fixed opacity (tested, exit 0)

`colorchannelmixer` takes no expressions, so this is a fixed 50% opacity. For a changing opacity use the `fade` form in 1.1.

```
[1:v]format=rgba,colorchannelmixer=aa=0.5[lg];[0:v][lg]overlay=x=40:y=40:shortest=1[v]
```

Inputs: `-i main.mp4 -loop 1 -i logo.png`.

### 1.5 Growing underline (tested, pixel-checked on flat grey)

Input 1 is `-f lavfi -i "color=c=0xffd400:s=640x10:r=30"` over `-i flatbg10.mp4` (a 10 s flat grey clip). The fraction of the underline row that is yellow measured 0.333 at 1.2 s, 0.555 at 1.33 s, 0.833 at 1.5 s and 1.000 from 2.0 s. Those match the formula `(t-1)/0.6` exactly.

```
[1:v]format=rgba,scale=w='max(2,640*min(1,max(0,(t-1)/0.6)))':h=10:eval=frame[ul];[0:v][ul]overlay=x=120:y=560:enable='gte(t,1)':shortest=1[v]
```

UI parameters: x, y, length, start, duration, colour, thickness. `shortest=1` is needed because the colour source has no end.

### 1.6 Progress bar (tested, pixel-checked on flat grey)

Fraction of the bottom 12-pixel strip that is the bar colour: 0.139 at 0.83 s, 0.500 at 3 s and 0.833 at 5 s, against a 6 s timeline, which is the expected fraction. Both forms below pass.

Form A, a colour source scaled per frame (input 1 is `-f lavfi -i "color=c=0xff3366:s=1280x12:r=30"`, over `flatbg10.mp4`):

```
[1:v]format=rgba,scale=w='max(2,1280*t/6)':h=12:eval=frame[bar];[0:v][bar]overlay=x=0:y=H-h:shortest=1[v]
```

Form B, per-pixel `geq` on the timeline variable `T` (no second input):

```
[0:v]format=gbrp,geq=r='if(gte(Y,H-12)*lt(X,W*T/6),255,r(X,Y))':g='if(gte(Y,H-12)*lt(X,W*T/6),51,g(X,Y))':b='if(gte(Y,H-12)*lt(X,W*T/6),102,b(X,Y))',format=yuv420p[v]
```

Form A is cheaper. UI parameters: colour, height, position, start.

### 1.7 Arrow and box callouts

A box callout is already in the baseline (research 3.1). An arrow is an RGBA PNG with its own alpha, animated with 1.2 or 1.3. The test arrow was generated with `geq`. A shipped app would bundle arrow PNGs and check their licence when they are added, not generate them at render time.

### 1.8 Failed: animated `drawbox` geometry

- `drawbox=x=0:y=ih-12:w='iw*t/6':h=12:color=0xff3366:t=fill` exits 0. The bar was **full width at every time tested**: pink fraction 1.000 at 0.83 s, 3.0 s and 5.0 s (tested on a `testsrc2` background, where the pink colour does not occur). Width is read once, so `t` is undefined inside it.
- `drawbox=x=300:y=200:w=400:h=220:color=0xffd400@0.9:t='if(lt(t,2),0,max(2,8*exp(-4*(t-2))+4))':enable='gte(t,2)'` **fails** with exit 234: `Error when evaluating the expression 'if(lt(t,2),0,max(2,8*exp(-4*(t-2))+4))'`. Thickness is also read once.

## 2. Zoom

Test subject: a white box at x 600 to 680 on flat grey. Expected left edge of the box after a centred zoom of factor `z` is `640 - 40z`: 600 at z=1, 594 at z=1.15, 588 at z=1.3.

### 2.1 Keyframed zoom with `zoompan` (tested, edges within 3 px)

Input `-i box.mp4`. The zoom follows keyframes at 1 s (z=1), 2 s (z=1.3) and 3 s (z=1). Measured left edges at 0.5, 1.0, 1.5, 2.0, 2.5 and 3.0 s were 600, 600, 596, 591, 596 and 600. Expected values are 600, 600, 594, 588, 594 and 600, so the error is at most 3 px from `zoompan`'s integer crop window.

```
zoompan=z='if(lt(time,1),1,if(lt(time,2),1+0.3*(time-1),if(lt(time,3),1.3-0.3*(time-2),1)))':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=30
```

`d=1` is required on video, because the default `d=90` repeats each frame. UI parameters: keyframe list (time, zoom), anchor x and y.

### 2.2 Keyframed zoom with `scale eval=frame` and `crop` (tested, exact)

The `crop` offset must come from the same zoom expression, not from `in_w` or `iw` (G2). With this form the edges were 600 at 0.5 s, 594 at 1.5 s and 594 at 2.5 s, matching the formula exactly.

```
scale=w='trunc(1280*(if(lt(t,1),1,if(lt(t,2),1+0.3*(t-1),if(lt(t,3),1.3-0.3*(t-2),1))))/2)*2':h='trunc(720*(if(lt(t,1),1,if(lt(t,2),1+0.3*(t-1),if(lt(t,3),1.3-0.3*(t-2),1))))/2)*2':eval=frame,crop=w=1280:h=720:x='640*((if(lt(t,1),1,if(lt(t,2),1+0.3*(t-1),if(lt(t,3),1.3-0.3*(t-2),1))))-1)':y='360*((if(lt(t,1),1,if(lt(t,2),1+0.3*(t-1),if(lt(t,3),1.3-0.3*(t-2),1))))-1)'
```

The offset is `640*(z-1)` horizontally and `360*(z-1)` vertically, which is half the extra size. Use this form when the crop must be exact, for example when the zoomed frame has to match another layer. Scale is computed with `eval=frame`, so the expression can use `t`.

### 2.3 Ken Burns with a pre-scale (tested, jitter measured)

Input: `-loop 1 -i still.png -t 6`, a 1280x720 still. The zoom goes from 1 to 1.3 over 180 frames. The edge was measured on all 180 frames and the number of direction changes (jitter) counted.

```
scale=5120:2880,zoompan=z='1+0.3*on/180':d=180:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=30
```

| Pre-scale | Direction changes (of a monotonic 180-frame move) | Wall time for 6 s output |
|---|---|---|
| none (`zoompan` only) | 136 | 1.6 s |
| 5120x2880 (4x) | 32 | 11.0 s |
| 10240x5760 (8x) | 8 | 42.5 s |
| 20480x11520 (16x) | 0 | not timed (stopped after it ran over the time limit) |

Start and end edges are correct at every scale: 600 to 588. The wall times are single runs on the sandbox CPU. UI parameters: start zoom, end zoom, duration, anchor, smoothness (fast 1x or smooth 4x; 8x is too slow for a preview).

### 2.4 Auto-zoom on beats (tested, edges within 3 px)

A sum of decaying terms, one per beat time. Six beats at 0.5, 1.2, 2.0, 3.1, 4.0 and 5.2 s, decay 8, amplitude 0.12. Measured edges at 0.5, 0.9, 1.0, 1.5 and 3.0 s were 597, 602, 602, 601 and 601, against expected 595, 600, 600, 600 and 600.

```
zoompan=z='1+0.12*(gte(time,0.5)*exp(-8*(time-0.5))+gte(time,1.2)*exp(-8*(time-1.2))+gte(time,2.0)*exp(-8*(time-2.0))+gte(time,3.1)*exp(-8*(time-3.1))+gte(time,4.0)*exp(-8*(time-4.0))+gte(time,5.2)*exp(-8*(time-5.2)))':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=30
```

Each beat adds about 25 characters, and the same expression in the scale-and-crop form (2.2) was tested up to 1000 terms (8.3). UI parameters: beat times (from a beat detector or manual), amplitude, decay, anchor.

### 2.5 Failed: zoom with `scale` and no `eval=frame`

`scale=w='trunc(1280*(...t...)/2)*2':h=-2` **fails** with exit 234: `Expressions with frame variables 'n', 't', 'pos' are not valid in init eval_mode`. The failure is loud, which is good. Always set `eval=frame` on a time-based scale.

## 3. Music layer

Inputs for the ducking tests: `-i main.mp4 -stream_loop -1 -i music.wav`. The test music is a 220 Hz tone and the voice is a 300 Hz tone in bursts, 0.7 s on and 0.5 s off.

### 3.1 Ducking music under the voice (tested, RMS checked)

Input 0 is the voice and input 1 is the music. `sidechaincompress` compresses its **first** input and takes its key from its **second**, so the music goes first and a copy of the voice goes second (G9).

```
[0:a]anull[vk];[1:a]atrim=0:6,asetpts=PTS-STARTPTS,volume=0.6[mus];[mus][vk]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=300[duck]
```

Map `-map "[duck]"`. Result: RMS of the ducked music is -40.0 dBFS in the voice-on window (0.1 to 0.6 s) and -25.4 dBFS in the window after it (0.8 to 1.1 s, still in the release tail). The unducked reference is -17.9 dBFS. The duck is about 14 dB deep while the voice is on. UI parameters: duck amount (`ratio`), threshold, attack, release, music level.

### 3.2 Mix with loudness target (tested, `ebur128`)

```
[0:a]asplit=2[vox][vk];[1:a]atrim=0:6,asetpts=PTS-STARTPTS,volume=0.6[mus];[mus][vk]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=300[duck];[vox][duck]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[o]
```

Map `-map "[o]"`. Result: integrated loudness -16.1 LUFS against target -16, and sample rate 48000 Hz. Without the final `aresample=48000` the output was **192000 Hz** (G6). `loudnorm` here is in its default single-pass (dynamic) mode. A two-pass linear mode is **unverified**.

UI parameters: target LUFS, true-peak ceiling, loudness range, music level, duck depth.

### 3.3 Trim, loop, fades and start delay (tested, levels checked)

```
[0:a]atrim=start=0.5,asetpts=PTS-STARTPTS,aloop=loop=-1:size=2147483647,atrim=duration=6,afade=t=in:st=0:d=1,afade=t=out:st=5:d=1,adelay=2000:all=1[o]
```

Input: `-i music.wav`. The output is 8.000 s long. Before the 2 s delay the level is -180 dBFS (silent). At 2.05 to 2.2 s the fade-in is at -31 dBFS. At 7.9 to 8.0 s the fade-out is at -38 dBFS. The file starts at 0.5 s into the music, and `aloop` repeats it to fill the 6 s. UI parameters: music start offset, length (trim to video), fade in, fade out, delay, loop on or off.

## 4. Sound-effect one-shots

### 4.1 Twelve events from one decode (tested, onsets and peaks checked)

One `sfx.wav` (a 0.3 s 1 kHz click) is decoded once with `asplit`, each copy is delayed to its event time, and one `amix` joins them. Events at 0, 0.5, 1.0, ... 5.5 s. Peaks in each event window were 0.893 (-1.0 dBFS), and the gap between events was -51.8 dBFS. The output is 5.8 s long.

```
[0:a]asplit=12[s0][s1][s2][s3][s4][s5][s6][s7][s8][s9][s10][s11];[s0]adelay=0:all=1[e0];[s1]adelay=500:all=1[e1];[s2]adelay=1000:all=1[e2];[s3]adelay=1500:all=1[e3];[s4]adelay=2000:all=1[e4];[s5]adelay=2500:all=1[e5];[s6]adelay=3000:all=1[e6];[s7]adelay=3500:all=1[e7];[s8]adelay=4000:all=1[e8];[s9]adelay=4500:all=1[e9];[s10]adelay=5000:all=1[e10];[s11]adelay=5500:all=1[e11];[e0][e1][e2][e3][e4][e5][e6][e7][e8][e9][e10][e11]amix=inputs=12:duration=longest:normalize=0,alimiter=limit=0.95:level=disabled[o]
```

Map `-map "[o]"`. `adelay` takes milliseconds, and `all=1` applies the delay to every channel. UI parameters: per event (time, gain, sound), and a master ceiling.

### 4.2 Normalisation: what each setting does (tested, peaks)

All with 12 events at the same instant, so the worst case:

| Mix settings | Peak |
|---|---|
| `amix=inputs=12:duration=longest` (default `normalize`) | 0.893 (-1.0 dBFS), no clipping, but each input is scaled by 1/12 |
| `amix=...:normalize=0` only | 1.000, clipped (0 dBFS) |
| `amix=...:normalize=0,alimiter=limit=0.95` (level on) | 1.000, the limiter's auto-level pushes it back to 0 dBFS (G5) |
| `amix=...:normalize=0,alimiter=limit=0.95:level=disabled` | 0.950, correct |

Use `normalize=0` with `alimiter` and `level=disabled`. The default `normalize` is safe but makes every effect quieter as more events overlap.

### 4.3 Many inputs (tested, exit 0)

Forty separate `-i sfx.wav` inputs, each delayed by `adelay` and joined with `amix=inputs=40:duration=longest:normalize=0,alimiter=limit=0.95:level=disabled`, exit 0 with a 0.3 s output. Prefer one `asplit` (4.1) to repeated `-i`, because each input is decoded separately.

## 5. Second video layer (B-roll and cutaways)

### 5.1 Picture-in-picture with a timed window (tested, pixel-checked)

Inputs: `-i flatbg10.mp4 -i broll.mp4`. The B-roll is shifted to start at timeline 2 s and shown as a 426x240 window in the bottom-right until 6 s. The corner pixel was grey (31,31,31) at 1 s and 7 s, and red (253,0,0) at 3 s, which is the B-roll.

```
[1:v]setpts=PTS-STARTPTS+2/TB,scale=426:240[pip];[0:v][pip]overlay=x=W-w-32:y=H-h-32:enable='between(t,2,6)'[v]
```

Map `[v]` and `-map 0:a`. UI parameters: start, end, corner, size, margin.

### 5.2 Full-screen cutaway (tested, pixel-checked at 7 s)

Inputs: `-i flatbg10.mp4 -i broll.mp4`, B-roll from 2 s to 6 s, with `eof_action=pass` (5.3).

```
[1:v]setpts=PTS-STARTPTS+2/TB,scale=1280:720,setsar=1[bc];[0:v][bc]overlay=enable='between(t,2,8)':eof_action=pass[v]
```

Map `[v]` and `-map 0:a`, so the main audio is kept. At 7 s the centre pixel is grey (31,31,31), which is the main video, because the B-roll has ended. UI parameters: start, end, cut style (hard or fade via `fade` on the B-roll).

### 5.3 `eof_action`: the default repeats the last B-roll frame (tested, pixel-checked)

Same graph as 5.2 but with the window running to 8 s, past the 6 s end of the B-roll. Default (`eof_action=repeat`): at 7 s the centre pixel is red (253,0,0), the last B-roll frame, frozen for two seconds. With `eof_action=pass`: grey (31,31,31), the main video. This is a silent bug in the default, so always pass `eof_action=pass` (G4).

```
[1:v]setpts=PTS-STARTPTS+2/TB,scale=1280:720,setsar=1[bc];[0:v][bc]overlay=enable='between(t,2,8)'[v]
```

### 5.4 Timeline shift is required (unverified in this run)

The shift `setpts=PTS-STARTPTS+2/TB` is needed so the B-roll starts at 2 s. I expected that without it the window would show the B-roll's own 2 s frame at timeline 2 s. The test did not confirm this, because the B-roll's centre pixel is the same red at 0.1 s and at 2.1 s, so the check cannot tell the two cases apart. Treat it as **unverified**, and keep the shift regardless.

## 6. Speed ramps and freeze frames

### 6.1 Speed ramps: the timestamp unit (tested, frame counts checked)

`setpts` returns a PTS in timebase units, but `T` is in seconds. A `T`-based expression therefore has to be divided by `TB`. Without the division the output keeps almost no frames.

Research form, unchanged (exits 0, **3 frames**, so broken):

```
setpts='if(lt(T,2),T,2+(T-2)*2)'
```

Corrected linear ramp, 1x for 2 s then 0.5x (**180 frames**, last timestamp 9.93 s, which is about the expected 10 s):

```
setpts='(if(lt(T,2),T,2+(T-2)*2))/TB'
```

Map as passthrough: `-fps_mode passthrough`.

Smooth ramp, speed falling from 1x at 2 s to 0.5x at 4 s and held after, with a constant output frame rate (**263 frames**, last timestamp 8.73 s, against the expected 8.77 s from the integral of 1/speed):

```
setpts='(if(lt(T,2),T,if(lt(T,4),2-4*log(1-0.25*(T-2)),4.7726+2*(T-4))))/TB',fps=30
```

The log term is the integral of 1/speed, so output time is continuous. UI parameters: keyframes (time, speed), with the integral computed per segment in the typed layer.

### 6.2 Audio for a ramp (tested, duration checked)

`setpts` does not change audio. A piecewise approximation with six `atempo` segments over the ramp gave 8.648 s, against 8.733 s for the smooth video. The 0.085 s shortfall was not fixed, so treat audio ramps as **approximate**:

```
[0:a]atrim=0:2,asetpts=PTS-STARTPTS[a0];[0:a]atrim=2:2.5,asetpts=PTS-STARTPTS,atempo=0.9375[a1];[0:a]atrim=2.5:3,asetpts=PTS-STARTPTS,atempo=0.8125[a2];[0:a]atrim=3:3.5,asetpts=PTS-STARTPTS,atempo=0.6875[a3];[0:a]atrim=3.5:4,asetpts=PTS-STARTPTS,atempo=0.5625[a4];[0:a]atrim=4:6,asetpts=PTS-STARTPTS,atempo=0.5[a5];[a0][a1][a2][a3][a4][a5]concat=n=6:v=0:a=1[o]
```

`atempo` accepts 0.5 to 100 (research 6.1), so the slowest segment is 0.5.

### 6.3 Freeze a frame for 2 s (tested, identical frames checked)

Inputs: `-i main.mp4`. Freezes the frame at 1 s for 2 s, with a silent gap in the audio. The output is 8.000 s, and frames at 1.5 s and 2.5 s are identical (mean absolute difference 0.0). A frame at 0.2 s differs from the frozen one (mean difference 3.5). Video and audio are both 8.000 s.

```
[0:v]trim=0:1,setpts=PTS-STARTPTS[p];[0:v]trim=start=1:end=1.0334,setpts=PTS-STARTPTS,loop=loop=59:size=1:start=0,setpts=N/FRAME_RATE/TB[f];[0:v]trim=start=1.0334,setpts=PTS-STARTPTS[q];[p][f][q]concat=n=3:v=1:a=0[v];[0:a]atrim=0:1,asetpts=PTS-STARTPTS[pa];aevalsrc=0:s=48000:d=2[fa];[0:a]atrim=1:6,asetpts=PTS-STARTPTS[qa];[pa][fa][qa]concat=n=3:v=0:a=1[a]
```

Map `-map "[v]" -map "[a]"`. The freeze length is `loop` count + 1 frames at the source frame rate. UI parameters: freeze time, hold length, optional sound effect (4.1) at the freeze.

## 7. Text animation

All text uses `expansion=none` with `textfile=`, as `overlay-filters.ts` already does. `<font>` is the path to `Inter-Bold.otf`. The base is `-i flatbg10.mp4` (flat grey) so text is easy to see.

### 7.1 Word-by-word reveal (tested, visual check)

Four text files hold the cumulative phrases "Build", "Build your", "Build your first" and "Build your first video", with one `drawtext` per phrase, each live only in its own window. The montage at 1.5, 2.0, 2.5 and 4.0 s shows the progression as intended.

```
drawtext=fontfile=<font>:expansion=none:fontsize=72:x=100:y=300:textfile=txt/w1.txt:fontcolor=white:enable='between(t,1,2.5)',drawtext=fontfile=<font>:expansion=none:fontsize=72:x=100:y=300:textfile=txt/w2.txt:fontcolor=white:enable='between(t,1.5,2.5)',drawtext=fontfile=<font>:expansion=none:fontsize=72:x=100:y=300:textfile=txt/w3.txt:fontcolor=white:enable='between(t,2,2.5)',drawtext=fontfile=<font>:expansion=none:fontsize=72:x=100:y=300:textfile=txt/w4.txt:fontcolor=white:enable='gte(t,2.5)'
```

UI parameters: word timing (from the caption word timings already in the project), size, position.

### 7.2 Highlight bar behind text (tested, visual check)

Input 1 is `-f lavfi -i "color=c=0xffd400:s=2x84:r=30"`. The bar grows from 0 to 560 px over 0.4 s from 1 s, and the black text is drawn on top of it. Width is a fixed estimate; `fitText` in `overlay-filters.ts` can supply it. The montage showed the bar growing with the text.

```
[1:v]format=rgba,scale=w='max(2,560*min(1,max(0,(t-1)/0.4)))':h=84:eval=frame[bar];[0:v][bar]overlay=x=100:y=300:enable='gte(t,1)':shortest=1[b];[b]drawtext=fontfile=<font>:expansion=none:fontsize=72:x=100:y=300:textfile=txt/w4.txt:fontcolor=black:enable='gte(t,1)'[v]
```

A bar that is exactly the text width needs a measured width, which FFmpeg cannot give (unverified). UI parameters: colour, padding, grow time, width estimate.

### 7.3 Bounce (tested, exit 0; visual check rough)

The text drops and rebounds with a decaying `abs(sin)`. Frames at 1.2, 1.5 and 3.0 s show it at the expected vertical positions, but this was checked by eye, not by pixel.

```
drawtext=fontfile=<font>:expansion=none:fontsize=72:x=100:y='460-360*abs(sin(3.14159*(t-1)*1.5))*exp(-2.5*(t-1))':textfile=txt/w4.txt:fontcolor=white:enable='gte(t,1)'
```

UI parameters: height, bounces, decay, start.

### 7.4 Shake (tested, exit 0; not visually checked)

```
drawtext=fontfile=<font>:expansion=none:fontsize=72:x='(w-text_w)/2+16*sin(2*PI*30*(t-1))*exp(-5*(t-1))':y=300:textfile=txt/w4.txt:fontcolor=white:enable='gte(t,1)'
```

UI parameters: amplitude, frequency, decay, start.

### 7.5 Glitch (tested, visual check)

Red and cyan copies of the text get a random horizontal offset in short flicker frames (`random(0)` inside `drawtext` changes each frame). The white text is drawn on top, and `rgbashift` distorts the whole frame in two short windows. The montage showed the red and cyan offset copies and the RGB shift frames.

```
drawtext=fontfile=<font>:expansion=none:fontsize=72:fontcolor=red@0.8:x='(w-text_w)/2+if(lt(mod(floor(t*24),7),1),(random(0)-0.5)*40,0)':y=300:textfile=txt/w4.txt:enable='between(t,1,4)',drawtext=fontfile=<font>:expansion=none:fontsize=72:fontcolor=cyan@0.8:x='(w-text_w)/2+if(lt(mod(floor(t*24),5),1),(random(0)-0.5)*40,0)':y=300:textfile=txt/w4.txt:enable='between(t,1,4)',drawtext=fontfile=<font>:expansion=none:fontsize=72:fontcolor=white:x=(w-text_w)/2:y=300:textfile=txt/w4.txt:enable='between(t,1,4)',rgbashift=rh=-8:bh=8:enable='between(t,2.0,2.1)+between(t,3.3,3.4)'
```

UI parameters: intensity, flicker rate, window times.

## 8. Keeping graphs manageable

### 8.1 `-filter_complex_script` and inline (tested, same exit, timing)

Forty `drawtext` overlays on a 10 s, 1280x720 flat clip:

| Run | Wall time (single run) |
|---|---|
| no filters (`-f null -`) | 355 ms |
| 40 overlays inline (`-vf`) | 880 ms |
| 40 overlays with `-filter_complex_script overlays40.txt` | 780 ms |

Both forms exit 0. Each overlay costs roughly 10 ms per 10 s of 720p output in this test. Use `-filter_complex_script <file>` so the graph is not on the command line. The graph text uses the same syntax as `-filter_complex`, with `[0:v]` and `[v]` labels. Command-line length is an issue on Windows (see 8.5).

### 8.2 Long expressions (tested, up to 1000 terms)

The beat expression in the scale-and-crop form (2.2) with 200 beats (5,610 characters) and with 1000 beats (28,811 characters) both exited 0. FFmpeg's expression parser did not reject them. Beyond 1000 terms was not tested. For beat zoom at a typical size (tens of beats per minute), a 60-second clip needs 60 to 120 terms, which is well inside the tested range.

### 8.3 Input counts (tested, exit 0)

Forty `-i sfx.wav` inputs with `amix` (4.3) exited 0. Repeated `-i` decodes the file each time, so prefer `split` or `asplit` on one input for many uses of the same asset.

### 8.4 Performance summary

- 40 overlays add about 10 ms per 10 s of 720p output (8.1).
- Ken Burns at 1280x720 for 6 s: 1.6 s without pre-scale, 11.0 s with 4x, 42.5 s with 8x (2.3).
- Pre-scale cost grows with area, so 8x is an offline quality setting, not a preview setting.
- 4K, GPU and multi-core timings were not measured (unverified).

### 8.5 Command-line length

On Windows the command line has a limit of about 32,767 characters (**unverified** here; this sandbox runs Linux). `-filter_complex_script` avoids the limit by moving the graph into a file, so the renderer should always use it for large graphs.

## Failed recipes (summary)

| Recipe | Result | Section |
|---|---|---|
| `drawbox` with `w` depending on `t` | exit 0, static width (wrong) | 1.8 |
| `drawbox` with `t` (thickness) depending on `t` | exit 234 | 1.8 |
| `scale` with `t` and no `eval=frame` | exit 234 | 2.5 |
| `scale` plus `crop` with `(in_w-1280)/2` after a per-frame zoom | exit 0, offset zero (wrong) | G2 |
| Speed ramp `setpts='if(lt(T,2),T,2+(T-2)*2)'` (research form) | exit 0, 3 frames (wrong) | 6.1 |
| `overlay` without `eof_action=pass` past the clip end | exit 0, last frame frozen (wrong) | 5.3 |

## Gotchas

Measured here (each has a fix that was tested):

- **G1. `drawbox` geometry is fixed at start.** Width, height, position and thickness are read once, and `t` is undefined in them. Use a scaled colour source (1.5, 1.6) for anything that changes.
- **G2. A `crop` offset from `iw` or `in_w` is stale after a per-frame `scale`.** The filter reads its configured input size, so after `scale eval=frame` changes the frame size, the centring offset stays at zero. The zoomed box edge sits at 600z instead of 640-40z. Fix: compute the offset from the zoom expression (2.2). `crop` `x` and `y` do vary per frame when they use `t` or `n` (checked: the box moved 100 px per second with `x='t*100'`).
- **G3. `scale` with a frame variable needs `eval=frame`.** Without it the filter fails at start-up with exit 234.
- **G4. `overlay` repeats the last frame of a finished input by default.** `eof_action=repeat` freezes the B-roll past its end. Use `eof_action=pass` (5.3).
- **G5. `alimiter` raises the level back to 0 dBFS by default.** Set `level=disabled` (4.2).
- **G6. `loudnorm` outputs 192 kHz.** Add `aresample=48000` after it (3.2).
- **G7. `setpts` with `T` needs `/TB`.** Without it the research's speed-ramp recipe keeps 3 frames and exits 0 (6.1). The same mistake looked like an `fps` failure: `setpts` plus `fps=30` produced an empty output until `/TB` was added.
- **G8. `zoompan` with `x` or `y` set looks jittery.** A pre-scale reduced direction changes from 136 to 32 at 4x and 8 at 8x (2.3). Accept the cost for offline export, and use `zoompan` with `d=1` for keyframe zoom in preview.
- **G9. `sidechaincompress` order.** The first input is compressed and the second is the key. Put music first and the voice copy second (3.1). The other order was not tested here.

Real-world reports (closest matches found; no Stack Overflow or Reddit thread matched these queries):

- **R1. `loudnorm` 192 kHz.** A developer reply on ffmpeg-devel says the output is upsampled to 192 kHz in some cases and recommends `aresample=48000` after it. That fix was confirmed here (3.2). The reply describes the condition as input loudness range above the target range, but the test used target LRA 11 and still got 192 kHz, so the trigger is not fully understood.
- **R2. `zoompan` shake.** An FFmpeg trac comment reports the same shake with `x` or `y` set, and describes upscaling 2x before `zoompan` as a partial fix that is much slower. Measured here: 4x reduced jitter to 32 changes, and 8x to 8 (2.3).
- **R3. `overlay` `eof_action`.** A 2020 patch proposed changing the default from `repeat` to `pass`. The reply rejected it, because existing scripts depend on `repeat`. So `eof_action=pass` must be set explicitly (5.3).
- **R4. `amix` normalisation.** An FFmpeg trac ticket (#8033) covers mixing without volume renormalisation. The `normalize` option is on by default, and `normalize=0` disables the scaling. The result is clipping unless a limiter follows (4.2).
- **R5. Freezes and speed ramps with `N` and `PTS`.** An ffmpeg-user thread from 2018 advises against mixing `N` and `PTS` in one `setpts` expression, and suggests scaling the inter-frame interval instead. The `/TB` fix in 6.1 keeps the expression time-based.

## Sources

Fetched with WebFetch and read for this note:

- https://ffmpeg.org/pipermail/ffmpeg-devel/2018-August/233445.html (loudnorm 192 kHz and the `aresample` fix, R1).
- https://ffmpeg.org/pipermail/ffmpeg-trac/2025-March/072904.html (zoompan shake and the 2x upscale workaround, R2).
- https://www.ffmpeg.org/pipermail/ffmpeg-devel/2020-March/258596.html (overlay `eof_action` default, R3).
- https://ffmpeg.org/ffmpeg-filters.html (fetched, but the page is over 500,000 characters and the reader stopped before the filter sections. No facts were taken from it; the behaviour was checked by test instead).

Seen in web search results only (not fetched; cited for pointers, not facts):

- https://trac.ffmpeg.org/ticket/6570 (loudnorm changes the sample rate).
- https://trac.ffmpeg.org/ticket/9352 (double resampling with loudnorm can overclip).
- https://ffmpeg.org/pipermail/ffmpeg-trac/2021-May/058498.html (amix `normalize`, R4).
- https://ffmpeg.org/pipermail/ffmpeg-user/2018-July/040632.html (freeze frames and mixing `N` with `PTS`, R5).
- https://trac.ffmpeg.org/wiki/How%20to%20speed%20up%20/%20slow%20down%20a%20video (speed changes and dropped frames).
- https://lists.ffmpeg.org/archives/list/ffmpeg-user@ffmpeg.org/thread/CJH2SEPGGFUCQ3YS4VXB7CKJS5OZAPCN/ (a `sidechaincompress` thread that reports a problem with the input order. Cause not confirmed. See G9).

Local checks: the FFmpeg 6.1.1 build's `ffmpeg -filters` list (for the filter flags used here) and the repository files named in the lead.
