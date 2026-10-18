---
type: Status
title: Project status
description: "Current state of dax-editor: what works, what is in progress, what is next in order, what is blocked, and how to resume."
tags: [status, roadmap, handoff]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T18:45:00Z
---

# Project status

## Where we are

The engine core (`packages/core`) and the developer tooling are built, and the evals harness passes its three starter tasks with the oracle adapter. There is no user-facing app yet; the desktop shell, CLI and MCP server are still to be written. The plan and its checklists are in [ROADMAP](ROADMAP.md).

## Works today

- **Core engine** (`packages/core`): timeline model with undo/redo; FFmpeg probe, silence detection and scene detection; renderer with an LGPL-safe encoder choice; transcript helpers; `Connector` interface (local).
- **Evals harness** (`packages/evals`): oracle adapter passes 3/3 starter tasks.
- **Tooling**: lint, typecheck, doc coverage, dead-code check and tests are all green on Linux.

## In progress

- Dev environment hardening: CI workflow, engineering docs, ADRs, OKF validator and index generator.

## Next up (in order)

1. whisper.cpp transcriber adapter
2. CLI package `dax`
3. MCP server with draft/approve flow for external agents
4. Agent loop and first real model adapter (OpenAI-compatible endpoint, covers Ollama and llama.cpp), then run the model evaluation study
5. Tauri desktop app: chat on the left, preview and timeline on the right
6. Screen and mic recording
7. Connectors: Google Drive first, then rclone

## Blocked / needs a human

- Set up repo settings per `docs/maintainers/repo-settings.md`: branch protection, required CI, private vulnerability reporting, Dependabot.
- Provide a Code of Conduct contact email. Until then, the interim route is GitHub private reporting.
- Confirm the Gemma 4 licence and tool-calling behaviour before relying on it. **(unverified)**
- Google Drive needs a decision on OAuth app verification: restricted scope or Picker. **(unverified)**
- macOS and Windows CI results are unknown until the first CI run.

## Known issues

- CI has not yet run on GitHub.
- Windows and macOS are untested.
- The whisper adapter is missing, so filler-word removal cannot run end to end.
- The Tauri shell cannot be compiled in the cloud sandbox because the Linux WebKitGTK libraries are missing.

## How to resume

1. Run `pnpm bootstrap` (one-time: checks the toolchain, installs dependencies, enables git hooks).
2. Run `pnpm check` (everything CI runs).
3. Read the newest entries in [log](log.md), then pick the top issue in GitHub Issues.
