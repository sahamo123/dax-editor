---
type: Decision
title: "ADR 0011: Allow the native export save dialog"
description: Grant the desktop window the narrow dialog save capability required to choose an export destination, without adding shell or filesystem access.
tags: [adr, desktop, security, windows]
status: stable
generated:
  by: process:implementer
  at: 2026-10-20T15:00:00Z
---

# ADR 0011: Allow the native export save dialog

The React desktop frontend already invokes the Tauri dialog save API to let the user choose an export filename. The shell registers the dialog plugin but grants only open-dialog permission, so the native export picker is denied.

Grant `dialog:allow-save` to the existing main-window capability. This grants a user-mediated filename chooser. The frontend still cannot write files or spawn processes: the authenticated engine validates the chosen path and performs export through the command registry, preserving overwrite and source-file protection.

No CSP change, generic filesystem access, shell permission, or new plugin is needed. Verify capability scope in configuration tests and exercise the native export picker in the Windows smoke test.
