---
type: Guide
title: S01.05 chat shutdown recovery child receipt
description: Reproduction and validation of task persistence when a chat runner outlives shutdown.
tags: [implementation, server, tasks, recovery]
status: draft
generated:
  by: process:implementer
  at: 2026-11-01T19:40:00Z
---

# S01.05 chat shutdown recovery child

**State: VERIFIED with self-review**, [issue #158](https://github.com/sahamo123/dax-editor/issues/158), [PR #159](https://github.com/sahamo123/dax-editor/pull/159), tested commit `368fd843ba4fd7984e0d12c49440b5a2914ec4dc`, tree `29d5594007798172d57c5a1f5807be5d5079a6f2`, parent [#151](https://github.com/sahamo123/dax-editor/issues/151). Baseline is [PR #156](https://github.com/sahamo123/dax-editor/pull/156), tested commit `082314a691f1ee1720beaf85c8c1280858727842`. Recovery acceptance [#157](https://github.com/sahamo123/dax-editor/issues/157) remains open.

The full #157 browser run ended with 61 passes, two skips and one failure: an isolated task data directory was nonempty during cleanup after server shutdown. Its private log SHA-256 is `b1cf200bc46531652f669b431bfcc9e76c8635bdefd486bf05a8b563fe389eb`. A deterministic server regression independently reproduced the same cleanup symptom with a deliberately uncooperative runner; when test cleanup was delayed, it showed `tasks.json` still contained running/queued records after close. This establishes a shutdown-ordering defect, but not the precise cause of the original browser failure.

The scoped fix seals active chat before the final task flush, preserves explicit cancellation and failures, records remaining queued work as interrupted, and refuses late guarded commands/events. It does not claim to sandbox arbitrary direct session access by injected code. Restart must not replay interrupted tasks. The selected tests use local generated state and no real provider.

The focused queue suite passed 10 tests, including delayed-provider and explicit-cancel regressions. `pnpm check` passed: 1,819 package tests, 67 skipped, and 17 script tests. Private log SHA-256 `09d8521aeeded953db4770447a69f7b88e11f61872b35bc25177a5c060cca41a`. The task status, reconnect and composer browser scenarios passed three repeats (18 tests), including three executions of the originally failing cleanup scenario; private log SHA-256 `6d092c1882274ff089e8497d3452a07967d63a3e53e523fc1361c7df5a048cc9`. Tests used system FFmpeg and a browser; native packaged operation remains separate. The deterministic failed regression log SHA-256 is `c40422b4a7eaff8464fa6e61b6b8b3912484083792684e5d235ffc9626fee203`.

The published diff, clean worktree and both log hashes received a separate self-review, not an independent review. The full #157 browser suite must still run on a tree including this fix. Do not call the earlier failed browser run a pass. S01.05 and all dependent stages remain in progress or not started.
