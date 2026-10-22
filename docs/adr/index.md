# Architecture decisions

## Documents

* [ADR 0001: Use Tauri 2 for the desktop shell](0001-tauri-desktop-shell.md) - The desktop app is a Tauri 2 shell with a React UI, not Electron, trading some webview inconsistency for a much smaller, lighter app.
* [ADR 0002: Apache-2.0 license with an LGPL-safe FFmpeg](0002-apache-2-and-lgpl-ffmpeg.md) - The project is Apache-2.0 and ships only FFmpeg builds without GPL encoders, preferring platform hardware encoders.
* [ADR 0003: One TypeScript engine shared by CLI, MCP and desktop](0003-typescript-engine-sidecar.md) - The editing engine is a TypeScript library that the CLI, MCP server and desktop app all use, run as a sidecar process by the desktop app.
* [ADR 0004: Free-only dependencies; no Remotion; FFmpeg built-ins first](0004-free-only-no-remotion.md) - No feature may need a paid service or license, so Remotion is excluded, animations start as FFmpeg built-ins, and HyperFrames is a later optional plugin.
* [ADR 0005: Local files first, behind a Connector interface](0005-connector-interface-local-first.md) - Version 0.1 handles local files only, but all media access goes through a Connector interface so cloud storage can be added without changing the engine.
* [ADR 0006 (proposed): Draft-and-approve edits for external agents](0006-draft-approve-for-external-agents.md) - Proposed rule that edits from external MCP agents go to an isolated draft the user can approve, committed as a single undo step, with export and delete excluded.
* [ADR 0007: Agent-agnostic repository with an OKF knowledge base](0007-agent-agnostic-repo-and-okf.md) - The repo is the single source of truth, readable by any agent, using AGENTS.md for rules and docs/ as an Open Knowledge Format bundle with a scribe step.
* [ADR 0008: A small custom eval harness instead of an off-the-shelf framework](0008-custom-eval-harness.md) - Model evaluation uses a TypeScript harness that scores the finished timeline, rather than promptfoo, Inspect AI or DeepEval.
* [ADR 0009: Scout agents may adopt open-source tools without human approval, within hard gates](0009-autonomous-open-source-intake.md) - A scout agent can add a qualifying open-source tool as a plugin by pull request without asking, but only if it passes the intake policy's licence, security and size gates; everything else escalates.
* [ADR 0010: Ship Node, the engine server and an LGPL FFmpeg as sidecars](0010-desktop-sidecar-packaging.md) - The desktop installer bundles an official Node runtime and FFmpeg as Tauri externalBin sidecars and the engine server as one bundled JavaScript resource, with pinned, checksummed downloads and no committed binaries.
* [ADR 0011: Allow the native export save dialog](0011-native-export-save-dialog.md) - Grant the desktop window the narrow dialog save capability required to choose an export destination, without adding shell or filesystem access.
* [ADR 0012: Ship a verified offline AI model in the Windows installer](0012-offline-ai-installer.md) - Bundle a small Qwen model and MIT llama.cpp runtime with the Windows editor, initialize them locally without network access, and retain LM Studio as an optional compatible endpoint.
* [Engine-owned local chat tasks and read-only planning](0013-local-chat-task-queue.md) - Keep queued work in the local engine and enforce Planning mode through the command allow-list.
* [ADR 0014: Live desktop tools and bounded background integrations](0014-functional-desktop-integrations.md) - Share one authoritative session with local MCP clients and run speech and Blender as bounded jobs.
* [Preserve omitted format options in live editor sessions](0015-editor-format-preservation.md) - Keep footage fit and frame rate during editor format changes while retaining standalone CLI preset defaults.
