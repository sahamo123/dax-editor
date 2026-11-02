---
type: Guide
title: Bounded task notification bursts
description: Reproduction, bounded queue candidate, verification and rendered-preview follow-up.
tags: [implementation, accessibility, tasks, notifications, testing]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T19:45:00Z
---

# Bounded task notification bursts

**State: IN_PROGRESS / self-reviewed.** [#265 / draft PR #267](https://github.com/sahamo123/dax-editor/pull/267), branch `codex/s01-06-notice-burst-recovery`, corrected application/test head `3b7a9e9aa0e948988c6dcc9acc325a942b69f690`, follows [PR #266](https://github.com/sahamo123/dax-editor/pull/266). This does not complete S01.06.

## Reproduction and candidate

With a synthetic error visible and its modal notification region focused, four later synthetic errors evicted the first notice. The controlled pre-fix regression failed (1 failed, 8 passed; private log SHA-256 `0de4b20b66ca0fe3267ab349f6bc031e01f61138d4427319e98959038741c583`).

The candidate retains four visible notices and a FIFO queue of 32; dismissal or expiry promotes waiting notices with their own full lifetime. Visible notices are never displaced by a burst. When the queue is full, a new error displaces the newest queued non-error, or is omitted if none exists; other incoming notices are omitted. A persistent, dismissible warning reports omitted details and suggests Work for task results without claiming all messages are recoverable. Counts saturate, notices stay session-only, waiting errors are identified, focus remains in the notice area on dismissal, and priority-aware announcements remain separate. The [contract](../../specs/dialog-notice-placement.md) sets the limits.

## Verification and limits

- Focused component/controller checks passed 95 tests, covering focus and hover, FIFO promotion and expiry, priority, all-error overflow, retained notices, dismissal, nested dialogs and announcement stability. A controller test was updated to simulate clearing the bounded stack before checking subsequent outcomes.
- The first browser burst check found focus unexpectedly lost as notice counts changed; preserving the region attributes until the area is empty corrected the behavior. A seven-check browser run passed before final copy/test changes. On exact corrected head, six checks passed but the generated-media rendered-preview notice timed out; the failure snapshot showed a disconnected test editor and cancelled review. The failure and a passing isolated retry are tracked in [#268](https://github.com/sahamo123/dax-editor/issues/268); neither establishes a cause. Failed suite log SHA-256 `d5e09478c74a863153e02b1d4bea9576422920b05d75b3335f44999684097653`; isolated retry `e045e36232e6bc6a5d15f78b5a18d92ba570fd8e6b3668c269e8c600ff8d48bc`.
- The exact-head compact burst screenshot was inspected; waiting status is visible before the scrollable notices, and the Settings footer remains reachable. Its SHA-256 is `8276d754278a9137c2bccf28c96358fd3e3595fed47099a89412d7e9ce7a3808`.
- The first full check on `550bec4af075e82cbbed955e3c4e9953d45f4eb4` failed TypeScript on a test element type (log `cbd8f80365bdd636abea0cd0afad225b4bf64f8fb39bc921caaf582a270882cc`). Correcting the test type yielded a passing full `pnpm check` on `3b7a9e9aa0e948988c6dcc9acc325a942b69f690`: 1,967 package tests passed, 67 skipped, 17 script tests passed; private log `2364af728feea18b30c8fa8cfb141147a971b36418906858806a47c547b17007`.
- Self-review inspected ordering, bounded storage, error preference, overflow honesty, focus, timers and test failures. It is not independent review. Browser tests use diagnostic system FFmpeg and do not establish packaged native execution, actual screen-reader speech or complete keyboard-only import. Those gates and S01.06 remain open.
