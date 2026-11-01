---
type: Decision
title: Publish save-as files without replacing existing destinations
description: Stage project and history separately and publish exclusively, with explicit partial-save recovery.
tags: [persistence, projects, recovery]
status: draft
generated:
  by: process:implementer
  at: 2026-11-01T20:00:00Z
---

# 0016: Publish save-as files without replacing existing destinations

## Context

A live session's project and undo history are separate files. A failure between writes must not switch the active session silently or destroy an existing destination. Most filesystems do not offer a portable atomic transaction spanning both names. See the [save-as recovery specification](../specs/save-as-recovery.md).

## Decision

For a different destination, stage both files in the destination directory and publish them with exclusive hard links. Publish the project first: a racing project cannot then acquire another session's history. Switch the live session only when both names exist. Refuse existing destinations and unsupported exclusive publication instead of overwriting; saving the currently open location retains ordinary save behavior. If history publication fails, retain and identify the project copy and keep the old session active. If recent-project metadata fails after publication, report that the new project is saved and active and broadcast its state.

## Consequences

This is not a cross-file transaction or crash-proof journal. A crash can leave an unpaired copy or staging file; no destination is deleted automatically. A user must choose a fresh name or inspect leftovers. Filesystems without hard-link support need a different local destination; an explicit replace-existing workflow and broader filesystem compatibility require separate design and tests. Windows sharing and permission errors remain independently tracked in [issue #149](https://github.com/sahamo123/dax-editor/issues/149).
