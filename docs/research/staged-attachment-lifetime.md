---
type: Research
title: Staged attachment lifetime and cleanup boundaries
description: Observed retention and a conservative ownership proposal for future attachment cleanup.
tags: [research, attachments, storage, recovery]
status: draft
generated:
  by: process:reviewer
  at: 2026-11-02T07:50:00Z
---

# Staged attachment lifetime and cleanup boundaries

## Evidence

[Issue #202](https://github.com/sahamo123/dax-editor/issues/202) investigates app-owned uploads, using generated media and isolated test directories only. A successful stage followed by an empty failed upload leaves the first file in `uploads` without a chat task or project asset; it still exists after a server restart. Separate tests establish that a staged file can also be referenced by a saved project while another belongs to a queued task; both remain present after interruption and restart. These are observed examples, not a complete inventory of user storage.

The current `stage=true` API returns a usable file path. Chat, image and audio flows share this staging mechanism; normal imports and project assets also use durable app-owned uploads. Saved projects and their history can live outside the app data directory. Task history is limited and therefore cannot prove that no saved project, older history, task, or external client references a path. A directory sweep, age threshold, missing-current-project check, or task-list-only check could destroy an irreplaceable source. Do not delete existing uploads during this investigation.

## Proposed design for a separately reviewed change

1. Treat every existing upload and every upload whose ownership is uncertain as durable. Never automatically sweep legacy paths or infer they are safe to delete from absent task references.
2. Introduce an explicitly temporary, application-owned staging area for new protocol clients, using opaque unguessable lease IDs rather than exposing reusable paths. Define file count, byte limits, expiration, cancellation, and the user's storage disclosure before implementation. Old clients retain their current durable behavior.
3. Serialize lease claim, cleanup and promotion with a durable state machine. Before returning successful task acceptance or exposing a file to any project, task, export, history, or other consumer, promote it to durable storage and persist enough metadata to recover safely. Manual image/audio consumers need the same promotion contract; a second API that bypasses it must not receive temporary paths.
4. Delete only a new-protocol temporary lease for which the engine can prove no promotion, accepted or in-flight consumer, or ambiguous outcome exists. On restart, a partial write, interrupted promotion, missing metadata, timeout, network loss, or uncertain task acceptance must retain the bytes; do not automatically replay or infer ownership from elapsed time alone. Scope any deletion to validated app-created lease identifiers and paths, with symlink-safe containment; never accept arbitrary delete paths from an assistant.
5. Keep durable sources for active, queued, interrupted, completed and historical work and all project/history references. Retention and eventual user-directed management of durable sources need a separate design; a saved project on another disk cannot be safely discovered by scanning the current session alone.

This is a proposal, not an implemented cleanup policy or an architectural approval. Before implementation, write the detailed spec and ADR, settle atomic write and crash recovery semantics, review cross-client and external-project compatibility, and test concurrent claim/delete, crashes at every transition, legacy clients, quotas, symlinks, history/undo and explicit cancellation. No existing user files were removed by these tests.
