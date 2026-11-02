---
type: Guide
title: S01.06 recovered job outcome notices
description: Reproduction and verification of job completion and failure notices recovered from snapshots.
tags: [implementation, accessibility, tasks, recovery]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T15:05:00Z
---

# Recovered job outcome notices

**State: IN_PROGRESS.** [Issue #245 / draft PR #246](https://github.com/sahamo123/dax-editor/pull/246), `codex/s01-06-snapshot-job-notices`, application/test head `7f0282a173dd1bf2a668f03ab29a95af3e419c79`, builds on [PR #244](https://github.com/sahamo123/dax-editor/pull/244) documentation head `19e4fbf50f894920c086f7227b947900b12d8477`. The S01.06 parent remains open.

## Reproduction and change

The controller previously updated a running job to done or error from a state snapshot without issuing the corresponding notice. It also ignored a first-observed terminal live event. Five deterministic controller cases failed before the change: snapshot success, snapshot error, terminal-only live error, recovered preview and HTTP reconnect refresh (private log SHA-256 `6daf9444a7b9f35efc890074a983c0aa0fdab7253e33da47f8a247baa56f1ec8`).

The candidate shares transition handling between accepted snapshots and live job events. A previously known running job becoming terminal produces the existing success/error message once; a first-observed live terminal event can also notify. An initial historical terminal snapshot remains silent, repeated terminal messages and stale running updates do not repeat a notice, and preview notices do not expose cache filenames. Job state and edit commands are unchanged.

## Verification and limits

Focused controller, store and component checks passed 108 tests, including both event/snapshot orderings and success/error live-region DOM updates (private log `2c50f25eb4a08d4264899f9a6595d13d435ef966a126452a5199d72871375775`). Thirteen generated-video Edge browser checks passed, including import/export workflows and a synthetic WebSocket snapshot for simultaneous success and failure notices, duplicate terminal events and stale running events (log `a0d58d64f08871ba9f802968ebed9f9b178ebcf780b88195c64999dd1086f83c`). The new snapshot test mocks the WebSocket event stream; it is not a real disconnect or actual assistive-technology observation. System FFmpeg was used diagnostically.

Host-authorized `pnpm check` passed at `7f0282a173dd1bf2a668f03ab29a95af3e419c79`: 1,903 package tests passed, 67 skipped, and 17 script tests passed (private log `ba13d1573f04567f96b18d6b02cd9a0bdeb4dfd166485982f89ba35c67f0fe37`). No private user media was used.

If both live events are missed and the job first appears terminal in a snapshot, it is indistinguishable here from historical work and remains silent. Locally initiated jobs whose returned IDs can resolve that ambiguity are tracked separately in [#247](https://github.com/sahamo123/dax-editor/issues/247); do not claim complete reconnect notification coverage. Actual screen-reader speech, keyboard-only picker and packaged Windows/DPI acceptance remain open. Review remains pending. Revert the scoped application commit through review if needed; preserve prior evidence and private projects.
