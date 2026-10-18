# packages/core

The video engine. No UI, no network, no LLM. Everything else (CLI, MCP, desktop, evals) builds on this.
Root rules in `/AGENTS.md` apply; this file adds package specifics.

## Module map

| File | Responsibility |
|---|---|
| `schema.ts` | zod schemas and types: `Asset`, `Clip`, `Track`, `Timeline`, `Project`, `Range`. |
| `timeline.ts` | **Pure** edit operations (`splitAt`, `deleteRange`, `keepRanges`, `trimClip`, ...). Take a `Project`, return a new one. |
| `session.ts` | `Session`: current project + undo/redo + optional save to a `.dax.json` file. |
| `media.ts` | ffprobe, silence and scene detection, and the parsers for their output. |
| `render.ts` | Build and run the FFmpeg command for the main track; pick an LGPL-safe encoder. |
| `transcript.ts` | Transcript types, `Transcriber` interface, filler-word ranges. (No speech-to-text adapter yet.) |
| `connector.ts` | `Connector` interface for media sources/destinations; `LocalConnector`. |
| `exec.ts` | Thin process runners. Honors `DAX_FFMPEG` / `DAX_FFPROBE`. |

## Invariants (break these and things go subtly wrong)

- Edit operations never mutate their input (`structuredClone` before changing). Undo relies on this.
- The main track (`v1`) is **gapless**: after any edit, clips are re-laid back to back from 0. v0.1 has no gaps and no overlapping tracks.
- A clip's `in`/`out` are **source time** in its asset; `start` is **timeline time**. Use `assetRangesToTimeline` to convert detected ranges (silence, filler words) before deleting them.
- Parsers (`parseSilenceDetect`, `parseProbe`, ...) are separate from the functions that run FFmpeg so they are testable without it.

## Testing

Unit tests are pure and fast. `engine.test.ts` generates real media with FFmpeg and is skipped if FFmpeg is absent. Add a regression test with every bug fix.
