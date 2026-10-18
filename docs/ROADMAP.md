---
type: Roadmap
title: Roadmap
description: Phased plan for dax-editor with the decisions taken so far, and checklists for the engine, usable v0.1 and phase 2.
tags: [roadmap, planning]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T19:30:00Z
---

# Roadmap

Decisions so far:

| Topic | Decision |
|---|---|
| Cost | Entirely free and open source; no mandatory paid service or dependency |
| License | Apache-2.0; FFmpeg is LGPL-safe (no libx264 in builds we ship) |
| Desktop shell | Tauri 2 (macOS, Windows, Linux) |
| Engine | TypeScript (`@dax/core`), run as a sidecar by the desktop app; shared by CLI and MCP |
| Chat backends | Anthropic, OpenAI-compatible, Ollama, plus an embedded local model (Gemma family, downloaded on first run) |
| Connectors | Local files only in v0.1. The `Connector` interface exists so Google Drive, rclone etc. can be added without touching the engine |
| Animations | FFmpeg built-ins first (captions, titles, transitions). HyperFrames (Apache-2.0) later as an optional plugin. **Not Remotion** (paid for automated rendering) |
| Blender | Phase 2 optional plugin, driven by parameterised templates rather than free-form generated Python |
| UI | Chat on the left, live preview and timeline on the right |

## Phase 0: engine (in progress)

- [x] Timeline model, undoable edits, source-to-timeline range mapping
- [x] Probe, silence detection, scene detection
- [x] FFmpeg renderer with encoder selection and progress
- [x] Transcript types, filler-word ranges, `Connector` interface (local)
- [x] Dev environment: lint/format (Biome), doc-coverage gate (TypeDoc), dead-code check (knip), git hooks, AGENTS.md, contributor docs, OKF knowledge base
- [x] Evals harness with deterministic oracle adapter and 3 starter tasks
- [ ] CI workflow (Linux required; macOS and Windows experimental until verified) (written, awaiting first run)
- [x] OKF validator + index generator scripts
- [x] [ADRs 0001-0008](adr/index.md)
- [ ] First real model adapter (OpenAI-compatible endpoint, covers Ollama and llama.cpp)
- [ ] Model evaluation study per [model-evaluation-plan](evals/model-evaluation-plan.md)
- [ ] whisper.cpp transcriber adapter
- [ ] Proxy generation for preview, thumbnails, waveforms
- [ ] Captions burn-in and SRT export
- [ ] Hardware-encoder matrix tested on macOS, Windows, Linux
- [ ] Eval runs against real models: fixed footage + prompts -> assertions on the resulting timeline (the oracle-only harness is done, see above)

## Phase 1: usable v0.1

- [ ] CLI (`dax`): probe, silences, remove-silences, transcribe, export, mcp
- [ ] MCP server: perceive tools (transcript, silences, scenes, frames) and edit tools, with a draft/approve flow for external agents and import-path allowlists
- [ ] Agent loop for the built-in chat with the four backends, constrained tool calls, and model recommendation by RAM
- [ ] Tauri app: chat panel, preview, timeline, drag-and-drop import
- [ ] Screen and mic recording
- [ ] Format recipes (tutorial, explainer, short-form) as data files
- [ ] CI on macOS, Windows, Linux; installers

## Phase 2

- [ ] Connectors: Google Drive (direct API, resumable transfer) and rclone
- [ ] Action adapters (publishing) backed by MCP servers
- [ ] HyperFrames motion-graphics plugin
- [ ] OTIO / FCPXML / EDL export
- [ ] Blender plugin

See [research/landscape.md](research/landscape.md) for the reasoning and the unverified claims still to check.
