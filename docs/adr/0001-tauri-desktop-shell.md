---
type: Decision
title: "ADR 0001: Use Tauri 2 for the desktop shell"
description: The desktop app is a Tauri 2 shell with a React UI, not Electron, trading some webview inconsistency for a much smaller, lighter app.
tags: [adr, desktop, tauri]
status: stable
generated:
  by: process:implementer
  at: 2026-10-18T18:50:00Z
---

# ADR 0001: Use Tauri 2 for the desktop shell

## Context

We need a desktop app for macOS, Windows and Linux with a chat panel on the left and a video preview and timeline on the right. The project owner prefers Tauri. The closest existing project (see [OpenChatCut learnings](/research/openchatcut-learnings.md)) uses Electron.

## Decision

Use **Tauri 2** with a React + TypeScript UI. The UI talks to the engine (a separate sidecar process, see [ADR 0003](/adr/0003-typescript-engine-sidecar.md)) over local IPC.

## Consequences

- Installer is far smaller than an Electron app (the shell is roughly 10 to 15 MB before FFmpeg and models). *(approximate; confirm when we build it)*
- Tauri uses the operating system's webview. On Linux that is WebKitGTK, whose `<video>` support depends on the distro's GStreamer plugins (unverified for H.264 in current versions). **Mitigation:** the preview always plays a proxy file the app creates in a codec we control, and the UI feature-detects with `canPlayType` at startup.
- Screen and camera capture will not rely on the webview; a native sidecar does it (see the roadmap).
- The Tauri shell cannot be compiled in the cloud sandbox used for development because the Linux WebKitGTK libraries are missing there. Engine, CLI and MCP work is unaffected; the shell is built and tested locally or in CI.

## Alternatives considered

- **Electron:** consistent Chromium everywhere and simpler video and capture APIs, but around 150 MB per install and heavier on memory. Rejected on size and owner preference, not on capability.
