---
type: Spec
title: Save-as failure and recovery contract
description: Safe outcomes for project, history and recent-project writes during save-as.
tags: [projects, persistence, recovery]
status: draft
generated:
  by: process:implementer
  at: 2026-11-01T20:00:00Z
---

# Save-as failure and recovery contract

## Problem and scope

Saving a project to a different location currently changes the active location before its history has been written. A history error therefore returns a failure while subsequent edits autosave to the new path. A later failure updating the recent-project list has a similar ambiguity. Issue [#146](https://github.com/sahamo123/dax-editor/issues/146) tracks recovery; a separately observed intermittent save error has no established cause.

This contract covers the live server's explicit save-as operation. It does not claim that ordinary autosave or two files can be committed in one filesystem transaction. The CLI and MCP continue to use their existing session behavior. The publication decision is recorded in [ADR 0016](../adr/0016-save-as-publication.md).

## Required outcomes

- A failed attempt must explain whether a destination project or history was created, whether the active location changed, and what the user should do next. Never tell the user nothing was written if a file may exist.
- A save-as to a new location must not overwrite an existing project or history sidecar. A collision is an actionable error; a user can choose a fresh filename. Saving the current location still uses ordinary save. A future explicit replace workflow may add separately reviewed, recoverable overwrite support.
- Validate the project destination using the existing allowed-root checks. Stage complete data beside the destination, then publish each file with an exclusive filesystem operation that cannot replace an existing name. If exclusive publication is unsupported, return an error rather than falling back to overwrite. Do not delete destination files as rollback; another process may have changed them. Temporary files created exclusively by this attempt may be removed.
- Publish the project before history so a racing project destination cannot acquire another project's undo history. If history publication fails after project publication, leave the project copy and any existing sidecar intact and report the partial outcome; do not change the active location. An interrupted process can leave a project copy or temporary file, so a retry must not overwrite it. A project without its history is not a completed save-as.
- Switch the active session only after both destination files are published; preserve the in-memory project, revision, undo and redo. Existing project and history data must remain untouched on collision or staging failure.
- If recording the last/recent project fails after both files and the session switch succeeded, broadcast the changed state and report explicitly that the project was saved and is active but may need to be opened manually after restart. Do not silently retry the save or revert the session.
- On reopen, history is accepted only if it matches the saved project, as in the existing core session contract. Explain that a crash between separate publications is not atomic recovery.

## Security and verification

No credentials, model output or user project contents belong in logs or fixtures. Filesystem tests use disposable synthetic projects and cover blocked history, pre-existing project and sidecar, a failure after one publication, metadata failure, undo, restart and same-path save. Include collision and cleanup behavior, and check that races cannot overwrite existing files. Verify the API error and actual state together, then run the appropriate package and repository checks. A provider, native installer or packaged runtime is not established by these tests.
