---
type: Architecture
title: Architecture overview
description: How the command registry, engine, shared protocol, agent, server and desktop app fit together, the invariants that must hold, and the extension points.
tags: [architecture, engine, design, commands]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T21:00:00Z
---

# Architecture overview

One engine and one command registry, several front doors. Whatever a person can do with the buttons, an AI agent can do through the same commands, and so can the command line. They all share the same validation and the same undo history, so none of them can drift apart.

```mermaid
flowchart LR
  subgraph fronts[Front doors]
    UI[Desktop app<br/>React UI, runs in a browser<br/>Tauri shell in progress]
    CLI[CLI: dax<br/>built]
    MCP[MCP server: dax-mcp<br/>for external AI agents<br/>built]
  end
  ENG[Engine launcher: dax-engine<br/>built]
  SRV[Engine server: dax-server<br/>HTTP + WebSocket on 127.0.0.1<br/>built]
  AGENT[Agent loop<br/>built-in chat, tool calls<br/>built]
  SKILLS[Skills<br/>skills/ playbooks, loaded on demand<br/>built]
  TPL[Templates<br/>templates/ data, deterministic applier<br/>built]
  LLM[Local model runtime<br/>embedded Gemma-class model<br/>in progress]
  APIS[(Model APIs<br/>user's own key: OpenAI-compatible or Anthropic<br/>built)]
  PROTO[[@dax/protocol<br/>shared request, response and event types<br/>built]]
  REG[[Command registry<br/>packages/core commands.ts<br/>45 commands, the only way to change a project<br/>built]]
  CORE[[@dax/core engine<br/>timeline, cuts, captions, overlays, history tree, render<br/>built]]
  FF[FFmpeg / ffprobe]
  STT[Speech-to-text<br/>Transcriber interface; whisper.cpp in progress]
  CONN[(Connectors<br/>local now; Drive, rclone planned)]
  UI --> SRV
  ENG --> SRV
  ENG --> AGENT
  SRV --> AGENT
  AGENT --> SKILLS
  AGENT --> TPL
  AGENT --> LLM
  AGENT --> APIS
  AGENT --> REG
  SRV --> REG
  CLI -->|in-process| REG
  MCP -->|in-process| REG
  REG --> CORE
  TPL --> REG
  CORE --> FF
  CORE --> STT
  CORE --> CONN
  UI -.types.-> PROTO
  SRV -.types.-> PROTO
```

**Built today:** `@dax/core` (engine, registry, skills loader, templates and applier), `@dax/protocol`, `@dax/agent`, `@dax/server`, `@dax/engine`, the desktop app's browser build (app shell and editor), `@dax/evals`, the `dax` CLI and the `dax-mcp` MCP server. **In progress or planned:** the embedded local model runtime, speech-to-text, the Tauri shell, the MCP draft/approve flow and the plugin system. See [STATUS](../STATUS.md) and the [product v1 spec](../specs/product-v1.md).

The CLI and MCP server run the registry in-process and share project files through `Session`; they do not go through the engine server. See [CLI and MCP server](cli-and-mcp.md). The engine's chat can also be answered by the user's own signed-in command-line agent through the bridges, which reuse the MCP endpoint on the live session. See [CLI bridges](cli-bridges.md). They use the same commands with the same validation and history as every other front door.

## The engine (`packages/core`)

- **Project** (`schema.ts`): assets, a timeline of tracks of clips, text overlays, caption settings and the output format, saved as `.dax.json`. A clip says "play seconds `in` to `out` of this asset, placed at `start` on the timeline".
- **Commands** (`commands.ts`, `effect-commands.ts`, `template-commands.ts`): the registry. Each command has a name, a description written for a language model, typed arguments, and `readOnly` and `irreversible` flags. `commandTools()` produces the JSON-schema tool specs the agent and MCP use. There are 45 commands: 33 in the registry, 10 effects (`effect-commands.ts`: zoom, music and sound effects, image overlays) and 2 template commands (`list_templates`, `apply_template`). Examples: `plan_cuts`, `set_captions`, `add_overlay`, `add_zoom`, `add_audio` and `undo`.
- **Edits** (`timeline.ts`): pure functions, `Project -> Project`. Never mutate their input. Commands call these.
- **History** (`session.ts`): a tree of labelled states, each tagged `manual`, `ai` or `template`. You can jump to any state, save named checkpoints, and undo then edit without losing the old branch.
- **Cut engine** (`cuts.ts`): finds pauses from audio levels, with a threshold set relative to each room's noise floor. It proposes cuts (pauses, filler words, false starts, repeated takes) as a plan. Every decision has a reason, a confidence and a status. False starts and repeated takes are proposals only.
- **Captions** (`captions.ts`): word-timed captions built from the transcripts of the clips on the timeline at render time, so they follow every cut. Burned in through ASS subtitles.
- **Overlays** (`overlays.ts`, `overlay-filters.ts`, `presets.ts`): titles, lower-thirds, captions and callouts with six animation presets, rendered with FFmpeg `drawtext`.
- **Effects layers** (`zoom.ts`, `audio-layer.ts`, `image-overlays.ts`, `effect-commands.ts`): punch-in and push-in zooms, music and sound effects with automatic ducking under speech, and logo, watermark and sticker images. See the [effects layers spec](../specs/effects-layers.md).
- **Templates** (`templates.ts`, data in `templates/`): 34 style and industry recipes (16 styles, 18 industries). They are data only: no file paths, no FFmpeg arguments. The applier composes existing commands on a scratch session and commits the result as one history entry.
- **Skills** (`skills.ts`, data in `skills/`): 24 `SKILL.md` playbooks plus a router. The loader picks the few that fit a request within a character budget, so a small model gets the right know-how without a flooded context.
- **Perception** (`media.ts`, `transcript.ts`): probe, silence and scene detection, and transcript types. This is how a text-only or small model "sees and hears" the video: it gets numbers and words, not pixels. There is no speech-to-text engine yet.
- **Render** (`render.ts`): turns the main track, overlays and captions into one FFmpeg command and runs it. Fit modes (contain, cover, blur) fit footage to the output shape.
- **Connectors** (`connector.ts`): where media comes from and goes to. Local only for now.

## Invariants

1. The main track is **gapless**: every edit re-lays clips back to back from time 0.
2. Clip `in`/`out` are **source time**; clip `start`, overlay, image, zoom and audio-clip `start` are **timeline time**. Convert detected ranges with `assetRangesToTimeline`. Overlays, images and zooms follow ripple deletes (`shiftOverlaysForDelete`); music is anchored to the timeline and is not cut by them.
3. Edits are non-destructive: source files are never modified.
4. **Every change to a project goes through the command registry.** No front door edits the project directly. This keeps the UI, the built-in AI, MCP and the CLI identical and undoable.
5. Agent-facing tools take typed parameters, never raw shell or FFmpeg arguments. User text never enters an FFmpeg filter string; it goes through text files.
6. Cuts that remove footage on judgement (false starts, repeated takes) are proposals until someone approves them. The engine never applies them silently.
7. Local servers (the engine server and the MCP HTTP transport) bind to loopback and require a per-launch bearer token, with Host and Origin checks.
8. Templates and skills are data. They never carry file paths or FFmpeg arguments.

## Extension points

| Interface | Implement it to add | Lives in |
|---|---|---|
| Command | An action that the UI, agent, MCP and CLI all get at once | `packages/core/src/commands.ts` |
| Template | A style or industry edit recipe, as data | `templates/` (applier in `packages/core/src/templates.ts`) |
| Skill | A playbook the agent loads on demand | `skills/<name>/SKILL.md` |
| Agent provider | A model backend for the agent loop | `packages/agent/src/providers/` |
| `Connector` | A storage source (Drive, Dropbox, S3, rclone) | `packages/core/src/connector.ts` |
| `Transcriber` | A speech-to-text engine (whisper.cpp in progress) | `packages/core/src/transcript.ts` |
| `ModelAdapter` | A model to evaluate with the eval harness | `packages/evals/src/runner.ts` |
| Overlay renderer (planned) | Animated graphics rendered to transparent video, composited by FFmpeg (HyperFrames plugin) | to be specified |
| Plugin system (planned) | Third-party capabilities. See the [plugin architecture research](../research/plugin-architecture.md) | not yet built |

## Preview and export

The desktop editor previews the main track with two alternating video elements, so the preview stays gapless. Overlays are drawn with CSS in the preview and matched to the FFmpeg `drawtext` output. Export runs FFmpeg on the originals. These must agree; golden-frame tests will compare them (planned).

## Decisions behind this

[ADR 0001](../adr/0001-tauri-desktop-shell.md) shell, [ADR 0003](../adr/0003-typescript-engine-sidecar.md) engine, [ADR 0004](../adr/0004-free-only-no-remotion.md) animation, [ADR 0005](../adr/0005-connector-interface-local-first.md) connectors, [ADR 0006](../adr/0006-draft-approve-for-external-agents.md) agent safety (draft), [ADR 0009](../adr/0009-autonomous-open-source-intake.md) how open-source tools are adopted.
