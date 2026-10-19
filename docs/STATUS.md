---
type: Status
title: Project status
description: "Current state of dax-editor: what works, what is in progress, what is next in order, what is blocked, and how to resume."
tags: [status, roadmap, handoff]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T20:30:00Z
---

# Project status

## Where we are

The engine has a command registry, a cut engine, word-timed captions, text overlays, zooms, music with ducking, image overlays, a session history tree and fit modes, and `pnpm check` passes. There is still no user-facing app: the engine server, agent, CLI, MCP server and desktop app are being built in separate worktrees and are not merged. The plan and its checklists are in [ROADMAP](ROADMAP.md).

## Works today

- **Command registry** (`packages/core/src/commands.ts`): 45 commands with typed arguments, model-facing descriptions and JSON-schema tool specs. It is the only way a project changes.
- **Timeline and edits**: undoable pure edits, a gapless main track, clip fades, and 8 ms audio fades at real cuts so joins do not click.
- **History tree** (`session.ts`): states tagged manual, AI or template; jump to any state; named checkpoints; undo then edit keeps the old branch.
- **Cut engine** (`cuts.ts`): speech detection relative to the noise floor, five presets (gentle, standard, tight, podcast, tutorial), and reviewable cut plans. Commands `plan_cuts`, `apply_cut_plan`, `smart_cut`. Filler-word cuts need a transcript, and there is no speech engine yet.
- **Word-timed captions** (`captions.ts`): three looks burned in via ASS, following every cut. Command `set_captions`. Needs a transcript.
- **Text overlays** (`overlays.ts`, `overlay-filters.ts`, `presets.ts`): titles, lower-thirds, captions and callouts, with six animation presets rendered by FFmpeg `drawtext`. Overlays follow ripple deletes. Text is safe from filter injection. Inter (OFL-1.1) is bundled.
- **Effects layers** ([spec](specs/effects-layers.md); `zoom.ts`, `audio-layer.ts`, `image-overlays.ts`, `effect-commands.ts`): punch-in and push-in zooms with easing and a focus point (`add_zoom`), music and sound effects on an audio track with automatic ducking under speech and a limiter so the mix cannot clip (`add_audio`, `set_ducking`), and PNG or JPG logos, watermarks and stickers with five presets and the text animations (`add_image_overlay`). All undoable, safe to repeat, and checked by measuring rendered frames and audio levels. Music is anchored to the timeline, so ripple deletes do not chop it; zooms, images and sound effects follow the footage.
- **Templates apply more**: a template's `effects` (zoom moves, a music bed, a logo) are now applied instead of skipped. Music and logos are never bundled: pass `music` or `logo` to `apply_template`, or the step says what to do.
- **Output shape**: fit modes (contain, cover, blur) and format presets via `set_format`: landscape 1080p and 720p, portrait 1080x1920, square 1080, portrait 4:5.
- **Renderer** (`render.ts`): LGPL-safe encoder choice; main track, overlays and captions in one FFmpeg command.
- **Core engine basics**: FFmpeg probe, silence detection and scene detection; transcript helpers; `Connector` interface (local).
- **Shared contract** (`packages/protocol`, `@dax/protocol`): request, response and event types for the server, desktop UI and agent.
- **Evals harness** (`packages/evals`): oracle adapter passes 3/3 starter tasks.
- **Tooling**: `pnpm check` exits 0 on Linux: lint, typecheck, knowledge-base validation, doc coverage, dead-code check and tests (124 core, 5 protocol, 6 evals, 14 script).
- **Dev environment**: Biome lint and format, TypeDoc doc-coverage gate, knip dead-code check, git hooks (the pre-commit hook blocks commits that fail lint), AGENTS.md and contributor docs.
- **Knowledge base**: OKF validator and index generator (`pnpm docs:okf`, `pnpm docs:index`); ADRs 0001-0009 (0006 is a draft proposal); engineering docs; architecture overview; evals docs; product v1 spec (draft); research reports; scribe and researcher agent definitions.
- **CI workflow** (`.github/workflows/ci.yml`): written, with Linux required and macOS and Windows non-blocking. It has not yet run on GitHub.

## In progress

Built in parallel, each in its own git worktree under `.claude/worktrees`. None is merged yet.

- `@dax/agent`: tool loop, with OpenAI-compatible and Anthropic providers.
- `@dax/local-llm`: embedded Gemma-class model runtime (llama-server).
- `@dax/server`: HTTP and WebSocket API on 127.0.0.1.
- Desktop UI: app shell and editor module (`apps/desktop`).
- Tauri shell (`apps/desktop/src-tauri`).
- Skills layer (`skills/`) and template packs with an applier (`templates/`).
- `@dax/stt`: whisper.cpp speech-to-text.
- Research tasks, relaunched after silently failing: Tauri sidecar packaging, embedded local LLM, CLI sign-in bridges, MCP server design, timeline UI patterns, FFmpeg animation recipes (audio layers, zoom, B-roll), and speech-to-text.

## Next up (in priority order)

Each item starts after the in-progress builds that it depends on are merged.

1. Engine server and the `dax` CLI, which the desktop app and agent need.
2. MCP server with the draft/approve flow for external agents ([ADR 0006](adr/0006-draft-approve-for-external-agents.md)).
3. Agent loop and first real model adapter (OpenAI-compatible endpoint, covers Ollama and llama.cpp), then run the model evaluation study.
4. Tauri desktop app: chat on the left, preview and timeline on the right.
5. Remaining engine gaps from the creator research: a second video layer for B-roll; shapes and generated cards; finding where to zoom automatically (cursor, code, face); automatic sound-effect placement; transitions. Wire the new effects into the server and desktop UI (timeline lanes for zooms, audio and images; an audio import path; a logo picker).
6. Screen and mic recording.
7. Connectors: Google Drive first, then rclone.
8. Plugin system ([plugin architecture research](research/plugin-architecture.md)).

## Blocked / needs a human

- Set up repo settings per `docs/maintainers/repo-settings.md`: branch protection, required CI, private vulnerability reporting, Dependabot.
- Provide a Code of Conduct contact email. Until then, the interim route is GitHub private reporting.
- First CI run on GitHub, to confirm Linux passes and to see macOS and Windows results.
- The macOS and Windows builds are unsigned. Signing needs an Apple Developer ID and a Windows code-signing certificate, which cost money and need a human to obtain. **(unverified: current prices)**
- Confirm the Gemma 4 licence and tool-calling behaviour before relying on it. The local-llm builder must confirm this. **(unverified)**
- Google Drive needs a decision on OAuth app verification: restricted scope or Picker. **(unverified)**

## Known issues

- CI has not yet run on GitHub.
- Windows and macOS are untested.
- No speech-to-text engine is merged yet, so captions, filler-word removal and transcript-based cuts cannot run end to end.
- No user-facing app is merged, so nothing can yet be run as a product.
- The effects layers are engine and command only: the server, protocol types and desktop timeline do not show zooms, audio clips or image overlays yet. The effects tests ran on FFmpeg 6.1.1 only; FFmpeg 7 is untested.
- The Tauri shell cannot be compiled in the cloud sandbox because the Linux WebKitGTK libraries are missing.
- Research reports contain claims marked unverified. Check them before relying on them, starting with [landscape](research/landscape.md).

## How to resume

1. Run `pnpm bootstrap` (one-time: checks the toolchain, installs dependencies, enables git hooks).
2. Run `pnpm check` (everything CI runs).
3. Run `git worktree list` to see the builds in progress, so you do not duplicate them.
4. Read the newest entries in [log](log.md), then pick the top issue in GitHub Issues.
5. After your work, do the scribe step (see [knowledge protocol](engineering/knowledge-protocol.md)).
