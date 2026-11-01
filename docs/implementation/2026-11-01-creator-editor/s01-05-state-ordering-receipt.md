---
type: Guide
title: S01.05 state refresh ordering child receipt
description: Reproduction and verification of stale desktop state handling.
tags: [implementation, state, recovery, testing]
status: draft
generated:
  by: process:implementer
  at: 2026-11-01T22:00:00Z
---

# S01.05 state refresh ordering

**State: IN_PROGRESS.** [Issue #154](https://github.com/sahamo123/dax-editor/issues/154), parent [#151](https://github.com/sahamo123/dax-editor/issues/151), follows the verified composer [PR #152](https://github.com/sahamo123/dax-editor/pull/152), commit `1ea0507cf7c0b00ffbf688f45b3b2f8803305072`. The [contract](../../specs/state-refresh-ordering.md) defines the bounded fix and compatibility.

A synthetic browser run observed a revision-1 push with a save error followed by a delayed revision-0 HTTP response without the error; the UI hid the warning. The private failed log SHA-256 is `873ba0cd279f94acbfd8651dc710a37cc5abc13158dd5e1972d8982d792d8815`. Deterministic tests reproduce stale same-project revisions and refreshes crossing project switches. A dependent, not-yet-published UI branch ran the original four-scenario browser recovery sequence three times after the candidate fix; this is integration evidence for that combined working tree, not a substitute for verifying this isolated child.

Full source checks, isolated second review and publication remain pending. This guard is not a cross-client total-ordering protocol. Browser/system-FFmpeg results do not establish native desktop or DPI acceptance.

An initial isolated full check was intentionally stopped before completion to add coverage for two overlapping refreshes; it is not counted as a pass. The offline dependency restore used the existing pinned store with package scripts disabled.
