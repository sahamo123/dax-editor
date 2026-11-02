---
type: Guide
title: Task notice reading time
description: Reproduction, scoped timer pause, browser evidence and remaining notice-eviction and accessibility gates.
tags: [implementation, accessibility, tasks, notifications, testing]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T19:05:00Z
---

# Task notice reading time

**State: IN_PROGRESS / self-reviewed.** [#264 / draft PR #266](https://github.com/sahamo123/dax-editor/pull/266), branch `codex/s01-06-notice-reading-time`, application/test head `0e4881d7c9f145e1edb496d9580db4ccebd56d1a`, follows [PR #263](https://github.com/sahamo123/dax-editor/pull/263). It does not complete S01.06.

## Reproduction and change

A synthetic focused-notification-region test showed that an error disappeared while a keyboard user was still in the region. The pre-fix regression failed as expected (private log SHA-256 `f8293fe62ab1e3183bd67b80a2c936cb8f29ae294cd7f67d478042473a7075f6`). The first post-change test attempt did not flush its synthetic focus event before advancing fake time and failed; wrapping the focus in the test framework's `act` fixed that harness issue. A later remaining-time test required explicitly faking the monotonic performance clock as well as timers; this was a test-clock mismatch, not a production timeout change.

Visible notices now pause their remaining lifetime while the pointer hovers or keyboard focus is within the active notice area, including the modal scroll region. They resume their remaining time after both interactions leave. Unattended timeouts, live-region batching, explicit dismissal and the single persistent stack remain intact. The [contract](../../specs/dialog-notice-placement.md) records the behavior. Window blur clears interaction; nested dialog transitions and standalone notices are covered.

## Verification and limits

- Eight focused notice component tests passed, covering keyboard focus, pointer hover, combined interaction, notices arriving during interaction, remaining time, nested dialogs, standalone use, window blur, normal expiry and stable announcements. An earlier combined affected component run passed 110 tests before the final three notice cases were added.
- Eleven browser checks passed on exact application/test head `0e4881d7c9f145e1edb496d9580db4ccebd56d1a` (private log `4533ae9ebff2324e40d1331687df0f88d7b74a7f73f11e84da91a8712fea4777`). These covered real-time focus/hover retention and expiry, compact/standard dialogs, keyboard scrolling and dismissal, synthetic errors, browser accessibility-tree exposure, generated-media review, manual editing, undo and export. The inspected synthetic Settings screenshot SHA-256 is `6bdaf0bd68832d41f7136bda9e6e0c1fe196024614f7e801335d2522e0473af7`.
- `pnpm check:fast` and `pnpm docs:okf` passed. Full `pnpm check` passed on that head: 1,961 package tests passed, 67 skipped and 17 script tests passed (private log `56ee516840a6aafca621112b621778d86581083590b32f8b7dfe969d55ae1e50`).
- Separate self-review inspected the timer cleanup, focus/hover combination, nested movement, test-clock behavior and unchanged announcement path. This is not independent review.

The existing four-item visible stack can still evict an older notice during a burst independently of its timer. [#265](https://github.com/sahamo123/dax-editor/issues/265) tracks reproduction and a bounded recovery design; no fix is claimed here. Actual task-specific Narrator speech and keyboard-only import remain [#177](https://github.com/sahamo123/dax-editor/issues/177); native Windows/DPI acceptance also remains open. Browser tests and system FFmpeg do not establish those gates.
