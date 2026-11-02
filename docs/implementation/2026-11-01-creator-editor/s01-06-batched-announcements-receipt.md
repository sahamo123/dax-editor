---
type: Guide
title: S01.06 batched notice announcements
description: Reproduction, scoped live-region batching fix and current verification boundaries.
tags: [implementation, accessibility, tasks, recovery]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T11:33:00Z
---

# Batched notice announcements

**State: IN_PROGRESS.** [Issue #232 / draft PR #233](https://github.com/sahamo123/dax-editor/pull/233), `codex/s01-06-batched-announcements`, application/test head `8a104aa7fd8950795fb2fd10ac34e0adb02b1da3`, builds on [PR #231](https://github.com/sahamo123/dax-editor/pull/231) documentation head `6ffe663996b861c7f6e3160c4ef7b0cc51b3680d`. Parent S01.06 [#162](https://github.com/sahamo123/dax-editor/issues/162) remains open.

## Evidence and behavior

Focused tests on the prior code reproduced three omissions: an error followed by information in one React batch left the urgent region empty; information followed by an error left the polite region empty; two batched errors left only the second. The candidate keeps pending notices independently from the four visible toasts. Separate urgent and polite queues each retain eight pending notices; further notices set an explicit overflow message. Each nonempty priority is grouped into a single live-region DOM update. Dismissal does not erase a pending notice or replay one already consumed.

The final focused component, controller and store tests passed 101 tests, including mixed order, multiple errors, more than four visible-stack events, overflow in either priority, dismissal before rendering and repeated identical errors. Private focused log SHA-256 `b9d75dbc0a732edecd5c0b884a4a0f5301602112c44fc263b87abc497910bbdb`. The earlier fast check passed before reducing the per-priority bound from 64 to eight and does not verify that final change.

Two browser checks passed in installed Edge with generated media and system FFmpeg: a failed import populated the urgent region and a finished export populated the polite region. Private browser log SHA-256 `36d44b2685f4c88ff2fdbac7afc8a323ea4163bdbb7d7580af49b91aa72cd7f1`; the inspected export screenshot SHA-256 `7f63270f250092749c6e645a0aaa06a0f3500b6c4db9df65f9a69216b15a7933` shows a running export, not a native desktop result.

## Limits and continuation

The queues are bounded, and an overflow summary is not the omitted messages themselves. Separate regions can be processed or interrupted differently by actual screen readers; tests of DOM state cannot guarantee spoken order or that every message is voiced. Do not mark S01.06 complete without the written keyboard and actual assistive-technology checks. Native Windows, DPI and packaged FFmpeg validation remain separate. No private user media was used.

The first host-authorized full `pnpm check` at application/test head `8a104aa7fd8950795fb2fd10ac34e0adb02b1da3` stopped at dead-code analysis because `PendingAnnouncements` was exported but not imported; tests in that full run did not start. Private failed log SHA-256 `802c55e1759018217a7e1e64fea895e70eca970d920beaded35dcfc9326e08b`. Type-only correction `3183a609eec3ee7bc68d1da0420848daad0067a3` keeps the interface internal and passed focused `pnpm deadcode`; the earlier runtime/browser checks apply to unchanged emitted behavior. Host-authorized full `pnpm check` then passed at the corrected head: 1,889 package tests passed, 67 skipped and 17 script tests passed. Private retry log SHA-256 `db0523c8588aacd1c1013698a40245ccc7ee45b5ca62f7235655305997edfb18`. Review the candidate.
