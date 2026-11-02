---
type: Guide
title: S01.06 bridge probe error classification
description: Distinguish unsuccessful CLI capability probes from verified missing options without relaxing restrictions.
tags: [implementation, bridges, testing, security]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T06:43:00Z
---

# S01.06 bridge probe error classification

**State: IN_PROGRESS.** [Issue #203 / draft PR #205](https://github.com/sahamo123/dax-editor/pull/205), application/test head `84a1c09e20dff39d4dc10e39e9f37e454205ac1d`, follows [draft PR #204](https://github.com/sahamo123/dax-editor/pull/204) documentation head `f034dbf908656109a5cadef2cc867200aaafce15`.

The prior full repository run failed a slow-authentication bridge test: it expected `error` but saw `unsupported`. The log did not capture the probe stage, and one isolated retry passed. A help-probe timeout under load is plausible but not proven as the cause of that particular failure. Preserve the full failure in the [chat recovery receipt](s01-06-chat-attachment-recovery.md).

Independent fake-CLI tests confirmed that a timed-out or nonzero help command was classified as `unsupported` before inspecting any reliable capability output. The detector now reports an unsuccessful or timed-out version/help probe as `error`, keeps it unavailable and asks the user to retry or check the installation. Only a successful help response missing required flags is classified `unsupported`. Authentication is not started after a failed help probe, no install is returned, and the tool allow-list, required flags, credential handling and CLI invocation remain unchanged.

Before the fix, both added help-probe tests failed, log SHA-256 `12e6f1017dc21f64b7ee9591d143dcf2133e6da9afdc1e4cf41d5bec9c5b6550`. The bridge package subsequently passed 108 tests with one platform-specific skip, log `3c62b0cbe68c948c16e248789c353188f9a857d9ee8b02fdc88ee6215d91694f`. A small additional fail-closed check for the timeout/spawn-error flags was followed by 17 passing detection tests, log `209bfca8dfe032e29771c1db96b8867f077da2d5b555c001d96aca83db9fd8b2`. The slow-auth test now gives the prerequisite version/help processes more startup time and asserts that the auth probe actually ran; it still relies on real process timing and is not proof against every possible machine stall.

Detector source SHA-256 `7b20d4391f045617c2b306d9a808137acae92d0987c4e6fcc168f67ff32dace8`; detection test `3d8152ea0cada43e598bf5da494fbe1acfb6d9a5d0f4869c724a29127df25cd2`. Full `pnpm check` passed on the combined application/test head above: 1,836 package tests passed, 67 skipped, and 17 script tests passed; private log SHA-256 `b82c0df8e2570eb9b1fa36dd8583394ef1f61f37535d9494e8fcdcffd9810c45`. This later pass does not prove the stage of the earlier intermittent failure. Review remains pending. No real CLI, user credentials or external network service was used in these tests. S01.06 and native acceptance remain open.
