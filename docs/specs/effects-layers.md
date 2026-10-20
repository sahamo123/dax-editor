---
type: Spec
title: Effects layers (zoom, music with ducking, image overlays)
description: "How the engine zooms the picture, mixes music and sound effects under speech with automatic ducking, and draws logos and stickers, and how templates use them."
tags: [spec, engine, zoom, audio, ducking, overlays, templates]
status: stable
generated:
  by: process:implementer
  at: 2026-10-18T21:00:00Z
---

# Effects layers

Built in `packages/core`: three layers on top of the main track, all reachable only through the command registry, all undoable, and all rendered by the one FFmpeg command in `render.ts`. Recipes and the measurements behind them: [FFmpeg animation recipes](/research/ffmpeg-animation-recipes.md).

## Problem

Creator styles rely on punch-in zooms, a music bed that gets out of the way of speech, and a logo or sticker. Before this, templates listed these as "not available yet" and the engine could not do them.

## Goals and non-goals

- Goal: zoom (hard punch-in and slow push-in, with easing and a focus point), a music and sound-effect track with ducking, and image overlays (PNG or JPG).
- Goal: templates apply these steps instead of skipping them, honestly: a step that needs a file the user has not given is reported as skipped with the instruction.
- Non-goal: automatic focus detection (where to zoom), cursor-driven zoom, beat matching, automatic sound-effect placement, generated cards. These stay in a template's `deferred` list.
- Non-goal: SVG images, animated images, a second video layer (B-roll).

## Commands

| Command | What it does |
|---|---|
| `add_zoom`, `update_zoom`, `remove_zoom` | Zoom ranges in timeline seconds. `style` `punch-in` holds `scale`; `push-in` glides from 1 to `scale`. `ease`, focus point `x` and `y`. Adding the same range again updates it. |
| `add_audio`, `update_audio`, `remove_audio` | Music or sound effects from a file path or an asset id, placed in timeline seconds with volume, fades, `loop`, `length`, `sourceStart`. Adding the same file at the same start updates it. |
| `set_ducking` | On or off, depth in dB (`amountDb`, default 12), recovery time (`releaseSeconds`, default 0.4). |
| `add_image_overlay`, `update_image_overlay`, `remove_image_overlay` | A picture with a preset (`logo-corner`, `watermark`, `sticker-pop`, `logo-end-card`, `bug-slide`), position, width as a fraction of the frame, opacity, animation (none, fade, slide-up, slide-left, pop), start and duration. |
| `apply_template` | Gained two arguments: `music` and `logo` (a file path, or the id of an asset already imported). |

All `add_*` commands are safe to repeat: when the result would equal the current project nothing is added and no history entry is made.

## Design

- **Data** (`schema.ts`): `timeline.zooms`, `timeline.images`, `timeline.ducking` (all optional, so older project files load unchanged) and an audio track `a1` (`kind: "audio"`) whose clips use `Clip` with three audio-only fields: `role` (`music` or `sfx`), `loop` and `length` (timeline seconds). The audio track is free-form: clips may overlap and leave gaps, unlike the gapless main track.
- **Render order** (`buildRenderPlan`): join the clips, then zoom the picture, then draw images, then text overlays and captions. So a logo and a title never zoom with the footage. Audio: the audio track is mixed under the joined main audio.
- **Zoom.** Each zoom is cut out of a copy of the joined picture, scaled with `scale eval=frame` and cropped, and laid back over the untouched picture with `overlay eof_action=pass`. The crop offset is computed from the same zoom expression as the scale (not from `in_w`, which goes stale after a per-frame scale). Holds use plain constants. Only a zoom's own frames are scaled.
- **Audio mix.** Each audio clip is trimmed to its slice, resampled to 48 kHz stereo, looped if it is longer than its slice, trimmed to its length (and to the end of the video), set to its volume, faded and delayed to its start. Music clips go into one bus that `sidechaincompress` lowers; sound effects bypass it. The main audio, the ducked music and the effects meet in one `amix` (`duration=first`, `normalize=0`), followed by `alimiter` at 0.89 (about -1 dBFS, `level=disabled`) so the result cannot clip.
- **Ducking key.** The compressor is keyed by a copy of the main audio that is gated, amplified by 40 dB and limited to a constant level. That makes the ducking depth depend only on `amountDb`, not on how loud the speaker is. Measured: within 1 dB between a loud and a quiet speaker, at both 12 dB and 20 dB depth. Plain `sidechaincompress` on the raw voice did not duck a quiet speaker at all.
- **Images.** Each picture is its own looped input. Its frames are shifted to the start time, scaled to a fraction of the frame width, given the opacity, faded in and out, and overlaid with `eof_action=pass`. Animations reuse the text overlay curves and timing.
- **Ripple deletes** (`deleteRange`, so also `keep_only`, `remove_silences`, cut plans). Zooms and images move with the footage like text overlays: later ones slide earlier, ones crossing the cut are shortened, ones inside it disappear. **Music is anchored to the timeline, not to footage**: a ripple delete never cuts into it (many small cuts would chop a song into pieces). Music that starts after the range moves earlier, music that starts inside it moves to the cut, music that spans it is untouched. If music then runs past the end of the shorter video, the renderer ends it there with its fade-out. **Sound effects belong to a moment**: one that starts inside the deleted range is removed, one after it moves earlier, one before it is untouched.
- **Templates.** A template file has a new `effects` list next to `overlays` and `deferred`. Three kinds: `zoom` (`alternate-cuts`: a tighter frame on every n-th shot; `push-in`: a slow push over each long shot), `music` (a bed with `level` and optional `intro` scope) and `logo` (an image preset anchored to the start or end). A **shot** is a run of clips with no cut between them (`shotRanges`). Effects are applied after the overlays on the scratch session, so the whole template is still one undo step, and are replaced (never stacked) when a template is applied again. Templates never ship music or logos: the caller supplies a file, or music already on the timeline gets the template's ducking. Steps that remain deferred use the features `sound-effects`, `broll`, `focus-detection`, `cursor-zoom`, `graphic-cards`, `beat-matching`, `speed-change`, `captions`, `transitions`, `color-grade`, `reframe` and `waveform`.

## Edge cases and failure modes

- A zoom or image that starts after the end of the video is refused by the command; at render time anything past the end is clipped.
- Zooms never overlap (the command says which zoom is in the way). A template leaves out a zoom that would overlap one the user made by hand, and says so.
- Music longer than the video is trimmed at the video end with its fade-out there. Music shorter than the video ends (use `loop`).
- A silent video, a picture or a missing file cannot go on the audio track; the error names the file and what is needed. Paths outside the allowed folders are refused.
- A video with no audio stream has silent main audio; the music then plays at its own level (nothing to duck).

## Security and privacy

File paths go through the same allowed-folder check as `import_media`. No user text enters a filter string (image and audio clips are referenced by input index; there is no text in the new filters). No network.

## Verification

Real FFmpeg tests measure the result: box edges for zoom factor and anchor (`zoom-render.test.ts`), band-limited RMS for duck depth, recovery, loop, fades, timing and peak level (`audio-render.test.ts`), colour and bounds for images (`image-render.test.ts`), plus command and template tests. Tested on FFmpeg 6.1.1; the graph uses only filters and options that exist from FFmpeg 4.4 (`amix normalize`), and FFmpeg 7 has not been run.

## Open questions

- Zoom smoothness: sizes are whole pixels, so a very slow push (a few percent over many seconds) moves in 1 to 2 pixel steps. A supersampled path would be smoother and slower.
- Cost: 15 punch-ins on a 30 s 1080p render added about a third to the render time on the test machine. A segment-and-concat graph would be cheaper for very many zooms.
- Loudness targets (LUFS) are not applied: the mix is limited, not normalised. `loudnorm` upsamples to 192 kHz and needs two passes to be exact.
