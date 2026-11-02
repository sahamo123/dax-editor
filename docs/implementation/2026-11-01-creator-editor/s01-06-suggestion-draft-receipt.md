---
type: Guide
title: S01.06 suggestion draft preservation
description: Reproduction, scoped composer change and validation for preserving an unrelated draft.
tags: [implementation, chat, recovery, accessibility]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T11:00:00Z
---

# Suggestion draft preservation

**State: IN_PROGRESS.** [Issue #229 / draft PR #230](https://github.com/sahamo123/dax-editor/pull/230), branch `codex/s01-06-suggestion-draft`, application/test head `f1aaee63e558aba57e51fac6c3a4951667121f83`, builds on [PR #228](https://github.com/sahamo123/dax-editor/pull/228) documentation head `c8d08fa84f2da886e319c1a73bbc9087a564a296`. S01.06 [#162](https://github.com/sahamo123/dax-editor/issues/162) remains open.

## Observation and change

A component regression demonstrated that clicking a suggestion sent that text and erased a different existing composer draft. The candidate keeps the unrelated draft, but clears a draft that matches the submitted suggestion after trimming; definitively rejected submissions still recover the original draft and selected attachments. Suggestion buttons are disabled while a request is being submitted. The requested message, mode and attachment handling remain unchanged; no request is automatically resent.

The initial new test failed on the original implementation because the unrelated draft became empty. A second test failed during development when a matching attempted draft remained, then passed after correcting that edge case. The final focused component suite passed 46 tests, including attachment recovery, matching and unrelated drafts, and pending submission. The earlier fast check passed before the final matching-draft correction, so it is not evidence for that final change.

Two generated-video browser scenarios passed in installed Edge with a scripted assistant and system FFmpeg. The final private browser log SHA-256 is `d9f9b3cd32a5855f2050ef515e0dd741dafa93463e43ceabe053e8b328f3225c`; the visually inspected screenshot SHA-256 is `87b6f23e70ca0b3896d60552116de2e73257a2cbe44bb1cc5912e7c63ab3acf3`. The screenshot was captured while preview preparation was still in progress; it shows the retained draft and completed title operation, not playback or native acceptance.

## Next checks

Host-authorized full `pnpm check` passed at the application/test head: 1,882 package tests passed, 67 skipped, and 17 script tests passed. Private log SHA-256 `60734e75ff7b676560b8bf2dda28a5d5c0c924d3258e997e063aca9afc036048`. Review the diff and do not treat this child as completing S01.06. Actual keyboard-only import, post-change Narrator speech, native Windows and DPI gates remain separate. No private projects or user media were used.
