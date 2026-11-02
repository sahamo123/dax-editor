---
type: Guide
title: S01.06 task cancellation names receipt
description: Reproduction and verification for distinguishable task cancellation controls.
tags: [implementation, accessibility, tasks, testing]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T01:18:00Z
---

# S01.06 task cancellation names

**State: IN_PROGRESS.** [Issue #179](https://github.com/sahamo123/dax-editor/issues/179), parent [#162](https://github.com/sahamo123/dax-editor/issues/162). This independent child starts from self-reviewed documentation handoff [PR #178](https://github.com/sahamo123/dax-editor/pull/178) head `44ccac4c1111a0e1de0ebb30de96b167a01c036a`, tree `04da280f4c2e29658c14bc8f4b1210b4bb7d606d`; the underlying application and checks remain those of [PR #174](https://github.com/sahamo123/dax-editor/pull/174).

Every queued or running task previously exposed an identical accessible button name, `Cancel task`, even when several jobs shared the same title. A pre-fix component regression with two identical titles failed to locate the task-specific names; private log SHA-256 `180f8764d69dd15c1792a44b09635356121e9a31b5fa0d056f5e65a5273c48da`. The candidate retains the visible label and appends the task title and unique ID to its accessible name; no task data is transmitted. The focused component suite passed 35 tests and verified cancellation targets the intended ID; private log `fc48baf48cacc237e6b1cec021a1e1093aca6818fc573a4307f40f44f1e6f847`. Two Chrome browser regressions passed for queued and active cancellation, private log `1ee573db5f74101889dfcfa596063c1b4785bf1130ebbbd76de49b1345cde598`.

The title is now whitespace-normalized and limited to 80 characters before the task ID, so a long prompt does not become an excessively long button name. The final component suite passed 36 tests, including repeated titles and a long-prompt case; private log SHA-256 `13337d260952f3de7ef8b9e4d5837b6d6455c554c1ba549437c30b933b67e86b`. The final two Chrome browser regressions passed, private log `a38241321afbba28349467759f14ec52e60f0271de83b27b43e2b245d93fd87a`. An earlier full check was interrupted intentionally when the label was refined; its private log SHA-256 `92be32b14f2feab523eec9c963df44d68e5aa6d9047cdc828d30eb31789612ef`. The final authorized `pnpm check` passed: 1,824 package tests passed, 67 skipped and all 17 script tests passed; private log SHA-256 `6dd361c51f0885500ad4814f02803d6094da31ab6ad8859d594113c17d28e6eb`. Publication and separate self-review remain pending. Browser tests use a scripted assistant, generated media and system FFmpeg. These accessible-name checks do not observe screen-reader speech or complete the native keyboard gate [#177](https://github.com/sahamo123/dax-editor/issues/177); no S01.07 advancement is permitted.
