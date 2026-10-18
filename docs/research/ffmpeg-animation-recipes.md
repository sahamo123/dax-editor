---
type: Research
title: FFmpeg animation recipes
description: Tested FFmpeg filter recipes for overlays, zoom, music and sound-effect mixing, B-roll layers, speed ramps and text animation that the renderer does not have yet, with the gotchas found while testing them.
tags: [research, ffmpeg, animation, overlays, audio, zoom, rendering]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T19:47:06Z
---

# Research: FFmpeg animation recipes

Scope: the Premiere-style highlight and motion effects that `packages/core/src/render.ts` cannot produce today. It has per-clip `trim`, `scale`, `pad` or `boxblur` fit modes, `fade`/`afade` on clips, `concat`, `drawtext` overlays (`overlay-filters.ts`: fade, slide-up, slide-left, pop, typewriter, lower-third), and `subtitles` captions (`captions.ts`). It has no image or shape overlay, no second video layer, no music or sound-effect bus, and no per-clip zoom. The existing research in `oss-effects-and-transitions.md` covers `xfade`, colour, punch-in on a beat, callouts, freeze, speed ramp (step), and PIP. Those are not repeated here except where a new variant is needed.

Test conventions. **Tested** means the command exited 0 on the local FFmpeg 6.1.1 build and the stated property was checked (by pixel, by RMS or peak, by `ebur128`, or by `ffprobe` duration). Sources were synthetic `lavfi` inputs (`testsrc2`, `gradients`, `aevalsrc`, `color` with flat grey, and PNGs made with `geq`), written to a scratch directory outside the repo. **Failed** means the command did not exit 0; the error is quoted. **Unverified** means it was not run.

## Recommendation: graph shape

1. **Keep the primary track as it is.** Per-clip video and audio chains, then `concat`, give `[v_main]` and `[a_main]`. Nothing downstream changes the primary timing.
2. **Second video layer, applied after the join.** Each B-roll insert is prepared as its own chain. It is shifted to timeline time with `setpts=PTS-STARTPTS+T/TB`, fitted with `scale`, and faded if needed. It is then applied with `overlay` and `enable='between(t,s,e)'`, with `eof_action=pass` (required, see gotcha G3). A full-screen cutaway is the same overlay at 0,0 on a full-size input. The B-roll audio is dropped, so the main audio stays untouched.
3. **Motion overlays (images, logos, arrows) after the video layers.** Each PNG is `loop`-ed or `-loop 1` with `-t`, converted with `format=rgba`, and animated with `fade`, `scale` (`eval=frame`) or an `overlay` expression on `x`/`y`. Shapes that grow (underline, progress bar) use a solid-colour source with `scale eval=frame`, not `drawbox` (gotcha G1).
4. **Text and captions last,** as now, in timeline time.
5. **Audio as separate buses that meet in one `amix`.** The voice bus is `[a_main]`. The music bus is `aloop`/`atrim`, `afade`, `volume`, and is ducked by `sidechaincompress` keyed on the voice (its sidechain input is a copy of the voice). The SFX bus is one decoded file split with `asplit` into one branch per event, each delayed with `adelay`. One `amix` (`normalize=0`) combines voice, ducked music and SFX. An `alimiter` with `level=disabled` follows it, and `loudnorm` runs last, with `aresample=48000` after it (gotcha G5).
6. **Keep the graph manageable.** Use `-filter_complex_script` once a graph has more than a few dozen nodes, reuse one input through `split`/`asplit` instead of repeating `-i`, and generate expressions from typed parameters (section 8).

## 1. Overlays and shapes

### 1.1 Image overlay with fade in and out (tested, visual check)

Logo fades in at 1 s, out from 3.5 s, shown between 1 s and 4 s. Frames at 0.5 s (absent), 1.3 s (partly visible) and 2.5 s (full) were checked by eye. At 3.67 s the logo is about two-thirds opaque.

```
[1:v]format=rgba,fade=t=in:st=1:d=0.5:alpha=1,fade=t=out:st=3.5:d=0.5:alpha=1[lg];[0:v][lg]overlay=x=W-w-40:y=40:enable='between(t,1,4)'[v]
```

Inputs: `-i main.mp4 -loop 1 -i logo.png -t 6`. Without `-t`, a looped still runs forever.

UI parameters: asset, anchor (corner or centre), margin, start, end, fade-in, fade-out.

### 1.2 Slide in with ease-out (tested, visual check)

The arrow moves from off-frame left to x=60 over 0.5 s, starting at 1 s, with a cubic ease-out.

```
[1:v]format=rgba[ar];[0:v][ar]overlay=x='-w+(60+w)*(1-pow(1-min(1,max(0,(t-1)/0.5)),3))':y=300:enable='gte(t,1)'[v]
```

Frame checks: at 1.1 s the arrow is just entering; at 1.33 s it is near its final x; at 3 s it is at x=60. UI parameters: direction (left, right, up, down), distance, duration, easing (linear or cubic).

### 1.3 Pop (scale with `eval=frame`) (tested, visual check)

The logo grows from 40% to 100% over 0.25 s after 1 s. It is centred on the frame.

```
[1:v]format=rgba,scale=w='256*(0.4+0.6*min(1,max(0,(t-1)/0.25)))':h=-2:eval=frame[lg];[0:v][lg]overlay=x=(W-w)/2:y=(H-h)/2:enable='between(t,1,4)'[v]
```

Frame checks: at 1.1 s the logo is small and centred, at 1.5 s it is full size, and at 4.0 s it is gone (the window is half-open). UI parameters: start, grow time, start scale.

### 1.4 Alpha scaling (tested, exit 0)

Fixed 50% opacity on the logo. `colorchannelmixer` does not take expressions, so this is static. A time-varying opacity uses `fade` with `alpha=1`, as in 1.1.

```
[1:v]format=rgba,colorchannelmixer=aa=0.5[lg];[0:v][lg]overlay=x=40:y=40:shortest=1[v]
```

### 1.5 Growing underline (tested, pixel-checked)

Width is measured on a flat grey background, the fraction of yellow pixels in the underline row. Expected and measured fractions match: 0.333 at 1.2 s, 0.555 at 1.33 s, 0.833 at 1.5 s, 1.000 from 2.0 s.

```
[1:v]format=rgba,scale=w='max(2,640*min(1,max(0,(t-1)/0.6)))':h=10:eval=frame[ul];[0:v][ul]overlay=x=120:y=560:enable='gte(t,1)':shortest=1[v]
```

Input 1 is `-f lavfi -i "color=c=0xffd400:s=640x10:r=30"`. The `shortest=1` matters because the colour source is infinite. UI parameters: x, y, length, start, duration, colour, thickness.

### 1.6 Progress bar (tested, pixel-checked)

The bottom bar's width is the fraction of the timeline that has played, measured as 0.139, 0.500 and 0.833 at 0.83 s, 3 s and 5 s. Both forms below pass that check on a flat background.

Form A, a colour source scaled per frame:

```
[1:v]format=rgba,scale=w='max(2,1280*t/6)':h=12:eval=frame[bar];[0:v][bar]overlay=x=0:y=H-h:shortest=1[v]
```

Form B, per-pixel `geq` on the timeline variable `T`:

```
format=gbrp,geq=r='if(gte(Y,H-12)*lt(X,W*T/6),255,r(X,Y))':g='if(gte(Y,H-12)*lt(X,W*T/6),51,g(X,Y))':b='if(gte(Y,H-12)*lt(X,W*T/6),102,b(X,Y))',format=yuv420p
```

Form A is cheaper (one overlay, no per-pixel expression). Form B needs no second input. UI parameters: colour, height, position (top or bottom), total duration (taken from the timeline), start.

### 1.7 Arrow and box callouts

A box callout is already in the baseline (`drawbox` with `enable`, research 3.1). An arrow is an RGBA PNG with its own alpha, generated here with `geq` and animated with 1.2 or 1.3. The arrow PNG used in these tests was `min(255,255*(lt(abs(Y-128),10)*lt(X,160)+gt(X,150)*lt(X,230)*lt(abs(Y-128),(230-X)*0.9)))` in the alpha channel. A shipped app would bundle arrow PNGs (licence checked when added) and not generate them at render time.

### 1.8 Failed: animated `drawbox` size or thickness

- `drawbox` with `w='min(640,640*max(0,(t-1)/0.6))'` runs with exit 0, but the width is fixed at its initial value. At t=0.83 s, 3 s and 5 s the bottom bar measured 1.000 of the row (tested). Use 1.5 or 1.6.
- `drawbox` with `t='if(lt(t,2),0,max(2,8*exp(-4*(t-2))+4))'` fails with `Error when evaluating the expression 'if(lt(t,2),0,max(2,8*exp(-4*(t-2))+4))'. Failed to configure input pad on Parsed_drawbox_0`. The thickness is read once.

The documentation lists `x`, `y`, `w`, `h` as expressions, but in 6.1 they are evaluated once, with `t` undefined. This is the gotcha G1.

## 2. Zoom

### 2.1 Punch-in with keyframes (pending; see section 2 notes)

Section 2 is filled in after the zoom tests are run.

## 3. Music layer

### 3.1 Ducking under the voice (tested, RMS checked)

The music is 220 Hz and the voice is 300 Hz in bursts (0.7 s on, 0.5 s off). The sidechain is a copy of the voice. The ducked music is measured in a voice-on window (0.1 to 0.6 s) and a window just after it (0.8 to 1.1 s, still inside the release tail).

```
[0:a]anull[vk];[1:a]atrim=0:6,asetpts=PTS-STARTPTS,volume=0.6[mus];[mus][vk]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=300[duck]
```

Inputs: `-i main.mp4 -stream_loop -1 -i music.wav`. Result: RMS -40.0 dBFS while the voice is on, and -25.4 dBFS in the window after it. An undamped reference was -17.9 dBFS in both windows. The duck is about 14 dB deep while the voice is on. The sidechain takes its input from the voice, so the voice itself is untouched.

UI parameters: duck amount (`ratio`), threshold, attack, release, music level.

### 3.2 Full mix, loudness target (tested, `ebur128`)

```
[0:a]asplit=2[vox][vk];[1:a]atrim=0:6,asetpts=PTS-STARTPTS,volume=0.6[mus];[mus][vk]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=300[duck];[vox][duck]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[o]
```

Result: integrated loudness -16.1 LUFS (`ebur128`), target -16. Output sample rate is **192000 Hz** (`ffprobe`), which is gotcha G5. Add `aresample=48000` after `loudnorm` (tested, 48000 Hz output).

`loudnorm` in its default single-pass mode is dynamic. A linear, two-pass version needs the measured values of a first pass and is not covered here (unverified).

UI parameters: target loudness (LUFS), true peak, loudness range, music level, duck depth.

### 3.3 Music start offset, trim and fades

Pending.

## 4. Sound-effect one-shots

### 4.1 Many events from one decode (tested)

Twelve events from one file: `asplit` once, `adelay` per branch, `amix` at the end. The graph below is the 12-simultaneous-event check, which is the worst case for clipping.

```
[0:a]asplit=12[s0][s1][s2][s3][s4][s5][s6][s7][s8][s9][s10][s11];[s0][s1][s2][s3][s4][s5][s6][s7][s8][s9][s10][s11]amix=inputs=12:duration=longest:normalize=0,alimiter=limit=0.95:attack=5:release=50:level=disabled[o]
```

Measured peak 0.9500 (-0.4 dBFS), against 1.0000 with `level` left on (gotcha G4) and 1.0000 with `normalize=0` and no limiter (gotcha G4). Each `adelay` branch (not in this check) takes milliseconds, for example `adelay=1500:all=1`.

Pending: the per-event `adelay` timing test with 12 spaced events.

## 5. Second video layer (B-roll and cutaways)

### 5.1 Picture-in-picture with a timed window (tested, pixel-checked)

B-roll starts at 2 s on the timeline and shows as a 426x240 window in the bottom-right corner until 6 s. The corner pixel was grey (31,31,31) at 1 s and 7 s, and the B-roll red (253,0,0) at 3 s.

```
[1:v]setpts=PTS-STARTPTS+2/TB,scale=426:240[pip];[0:v][pip]overlay=x=W-w-32:y=H-h-32:enable='between(t,2,6)'[v]
```

Map `[v]` with `-map 0:a` so the main audio is kept. UI parameters: start, end, corner, size, margin.

### 5.2 Full-screen cutaway (tested, exit 0)

```
[1:v]setpts=PTS-STARTPTS+2/TB,scale=1280:720,setsar=1[bc];[0:v][bc]overlay=enable='between(t,2,4)'[v]
```

Map `-map 0:a` for the main audio. This shows the same timing as 5.1 but at full size. Add `eof_action=pass` when the window can run past the B-roll's end (5.3).

### 5.3 Overlay runs past the B-roll: `eof_action` (tested, pixel-checked)

If `enable` runs past the end of the B-roll, `overlay` defaults to `eof_action=repeat`, so the last B-roll frame stays on screen. Measured at 7 s with a 10 s grey background and a B-roll that ends at 6 s: the centre pixel was red (253,0,0), the last B-roll frame, with the default. With `eof_action=pass` it was grey (31,31,31), the main video.

```
[1:v]setpts=PTS-STARTPTS+2/TB,scale=1280:720,setsar=1[bc];[0:v][bc]overlay=enable='between(t,2,8)':eof_action=pass[v]
```

Use `eof_action=pass` always. It is gotcha G3.

## 6. Speed ramps and freeze frames

Pending. The step speed ramp, the audio `atempo` pair, and the `loop` freeze in `oss-effects-and-transitions.md` section 3.2 are tested. This section adds a smooth ramp and a freeze at an arbitrary frame.

## 7. Text animation presets

Pending.

## 8. Keeping filter graphs manageable

Pending.

## Gotchas

- **G1. `drawbox` geometry is not animated.** `x`, `y`, `w`, `h` and `t` are read once, so `t` is undefined in them. The result is a static shape with exit 0 and no warning (tested; section 1.8). Use 1.5 or 1.6 for anything that changes over time.
- **G2. `enable` only gates, it does not restart.** An overlay with `enable='between(t,2,6)'` shows the B-roll's own timeline. Without `setpts=PTS-STARTPTS+2/TB` the B-roll starts at its first frame at t=0, and the window would show its middle. Always shift the B-roll to timeline time first (tested in 5.1).
- **G3. `overlay` repeats the last frame of a finished input.** `eof_action=repeat` is the default, so a B-roll window that outlasts its clip freezes on its last frame. Set `eof_action=pass` (tested; 5.3).
- **G4. `alimiter` auto-levels by default.** With `level` on, the limiter raises the output back to 0 dBFS, so a mix that was limited to 0.95 peaks at 1.0 again. Set `level=disabled` (tested; section 4.1). `amix` with `normalize=0` and no limiter clips at 1.0 (tested).
- **G5. `loudnorm` outputs 192 kHz.** The single-pass filter upsamples internally and the output keeps that rate. `ffprobe` showed 192000 Hz, and `aresample=48000` after it restores 48000 Hz (tested; section 3.2).

## Sources

Fetched or read during this research:

- `/home/user/dax-editor/packages/core/src/overlay-filters.ts`, `captions.ts`, `render.ts` (read in the repository).
- `/home/user/dax-editor/docs/research/oss-effects-and-transitions.md` (read; not repeated).
- FFmpeg 6.1.1 `-h filter=drawbox`, `-h filter=scale`, `-h filter=geq` (local `ffmpeg -h` output).

Web sources (Stack Overflow, Reddit, GitHub issues) are added in section "Gotchas", pending.
