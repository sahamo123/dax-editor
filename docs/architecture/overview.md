---
type: Architecture
title: Architecture overview
description: How the command registry, engine, shared protocol, server, agent and desktop app fit together, the invariants that must hold, and the extension points.
tags: [architecture, engine, design, commands]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T20:30:00Z
---

# Architecture overview

One engine and one command registry, three front doors. Whatever a person can do with the buttons, an AI agent can do through the same commands, and so can the command line. They all share the same validation and the same undo history, so none of them can drift apart.

```mermaid
flowchart LR
  subgraph fronts[Three front doors]
    UI[Desktop app<br/>Tauri shell + React UI<br/>planned]
    CLI[CLI: dax<br/>built]
    MCP[MCP server<br/>for external AI agents<br/>built]
  end
  SRV[Engine server<br/>HTTP + WebSocket on 127.0.0.1<br/>planned]
  AGENT[Agent loop<br/>built-in chat, tool calls<br/>planned]
  LLM[Local model runtime<br/>embedded Gemma-class model<br/>planned]
  APIS[(Model APIs<br/>user's own key: OpenAI-compatible, Anthropic, Ollama<br/>planned)]
  PROTO[[@dax/protocol<br/>shared request, response and event types<br/>built]]
  REG[[Command registry<br/>packages/core commands.ts<br/>33 commands, the only way to change a project<br/>built]]
  CORE[[@dax/core engine<br/>timeline, cuts, captions, overlays, history tree, render<br/>built]]
  FF[FFmpeg / ffprobe]
  STT[Speech-to-text<br/>Transcriber interface; whisper.cpp planned]
  CONN[(Connectors<br/>local now; Drive, rclone planned)]
  UI --> SRV
  SRV --> AGENT
  AGENT --> LLM
  AGENT --> APIS
  AGENT --> REG
  SRV --> REG
  CLI -->|in-process| REG
  MCP -->|in-process| REG
  REG --> CORE
  CORE --> FF
  CORE --> STT
  CORE --> CONN
  UI -.types.-> PROTO
  SRV -.types.-> PROTO
```

**Built today:** `@dax/core` (the engine and the command registry), `@dax/protocol` (the shared contract), `@dax/evals`, and the `dax` CLI and `dax-mcp` MCP server (`packages/cli`, `packages/mcp`). **Planned or not yet merged:** the engine server, agent loop, local model runtime and desktop app; several are being built in parallel. See [STATUS](../STATUS.md) and the [product v1 spec](../specs/product-v1.md).

The CLI and MCP server run the registry in-process and share project files through `Session`; they do not go through the engine server. See [CLI and MCP server](cli-and-mcp.md). They use the same commands with the same validation and history as every other front door.

## The engine (`packages/core`)

- **Project** (`schema.ts`): assets, a timeline of tracks of clips, text overlays, caption settings and the output format, saved as `.dax.json`. A clip says "play seconds `in` to `out` of this asset, placed at `start` on the timeline".
- **Commands** (`commands.ts`): the registry. Each command has a name, a description written for a language model, typed arguments, and `readOnly` and `irreversible` flags. `commandTools()` produces the JSON-schema tool specs the agent and MCP use. Currently 33 commands, for example `plan_cuts`, `set_captions`, `add_overlay` and `undo`.
- **Edits** (`timeline.ts`): pure functions, `Project -> Project`. Never mutate their input. Commands call these.
- **History** (`session.ts`): a tree of labelled states, each tagged `manual`, `ai` or `template`. You can jump to any state, save named checkpoints, and undo then edit without losing the old branch.
- **Cut engine** (`cuts.ts`): finds pauses from audio levels, with a threshold set relative to each room's noise floor. It proposes cuts (pauses, filler words, false starts, repeated takes) as a plan. Every decision has a reason, a confidence and a status. False starts and repeated takes are proposals only.
- **Captions** (`captions.ts`): word-timed captions built from the transcripts of the clips on the timeline at render time, so they follow every cut. Burned in through ASS subtitles.
- **Overlays** (`overlays.ts`, `overlay-filters.ts`, `presets.ts`): titles, lower-thirds, captions and callouts with six animation presets, rendered with FFmpeg `drawtext`.
- **Perception** (`media.ts`, `transcript.ts`): probe, silence and scene detection, and transcript types. This is how a text-only or small model "sees and hears" the video: it gets numbers and words, not pixels. There is no speech-to-text engine yet.
- **Render** (`render.ts`): turns the main track, overlays and captions into one FFmpeg command and runs it. Fit modes (contain, cover, blur) fit footage to the output shape.
- **Connectors** (`connector.ts`): where media comes from and goes to. Local only for now.

## Invariants

1. The main track is **gapless**: every edit re-lays clips back to back from time 0.
2. Clip `in`/`out` are **source time**; clip `start` and overlay `start` are **timeline time**. Convert detected ranges with `assetRangesToTimeline`. Overlays follow ripple deletes (`shiftOverlaysForDelete`).
3. Edits are non-destructive: source files are never modified.
4. **Every change to a project goes through the command registry.** No front door edits the project directly. This keeps the UI, the built-in AI, MCP and the CLI identical and undoable.
5. Agent-facing tools take typed parameters, never raw shell or FFmpeg arguments. User text never enters an FFmpeg filter string; it goes through text files.
6. Cuts that remove footage on judgement (false starts, repeated takes) are proposals until someone approves them. The engine never applies them silently.

## Extension points

| Interface | Implement it to add | Lives in |
|---|---|---|
| Command | An action that the UI, agent, MCP and CLI all get at once | `packages/core/src/commands.ts` |
| `Connector` | A storage source (Drive, Dropbox, S3, rclone) | `packages/core/src/connector.ts` |
| `Transcriber` | A speech-to-text engine (whisper.cpp is planned) | `packages/core/src/transcript.ts` |
| `ModelAdapter` | A model to evaluate or drive the agent loop | `packages/evals/src/runner.ts` |
| Overlay renderer (planned) | Animated graphics rendered to transparent video, composited by FFmpeg (HyperFrames plugin) | to be specified |
| Plugin system (planned) | Third-party capabilities. See the [plugin architecture research](../research/plugin-architecture.md) | not yet built |

## Preview and export

Preview plays a small proxy video the app generates, with overlays drawn on top. Export runs FFmpeg on the originals. These must agree; golden-frame tests will compare them (planned).

## Decisions behind this

[ADR 0001](../adr/0001-tauri-desktop-shell.md) shell, [ADR 0003](../adr/0003-typescript-engine-sidecar.md) engine, [ADR 0004](../adr/0004-free-only-no-remotion.md) animation, [ADR 0005](../adr/0005-connector-interface-local-first.md) connectors, [ADR 0006](../adr/0006-draft-approve-for-external-agents.md) agent safety (draft), [ADR 0009](../adr/0009-autonomous-open-source-intake.md) how open-source tools are adopted.
