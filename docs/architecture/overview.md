---
type: Architecture
title: Architecture overview
description: How the engine, CLI, MCP server, agent loop and desktop app fit together, the invariants that must hold, and the extension points.
tags: [architecture, engine, design]
status: stable
generated:
  by: process:implementer
  at: 2026-10-18T19:00:00Z
---

# Architecture overview

One engine, three front doors. Whatever you can do in the app you can do from the command line or from an AI agent over MCP, because they all call the same code.

```mermaid
flowchart LR
  subgraph surfaces[Front doors]
    UI[Desktop app<br/>Tauri + React<br/>chat left, preview right]
    CLI[CLI: dax]
    MCP[MCP server<br/>for Claude Code, etc.]
  end
  AGENT[Agent loop<br/>built-in chat<br/>Anthropic, OpenAI-compatible,<br/>Ollama, embedded Gemma]
  CORE[[@dax/core engine<br/>timeline, edits, undo,<br/>FFmpeg, connectors]]
  FF[FFmpeg / ffprobe]
  STT[Speech-to-text<br/>whisper.cpp]
  CONN[(Connectors<br/>local now; Drive, rclone later)]
  UI --> AGENT --> CORE
  UI --> CORE
  CLI --> CORE
  MCP --> CORE
  CORE --> FF
  CORE --> STT
  CORE --> CONN
```

Built today: `@dax/core` and `@dax/evals`. Planned: CLI, MCP server, agent loop, desktop app. See [STATUS](../STATUS.md).

## The engine (`packages/core`)

- **Project** (`schema.ts`): assets plus a timeline of tracks of clips, saved as `.dax.json`. A clip says "play seconds `in` to `out` of this asset, placed at `start` on the timeline".
- **Edits** (`timeline.ts`): pure functions, `Project -> Project`. Never mutate their input.
- **Session** (`session.ts`): holds the current project and an undo/redo history; optionally saves after every change.
- **Perception** (`media.ts`, `transcript.ts`): probe, silence and scene detection, transcript types. This is how a text-only or small model "sees and hears" the video: it gets numbers and words, not pixels.
- **Render** (`render.ts`): turns the main track into one FFmpeg command and runs it.
- **Connectors** (`connector.ts`): where media comes from and goes to.

## Invariants

1. The main track is **gapless**; every edit re-lays clips back to back from time 0.
2. `in`/`out` are **source time**; `start` is **timeline time**. Convert detected ranges with `assetRangesToTimeline`.
3. Edits are non-destructive: source files are never modified.
4. Everything the UI can do is a command on the engine, so it is scriptable and undoable.
5. Agent-facing tools take typed parameters, never raw shell or FFmpeg arguments.

## Extension points

| Interface | Implement it to add | Lives in |
|---|---|---|
| `Connector` | A storage source (Drive, Dropbox, S3, rclone) | `packages/core/src/connector.ts` |
| `Transcriber` | A speech-to-text engine | `packages/core/src/transcript.ts` |
| `ModelAdapter` | A model to evaluate or drive the agent loop | `packages/evals/src/runner.ts` |
| Overlay renderer (planned) | Animations rendered to transparent video, composited by FFmpeg | to be specified |

## Preview and export

Preview plays a small proxy video the app generates, with overlays drawn on top. Export runs FFmpeg on the originals. These must agree; golden-frame tests will compare them (planned).

## Decisions behind this

[ADR 0001](/adr/0001-tauri-desktop-shell.md) shell, [ADR 0003](/adr/0003-typescript-engine-sidecar.md) engine, [ADR 0004](/adr/0004-free-only-no-remotion.md) animation, [ADR 0005](/adr/0005-connector-interface-local-first.md) connectors, [ADR 0006](/adr/0006-draft-approve-for-external-agents.md) agent safety (proposed).
