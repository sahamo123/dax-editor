---
type: Guide
title: S01.06 dialog notice placement
description: Reproduction, in-dialog notification placement, validation and native accessibility boundaries.
tags: [implementation, accessibility, dialogs, notifications]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T18:10:00Z
---

# Dialog notice placement

**State: IN_PROGRESS / self-reviewed.** [#257 / draft PR #260](https://github.com/sahamo123/dax-editor/pull/260), branch `codex/s01-06-dialog-notice-layout`, application/test head `b106ba0a4edd5d9a862497b850d482ed8b2a31ef`, follows [PR #259](https://github.com/sahamo123/dax-editor/pull/259). The [contract](../../specs/dialog-notice-placement.md) keeps notifications visible without covering modal actions. This child does not complete S01.06.

## Reproduction

With fake local-model work and a 1024×700 browser viewport, a cancelled download notice overlapped the Settings Save button. The corrected geometry reproduction failed as expected (log SHA-256 `ad7c1b7db389d1f88621ec8e91e06c9ac955e39f5340d90300c69626bd993c73`). An earlier attempt timed out before reaching the dialog because its entry control was unavailable at the initial compact viewport (log `c6aa4a274e9a81af5270359af717b0727cb4a023ff03a6fc92fd52f186161393`); opening Settings before resizing reproduced the reported flow.

## Change and review

One persistent notice container moves into the topmost registered modal, with a bounded keyboard-scrollable area and unobstructed header/footer. It returns to the shell when the dialog closes. Nested modal selection follows DOM order; the editor remains usable without the optional host provider. Existing toast timers and independent polite/urgent announcement regions are retained. A separate self-review inspected the scoped diff, nested dialog behavior, cleanup, overflow, priorities and project boundaries; this is not an independent review.

## Verification

- `pnpm check:fast` and `pnpm docs:okf` passed; `pnpm check` passed on application/test head `b106ba0a4edd5d9a862497b850d482ed8b2a31ef`: 1,955 package tests passed, 67 skipped, and 17 script tests passed (private log `e95905ca196fa8e5b5bde52b9610293b904800b5ace7f68f62b97fa29f1ad02b`).
- 107 affected component tests passed, including stable announcement identity, nested host movement, lifetime preservation and removal of an empty keyboard stop.
- Nine browser checks passed on the exact head (log `00b02a55c651a6e0bfd7efb1b184ffe1a1702db51b8c825fd73601a92467c803`): compact/standard Settings geometry and pointer hit testing, reduced motion, keyboard dismissal/scrolling, long stacked synthetic errors, cancellation outcomes, generated-media preview, manual edits, undo and export.
- Inspected browser screenshots: compact Settings `f099c50d417e9acfda26293606b3bc6c49980b36872fd540f52ba9f5aef41664`, stacked notices `f4800b1f2a8d9ba8733e6e75bbb4f820acb691b36f20fec5db3132f68229feb9`, and review `a92d24ff628e3ef0be55841681e93ec4ef84a1cfc7462f7073b8315b6e217f6c`. They use fake services and generated media.

The keyboard-only native picker and actual post-change Narrator observations remain [#177](https://github.com/sahamo123/dax-editor/issues/177); native Windows scaling and packaged-runtime checks remain open. Browser DOM/live-region checks and system FFmpeg do not establish either. Preserve user projects and do not advance S01.06 until its complete acceptance gate passes.
