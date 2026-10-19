# packages/core

The video engine. No UI, no network, no LLM. Everything else (CLI, MCP, desktop, evals) builds on this.
Root rules in `/AGENTS.md` apply; this file adds package specifics.

## Module map

| File | Responsibility |
|---|---|
| `schema.ts` | zod schemas and types: `Asset`, `Clip` (audio clips add `role`, `loop`, `length`), `Track`, `Timeline` (with optional `zooms`, `images`, `ducking`), `Project`, `Range`, `Overlay`, `Zoom`, `ImageOverlay`, `Ducking`, caption settings, output format. |
| `timeline.ts` | **Pure** edit operations (`splitAt`, `deleteRange`, `keepRanges`, `trimClip`, fades, ...). Take a `Project`, return a new one. `deleteRange` also moves overlays, images, zooms and the audio layer; `trimClip` and `moveClip` remap them. `shotRanges` finds runs of clips with no cut between them. |
| `commands.ts` | **The command registry.** `COMMANDS` is the only way a project changes. The UI, built-in AI, MCP and CLI all call it. Each command has typed arguments, a model-facing description, `readOnly` and `irreversible` flags. `commandTools()` gives JSON-schema tool specs. 45 commands today: 33 here, 10 effects (`effect-commands.ts`) and 2 template commands (`template-commands.ts`). |
| `effect-commands.ts` | The ten effects commands, appended to `COMMANDS` (like `template-commands.ts`): `add_zoom`/`update_zoom`/`remove_zoom`, `add_audio`/`update_audio`/`remove_audio`/`set_ducking`, `add_image_overlay`/`update_image_overlay`/`remove_image_overlay`. The `add_*` ones update instead of duplicating when repeated. Also `describeEffects` (paged, for `get_project`) and `resolveMediaAsset` (path or asset id to an asset). Imports only types from `commands.ts`. |
| `zoom.ts` | Punch-in and push-in zooms: pure ops (`addZoom`, `updateZoom`, `removeZoom`, `shiftZoomsForDelete`, `zoomScaleAt`) and `zoomFilters` (`scale eval=frame` + `crop` per zoom, laid over the untouched picture). |
| `audio-layer.ts` | The music and sound-effect track `a1`: pure ops, `shiftAudioForDelete` (music is anchored to the timeline, effects to their moment), ducking settings, and `audioLayerFilters` (per-clip chains, music bus, `sidechaincompress` keyed by a levelled copy of the main audio, one `amix`, limiter). |
| `image-overlays.ts` | Logos, watermarks and stickers: `IMAGE_PRESETS`, pure ops, and `imageOverlayFilters` (looped still, shifted to its start, scaled, faded, overlaid). |
| `skills.ts` | Skills layer: loads the `SKILL.md` playbooks in `skills/` and picks the few that fit a request within a character budget. Pure and deterministic. |
| `templates.ts` | Template packs (data in `templates/`) and the **deterministic applier**: it composes existing commands on a scratch session and commits the result as one history entry. No AI involved. A template's `effects` (zoom, music, logo) are applied; `deferred` lists what the engine still cannot do. |
| `template-commands.ts` | The two template commands, `list_templates` and `apply_template`. |
| `session.ts` | `Session`: current project plus a history **tree** of labelled states (`manual`, `ai`, `template`). Jump to any state, save named checkpoints, optional save to a `.dax.json` file. An edit is applied in memory first; a failed autosave never fails or undoes it, it sets `Session.saveError` (shown in the command summary and the server's `state.saveError`). |
| `cuts.ts` | Cut engine: floor-relative speech detection with hysteresis, five cut presets, `planCuts` (a reviewable plan where every decision has a kind, reason, confidence and status), `applyCutPlan`. Design: `docs/research/cut-intelligence.md`. |
| `captions.ts` | Word-timed captions computed from the timeline's transcripts at render time (so they follow every cut), three looks, ASS subtitle file for burn-in. |
| `overlays.ts` | Pure edit operations for text overlays: add, update, move, remove, and `shiftOverlaysForDelete` for ripple deletes. |
| `overlay-filters.ts` | Turns overlays into FFmpeg `drawtext`/`drawbox` fragments. Text is written to files (`textfile=`, `expansion=none`), never into the filter string. Word-wraps to the frame width. |
| `presets.ts` | Built-in text presets (`OVERLAY_PRESETS`, six animations: fade, slide-up, slide-left, pop, typewriter, none) and `overlayFromPreset`. Pure data. |
| `ids.ts` | `newId(prefix)`, the id generator for clips, overlays and history items. |
| `media.ts` | ffprobe (kinds `video`, `audio`, `image`), silence and scene detection, and the parsers for their output. |
| `render.ts` | Build and run the FFmpeg command: main track, then zooms, image overlays, text overlays and captions, plus the audio layer mixed under the main audio; fit modes. Export falls back to the next encoder when one cannot run. |
| `encoders.ts` | Encoder choice shared with the server: `rankEncoders`, `probeEncoder` (1-frame lavfi test, cached 10 min) and `withEncoderFallback` (retry next encoder only if a synthetic probe shows the encoder itself is dead). |
| `transcript.ts` | Transcript types, `Transcriber` interface, filler-word ranges. (No speech-to-text adapter yet.) |
| `connector.ts` | `Connector` interface for media sources/destinations; `LocalConnector`. |
| `exec.ts` | Thin process runners. Honors `DAX_FFMPEG` / `DAX_FFPROBE`. |
| `test-utils.ts` | Test-only helpers: synthetic media (box video, speech-like tones, PNGs) and measurements (box edges, colours, band-limited RMS and peak). Excluded from the build. |

Bundled font: `assets/fonts/` (Inter, OFL-1.1, see `LICENSE-Inter.txt`).

## Invariants (break these and things go subtly wrong)

- **Every change to a project goes through `COMMANDS`.** Do not add a second edit path for the UI, the agent or the CLI. Add a command instead.
- Edit operations never mutate their input (`structuredClone` before changing). Undo relies on this.
- The main track (`v1`) is **gapless**: after any edit, clips are re-laid back to back from 0. v0.1 has no gaps and no overlapping tracks.
- **Cuts land on the project's frame grid.** `timeline.ts` snaps every cut to whole frames (`snapToFrame`): `deleteRange`, `splitAt`, `trimClip`, `appendClip`, and `assetRangesToTimeline` (silence, filler and plan cuts), which also drops any piece shorter than a frame. In `render.ts` each source gets one `fps` pass to the project rate before any trim, split into one copy per clip. Never add a per-clip `fps` filter: it adds frames at every join and the picture drifts from the sound. Evidence: `docs/research/av-sync-and-breath-recipes.md`.
- A clip's `in`/`out` are **source time** in its asset; `start` is **timeline time**. Use `assetRangesToTimeline` to convert detected ranges (silence, filler words) before deleting them.
- Overlays, captions, image overlays, zooms and audio clips use **timeline time**. Overlays, images and zooms follow ripple deletes via `shiftOverlaysForDelete`. The audio track (`a1`) is free-form (clips may overlap), and **music is anchored to the timeline**: ripple deletes never cut into it (`shiftAudioForDelete`). Spec: `docs/specs/effects-layers.md`.
- **Render order matters.** Zoom the joined picture first, then draw images, then text and captions, so a logo or a title never zooms with the footage. Time-based `scale` needs `eval=frame`, and a crop offset after it must come from the zoom expression, not `in_w`. `alimiter` needs `level=disabled`. Details: `docs/research/ffmpeg-animation-recipes.md`.
- A template never ships music, logos or file paths. The caller supplies a file or the step is reported as skipped.
- User text never enters an FFmpeg filter string. It goes through text files (`overlay-filters.ts`).
- Cut decisions that judge content (false starts, repeated takes) are **proposals** until approved. Nothing applies them silently.
- Commands must be safe to run twice. `remove_silences` and `remove_fillers` were once not idempotent; a regression test now guards this. Add one for any new command that removes material.
- Templates and skills are **data**. They never carry file paths or FFmpeg arguments. A template application is one history entry, so one undo reverses it.
- Parsers (`parseSilenceDetect`, `parseProbe`, ...) are separate from the functions that run FFmpeg so they are testable without it.

## Testing

Unit tests are pure and fast. `engine.test.ts` generates real media with FFmpeg and is skipped if FFmpeg is absent. Add a regression test with every bug fix, and an end-to-end test for every new command.

Rendering features are tested by **measuring the output**, not by checking the filter string: `zoom-render.test.ts` finds a white box's edges to get the zoom factor, `audio-render.test.ts` measures band-limited levels (voice 1500 Hz, music 220 Hz, effects 880 Hz) for duck depth, timing, fades and peak, `image-render.test.ts` finds a red logo by colour. Build media and measure with `test-utils.ts`. When you add a render feature, view a frame or two as PNGs as well.
