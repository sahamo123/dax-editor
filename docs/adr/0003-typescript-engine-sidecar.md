---
type: Decision
title: "ADR 0003: One TypeScript engine shared by CLI, MCP and desktop"
description: The editing engine is a TypeScript library that the CLI, MCP server and desktop app all use, run as a sidecar process by the desktop app.
tags: [adr, engine, architecture]
status: stable
generated:
  by: process:implementer
  at: 2026-10-18T18:50:00Z
---

# ADR 0003: One TypeScript engine shared by CLI, MCP and desktop

## Context

Every capability must be reachable three ways: the desktop app, a CLI and an MCP server. The project currently has one builder, so development speed and a single code path matter more than raw performance. The official MCP SDK is TypeScript. Heavy work (video, speech) happens in FFmpeg and other native programs, not in our code.

## Decision

Write the engine as a TypeScript library, `@dax/core`, with no UI. The CLI and MCP server are thin layers over it. The desktop app starts the engine as a sidecar process and talks to it over local IPC.

## Consequences

- One implementation of every edit; the three surfaces cannot drift apart.
- Tauri's Rust side stays small (window, IPC, process management).
- **Open question:** how to ship the sidecar without requiring users to install Node (for example a single-file executable). To be decided with a spike before the first installer.
- If performance ever demands it, hot paths can move to native code behind the same interfaces.

## Alternatives considered

- **Engine in Rust:** a single native binary and no Node runtime, but slower to build and fewer contributors. Rejected for now.
