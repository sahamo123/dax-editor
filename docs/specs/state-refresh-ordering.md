---
type: Spec
title: Preserve newer editor state across delayed refreshes
description: Bounded ordering rules for project revisions and in-flight state refreshes.
tags: [desktop, state, recovery]
status: draft
generated:
  by: process:implementer
  at: 2026-11-01T22:00:00Z
---

# Preserve newer editor state across delayed refreshes

## Problem

A delayed HTTP state refresh can arrive after a newer pushed project state and hide an autosave failure or undo a visible edit. The synthetic observation and its private evidence are recorded in [issue #154](https://github.com/sahamo123/dax-editor/issues/154).

## Contract

For the same identified project session, do not replace a newer revision with an older one. Revisions are session-scoped: a different project can start at zero, and older engines that omit identity or revision remain compatible. A successful save may clear an error without changing the revision.

Track in-flight refreshes in the desktop controller. Ignore a refresh superseded by a later refresh, accepted state, project response, or controller restart. Job events continue to use the existing terminal-state merge. Deterministic tests cover delayed same-project state, project switch and successful save at the same revision. A dependent synthetic browser workflow exercises the observed autosave case.

This bounded guard does not establish a total ordering across all concurrent clients or different engine sessions. It must not hide a failed save, silently replay a mutation, change the engine protocol or treat old projects as disposable.
