---
type: Spec
title: Browser imports and responsive offline chat
description: Select local video files in the browser preview and receive bounded, streamed offline assistant replies.
tags: [desktop, server, local-model]
status: draft
generated:
  by: process:implementer
  at: 2026-10-21T00:00:00Z
---

# Browser imports and responsive offline chat

## Problem and acceptance criteria

Browser Import currently asks for absolute paths, and offline chat shows no text until a complete reply arrives. Import must open a file picker, accept multiple supported videos, and copy each selected file to local app data before importing it through the existing command registry. Cancel must leave the timeline unchanged; errors must be visible. Native imports retain their existing native dialog.

The built-in model must stream visible reply text, disable template thinking, cap each reply at 512 tokens and bound each model request to 90 seconds without automatic retries. Stop must remain available. Hosted providers retain their current settings. Verify a real local-model response and browser import in addition to deterministic tests.

## Design and security

Add authenticated `POST /api/import/upload?name=<filename>` with a raw octet-stream body. Filename metadata is validated; only its allow-listed video extension is retained in a random server-generated path. Stream into a private temporary folder under local app data with a 1 GiB limit, preserving allowed-root containment checks. Remove unsuccessful or interrupted uploads; retain successful sources for project restart. Requests pass the existing Host, Origin and bearer-token gates. Selected video bytes remain on the machine. No multipart dependency, cloud storage, shell arguments or client-selected destination paths are introduced.

The browser picker returns File objects to a controller upload action. Per-file progress notices and import failures are shown through existing toasts. The path-entry dialog remains available as a native-dialog failure fallback. Source files are retained without automatic deletion because saved projects reference them.

## Verification

Test authenticated upload/import, missing authentication, malicious filename, invalid media, size limits and cleanup. Test browser selection, cancel and upload errors. Check the local model request settings and incremental text delivery with a loopback fake. Rebuild and verify the browser against the bundled engine and real model. Native installer validation remains a separate blocked gate.
