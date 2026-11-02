---
type: Guide
title: S01.06 typed cancellation candidate
description: Current evidence, compatibility limits and pending checks for typed cancellation outcomes.
tags: [implementation, accessibility, tasks, cancellation, compatibility]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T16:35:00Z
---

# Typed cancellation candidate

**State: IN_PROGRESS.** Foundation [#254 / draft PR #255](https://github.com/sahamo123/dax-editor/pull/255), application/test head `7c0a9b401d0a1ffe63f03936b0fe3741005134c2`; dependent [#253 / draft PR #256](https://github.com/sahamo123/dax-editor/pull/256), application/test head `23f1417f7b247c7e76f189bfa20a97f907038821`. The [contract](../../specs/job-cancellation-outcomes.md) follows the [reproduction](s01-06-job-cancellation-investigation.md). S01.06 and actual accessibility/native acceptance remain open.

## Candidate behavior

Confirmed cancellation carries optional typed metadata while preserving the legacy error-shaped job. The server waits for owned work to settle, distinguishes a genuine error or successful outcome after a cancellation request, and no longer infers cancellation from the text `Cancelled`. The editor uses a polite notice and a neutral local-model state only for the typed outcome. Older untyped errors remain errors.

During self-review, foundation head `f9e470c21c3fd23ab1d4d9940263d2e5cc2c7fd6` was shown to mark a synthetic typed exception as cancelled even without an aborted signal. Corrected head `7c0a9b401d0a1ffe63f03936b0fe3741005134c2` requires the signal; seven focused core tests passed (private log `39e83e2d55fdba600e14a059ac9abd83dbbf2df114ce5b0bd3f9553288fcd373`). A separate full `pnpm check` on that corrected foundation passed: 1,941 package tests, 67 skipped, and 17 script tests (log `c459ef7e54b6133a3b0e06c7b65e81350e807dc8a06ebdd161a02d0091fcc0ed`). See the [foundation receipt](s01-06-cancellation-foundation-receipt.md); this is not a full pass of the dependent candidate.

## Verification and next actions

Before the last core boundary correction, focused server checks passed 70 tests (log `461a4c1f7690765a97c453a578b7f8041f82212b39be7af17dbc4348fe7b5eab`), including success/failure races; a later five-test speech check covered cleanup ordering (log `aec7fe0b6d73b4570fd3ec68f5005f01ee3ec44a718951cfb08250f9be60dfa4`). Desktop controller/component checks passed 136 (log `9e2c4937f6c331f1d4102ff22dcb995ff301403f08bd5831955af3e2ca850464`). Engine adapter checks passed 21, and local-runtime server checks passed 21 with five skips (logs `6e8757673bb177651f31bed0bb70af198ada7b6fe80fbdb4555028da291bf60f` and `303e511ac20990ff42b97dc1fee57676b3e6c6888eea2a6658856a4a7afdac61`).

Seven earlier browser checks passed for speech cancellation, a genuine failure after cancellation, generated-media export cancellation, fake local-model cancellation and related notices (log `392eab2f752b828ca6076d762f0123b15c57dcd1ba93b4ad4b910e70e36226d0`). On corrected head `23f1417f7b247c7e76f189bfa20a97f907038821`, four cancellation browser checks passed (log `36ecf0643939499cf91bb50101eb0c025fd15173894e60f59fea5c43325c8dc2`). A 1024×700 visibility check passed (log `b448d4e84353fe6071110c9a40ee45bc71ca035f3f03f402b6496b44a085db47`), but visual inspection found a toast partially covering Settings Save: [#257](https://github.com/sahamo123/dax-editor/issues/257). The screenshot hash is `e6273e53f78e3df251157bf43a879450f13d912eed1e08d42aef1f14a97cd466`. Browser evidence does not establish actual screen-reader speech or native behavior.

The first dependent full run failed a live MCP cancellation test (log `139ae3dd96b0a2349cf7597407f6a304e0f2b4738764eaf4552384e27c1f9181`). Corrected source head `d45a051eb89d5bbf307ce7a83ccbaa2d21f59f27` introduced typed Blender aborts and a real MCP assertion; eight core, three Blender and two live-MCP focused tests passed. Its full check passed the MCP case but failed a bridge detector assertion (log `d98846147a3bc1c39f7f8b0f56e2c3c8bd6c9877dfb0c81dd9bf70e6e80f90f4`).

Self-review found process errors could settle before the Blender child closed. Head `23f1417f7b247c7e76f189bfa20a97f907038821` waits for close and keeps genuine process failures, with four focused Blender tests passed. Its full `pnpm check` failed a different bridge detector assertion: 11 package suites passed and script tests did not run (log `164698e551232cec49a86a5b3179d6e1a90a2cf22ed3fa276eeb41c515bc9e51`). The failed assertion's status detail was not printed; its cause is unproven. An isolated 18-test detector run passed, without resolving the full-run failure. Track diagnosis in [#203](https://github.com/sahamo123/dax-editor/issues/203).

An extra `pnpm --filter @dax/engine typecheck` failed nine test-configuration errors in existing unrelated files on both this candidate and the prior foundation; [#258](https://github.com/sahamo123/dax-editor/issues/258) records the baseline. The root `pnpm check:fast` passed at `d45a051eb89d5bbf307ce7a83ccbaa2d21f59f27`.

1. Diagnose the actual bridge detector failure under full-check conditions with bounded fake-CLI instrumentation; do not infer timeout or weaken the security restrictions. Rerun the full check on the exact final candidate after a justified correction.
2. Record a separate self-review and any independent review; keep both PRs draft until their acceptance is supported.
3. Investigate and fix [#257](https://github.com/sahamo123/dax-editor/issues/257) with geometry/hit-test evidence; retain the screenshots and do not hide errors behind the modal.
4. Continue S01.06. Actual keyboard-only import and post-change Narrator speech [#177](https://github.com/sahamo123/dax-editor/issues/177), native Windows/DPI acceptance and the intermittent chat focus investigation [#186](https://github.com/sahamo123/dax-editor/issues/186) remain open. No user project or real model download was used.
