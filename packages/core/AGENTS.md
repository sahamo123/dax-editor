# packages/core

The video engine. No UI, no network, no LLM. Everything else (CLI, MCP, desktop, evals) builds on this.
Root rules in `/AGENTS.md` apply; this file adds package specifics.

## Module map

| File | Responsibility |
|---|---|
| `schema.ts` | zod schemas and types: `Asset`, `Clip`, `Track`, `Timeline`, `Project`, `Range`, `Overlay`, caption settings, output format. |
| `timeline.ts` | **Pure** edit operations (`splitAt`, `deleteRange`, `keepRanges`, `trimClip`, fades, ...). Take a `Project`, return a new one. |
| `commands.ts` | **The command registry.** `COMMANDS` is the only way a project changes. The UI, built-in AI, MCP and CLI all call it. Each command has typed arguments, a model-facing description, `readOnly` and `irreversible` flags. `commandTools()` gives JSON-schema tool specs. 33 commands today. |
| `session.ts` | `Session`: current project plus a history **tree** of labelled states (`manual`, `ai`, `template`). Jump to any state, save named checkpoints, optional save to a `.dax.json` file. |
| `cuts.ts` | Cut engine: floor-relative speech detection with hysteresis, five cut presets, `planCuts` (a reviewable plan where every decision has a kind, reason, confidence and status), `applyCutPlan`. Design: `docs/research/cut-intelligence.md`. |
| `captions.ts` | Word-timed captions computed from the timeline's transcripts at render time (so they follow every cut), three looks, ASS subtitle file for burn-in. |
| `overlays.ts` | Pure edit operations for text overlays: add, update, move, remove, and `shiftOverlaysForDelete` for ripple deletes. |
| `overlay-filters.ts` | Turns overlays into FFmpeg `drawtext`/`drawbox` fragments. Text is written to files (`textfile=`, `expansion=none`), never into the filter string. Word-wraps to the frame width. |
| `presets.ts` | Built-in text presets (`OVERLAY_PRESETS`, six animations: fade, slide-up, slide-left, pop, typewriter, none) and `overlayFromPreset`. Pure data. |
| `ids.ts` | `newId(prefix)`, the id generator for clips, overlays and history items. |
| `media.ts` | ffprobe, silence and scene detection, and the parsers for their output. |
| `render.ts` | Build and run the FFmpeg command for the main track, its overlays and captions; fit modes. Export falls back to the next encoder when one cannot run. |
| `encoders.ts` | Encoder choice shared with the server: `rankEncoders`, `probeEncoder` (1-frame lavfi test, cached 10 min) and `withEncoderFallback` (retry next encoder only if a synthetic probe shows the encoder itself is dead). |
| `transcript.ts` | Transcript types, `Transcriber` interface, filler-word ranges. (No speech-to-text adapter yet.) |
| `connector.ts` | `Connector` interface for media sources/destinations; `LocalConnector`. |
| `exec.ts` | Thin process runners. Honors `DAX_FFMPEG` / `DAX_FFPROBE`. |

Bundled font: `assets/fonts/` (Inter, OFL-1.1, see `LICENSE-Inter.txt`).

## Invariants (break these and things go subtly wrong)

- **Every change to a project goes through `COMMANDS`.** Do not add a second edit path for the UI, the agent or the CLI. Add a command instead.
- Edit operations never mutate their input (`structuredClone` before changing). Undo relies on this.
- The main track (`v1`) is **gapless**: after any edit, clips are re-laid back to back from 0. v0.1 has no gaps and no overlapping tracks.
- A clip's `in`/`out` are **source time** in its asset; `start` is **timeline time**. Use `assetRangesToTimeline` to convert detected ranges (silence, filler words) before deleting them.
- Overlays and captions use **timeline time**. Overlays follow ripple deletes via `shiftOverlaysForDelete`.
- User text never enters an FFmpeg filter string. It goes through text files (`overlay-filters.ts`).
- Cut decisions that judge content (false starts, repeated takes) are **proposals** until approved. Nothing applies them silently.
- Commands must be safe to run twice. `remove_silences` and `remove_fillers` were once not idempotent; a regression test now guards this. Add one for any new command that removes material.
- Parsers (`parseSilenceDetect`, `parseProbe`, ...) are separate from the functions that run FFmpeg so they are testable without it.

## Testing

Unit tests are pure and fast. `engine.test.ts` generates real media with FFmpeg and is skipped if FFmpeg is absent. Add a regression test with every bug fix, and an end-to-end test for every new command.
