---
type: Guide
title: S01.06 typed cancellation foundation
description: Evidence and compatibility boundary for core, protocol and local-model cancellation identity.
tags: [implementation, cancellation, compatibility, testing]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T16:45:00Z
---

# Typed cancellation foundation

**State: IN_PROGRESS.** [Issue #254 / draft PR #255](https://github.com/sahamo123/dax-editor/pull/255), application/test head `7c0a9b401d0a1ffe63f03936b0fe3741005134c2`, follows [diagnostic PR #252](https://github.com/sahamo123/dax-editor/pull/252). The dependent server and desktop candidate [#253 / PR #256](https://github.com/sahamo123/dax-editor/pull/256) is separately tracked. This foundation alone does not change user-facing cancellation notices.

The [contract](../../specs/job-cancellation-outcomes.md) retains the legacy job status and error while allowing optional typed cancellation metadata. Core command outcomes preserve explicitly signalled aborts; unrelated failures remain failures. Known local-model download and start cancellation types retain their identity across the adapter boundary.

Self-review found that earlier head `f9e470c21c3fd23ab1d4d9940263d2e5cc2c7fd6` classified a synthetic typed exception as cancelled even without an aborted signal. The corrected head requires the signal and passed seven focused core tests (private log SHA-256 `39e83e2d55fdba600e14a059ac9abd83dbbf2df114ce5b0bd3f9553288fcd373`). The earlier independent full check passed 1,940 package tests with 67 skipped and 17 script tests (log `46a19485f0bd59bd813a42cd8b66ab7e6bd6fc314a95b98c4b70cee21436a545`); it does not verify the correction.

An independent host-authorized `pnpm check` passed on corrected head `7c0a9b401d0a1ffe63f03936b0fe3741005134c2`: 1,941 package tests passed, 67 skipped and 17 script tests passed (private log `c459ef7e54b6133a3b0e06c7b65e81350e807dc8a06ebdd161a02d0091fcc0ed`). Its separate worktree restored pinned dependencies offline without package scripts; system FFmpeg was diagnostic.

Review remains pending. Complete the dependent candidate's exact-head full check, then address compact toast overlap [#257](https://github.com/sahamo123/dax-editor/issues/257). No live model download, actual screen-reader speech or packaged Windows acceptance is claimed. Preserve user projects and prior evidence.
