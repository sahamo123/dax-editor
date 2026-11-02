---
type: Guide
title: S01.06 modal shortcut protection after focus loss
description: Reproduced background project edits while a modal is open, scoped guard and focus-containment follow-up.
tags: [implementation, accessibility, keyboard, safety]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T12:02:00Z
---

# Modal shortcut protection after focus loss

**State: IN_PROGRESS.** [Issue #234 / draft PR #236](https://github.com/sahamo123/dax-editor/pull/236), `codex/s01-06-modal-focus-loss`, application/test head `8658ee94f0c5d279eaf3a20dcb2cca29ffa80335`, builds on [PR #233](https://github.com/sahamo123/dax-editor/pull/233) documentation head `8e723ad15c6a56f7d12d1190cfcec8a84017baff`. S01.06 [#162](https://github.com/sahamo123/dax-editor/issues/162) remains open.

## Reproduction and scoped change

Before the fix, focused component tests with an open modal and focus outside it invoked split, clip deletion and undo; private failure log SHA-256 `639252d71f7867dbe4bfeed2b4f59400ed80aff76e521fed96c858a69f063735`. A generated-video Edge test held a Settings save request, observed that the focused Save button became disabled and focus fell to the page body, then recorded split, remove-clip and undo requests behind the open modal. The first browser failure also had a route-cleanup race (log `8a91ecf0a35a196e2ecc792d3df71b39bd82d413491cd38bf8c703c7cd8d9f2c`); a corrected test cleanup reproduced the same project commands without that extra error (log `0d651ee82d8b33d4250e5c16c73531dcf56313542ed7cab0b1ffe49f99efd9b6`).

The candidate guards editor and history shortcuts whenever a visible modal owns the workspace, even if the event target is outside it. Hidden and non-modal dialogs do not globally suppress shortcuts. Fifty-one focused component tests passed (private log `d2ffeab941a36207d34bf079534dfcb15757e290129e2310f169685d1ac4fcb6`); two generated-video browser tests passed (log `f767423a9907bfc176ce68beb223ce4845fa866dabcc08e0079b25a4ae61b88d`). These focused and browser checks preceded a formatting-only cleanup. The inspected synthetic screenshot SHA-256 `60bc0315853afaae06cabe6225acf667c0118ba55fd0f51ce48bc1387b0e9f03` shows Settings with Save disabled; system FFmpeg was used only diagnostically. Initial lint reported formatting differences; formatting was applied and lint and dead-code checks passed.

## Remaining safety gap and checks

A separate generated-media diagnostic showed that Tab moved focus outside the still-open Settings modal after Save was disabled (private log `67a538bcc860cf29bed0668475d24800b1234b09d5b4dd8fc17ddf35907a777e`). [Issue #235](https://github.com/sahamo123/dax-editor/issues/235) tracks actual focus containment and recovery. The shortcut guard does not prevent activation of every background control and does not complete S01.06.

Full host-authorized `pnpm check` is running at the application/test head. Record its exact result, review the candidate, then investigate #235. Keyboard-only import, actual screen-reader speech, native app and DPI acceptance remain open. No user project or private media was used.
