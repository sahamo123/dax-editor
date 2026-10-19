---
type: Status
title: Project status
description: "Current state of dax-editor: what works, what is in progress, what is next in order, what is blocked, and how to resume."
tags: [status, roadmap, handoff]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T19:30:00Z
---

# Project status

## Where we are

The engine core (`packages/core`) and the developer tooling are built, and the evals harness passes its three starter tasks with the oracle adapter. There is no user-facing app yet; the desktop shell, CLI and MCP server are still to be written. The plan and its checklists are in [ROADMAP](ROADMAP.md).

## Works today

- **Core engine** (`packages/core`): timeline model with undo/redo; FFmpeg probe, silence detection and scene detection; renderer with an LGPL-safe encoder choice; transcript helpers; `Connector` interface (local).
- **Evals harness** (`packages/evals`): oracle adapter passes 3/3 starter tasks.
- **Tooling**: `pnpm check` exits 0 on Linux: lint, typecheck, knowledge-base validation, doc coverage, dead-code check and tests (28 core, 6 evals and 14 script tests).
- **Dev environment**: Biome lint and format, TypeDoc doc-coverage gate, knip dead-code check, git hooks, AGENTS.md and contributor docs.
- **Knowledge base**: OKF validator and index generator (`pnpm docs:okf`, `pnpm docs:index`); ADRs 0001-0009 (0006 is a draft proposal); engineering docs; architecture overview; evals docs; spec template; maintainer checklist.
- **Scribe step**: a scribe subagent definition, and the routine documented in the knowledge protocol.
- **CI workflow**: written in `.github/workflows/ci.yml`, with Linux required and macOS and Windows non-blocking. It has not yet run on GitHub.
- **Desktop shell** (`apps/desktop`, `src-tauri`): Tauri 2 window with a strict CSP and a least-privilege capability, a sidecar supervisor for the engine server (random token, `ServerInfo` handshake, health check, shutdown on close, exit and crash), native open-file dialog and drag-and-drop paths. Verified on Linux under Xvfb: no orphan processes after window close, SIGTERM, or SIGKILL of the app; H.264, VP9/WebM and MPEG-4 `<video>` playback. Packaging: pinned, checksummed Node and LGPL FFmpeg as sidecars ([ADR 0009](adr/0009-desktop-sidecar-packaging.md)). Uses a stand-in server and a placeholder page until the real UI and `packages/server` land.

## In progress

- Desktop shell follow-ups before the first installer: replace the stand-in server with `packages/server/dist/cli.js`; replace the placeholder page with the real UI; macOS and Windows builds are untested; signing and the updater need maintainer steps (see [desktop release guide](maintainers/desktop-release.md)).
- Nothing else in flight. Next is the first pull request merge and enabling repo settings.

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
- First CI run on GitHub, to confirm Linux passes and to see macOS and Windows results.

## Known issues

- CI has not yet run on GitHub.
- Windows and macOS are untested.
- The whisper adapter is missing, so filler-word removal cannot run end to end.
- The Tauri shell needs the Linux WebKitGTK libraries to build (`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`); it does not build in the cloud sandbox without them. macOS and Windows builds have not been run.
- The FFmpeg shipped in the Linux and Windows installers is BtbN's prebuilt LGPL build, which is large (about 140 MB each); a minimal LGPL build is planned.

## How to resume

1. Run `pnpm bootstrap` (one-time: checks the toolchain, installs dependencies, enables git hooks).
2. Run `pnpm check` (everything CI runs).
3. Read the newest entries in [log](log.md), then pick the top issue in GitHub Issues.
4. After your work, do the scribe step (see [knowledge protocol](engineering/knowledge-protocol.md)).
