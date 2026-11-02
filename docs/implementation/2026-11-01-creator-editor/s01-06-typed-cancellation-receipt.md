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

**State: IN_PROGRESS.** Foundation [#254 / draft PR #255](https://github.com/sahamo123/dax-editor/pull/255), application/test head `7c0a9b401d0a1ffe63f03936b0fe3741005134c2`; dependent [#253 / draft PR #256](https://github.com/sahamo123/dax-editor/pull/256), application/test head `6e32425648e52de20ddc92275a5f61d37cfd077c`. The [contract](../../specs/job-cancellation-outcomes.md) follows the [reproduction](s01-06-job-cancellation-investigation.md). S01.06 and actual accessibility/native acceptance remain open.

## Candidate behavior

Confirmed cancellation carries optional typed metadata while preserving the legacy error-shaped job. The server waits for owned work to settle, distinguishes a genuine error or successful outcome after a cancellation request, and no longer infers cancellation from the text `Cancelled`. The editor uses a polite notice and a neutral local-model state only for the typed outcome. Older untyped errors remain errors.

During self-review, foundation head `f9e470c21c3fd23ab1d4d9940263d2e5cc2c7fd6` was shown to mark a synthetic typed exception as cancelled even without an aborted signal. Corrected head `7c0a9b401d0a1ffe63f03936b0fe3741005134c2` requires the signal; seven focused core tests passed (private log `39e83e2d55fdba600e14a059ac9abd83dbbf2df114ce5b0bd3f9553288fcd373`). An independent full `pnpm check` passed on the earlier head only: 1,940 package tests passed, 67 skipped, 17 script tests passed (log `46a19485f0bd59bd813a42cd8b66ab7e6bd6fc314a95b98c4b70cee21436a545`). A full check on the corrected foundation is running separately; do not attribute the earlier full result to it.

## Verification and next actions

Before the last core boundary correction, focused server checks passed 70 tests (log `461a4c1f7690765a97c453a578b7f8041f82212b39be7af17dbc4348fe7b5eab`), including success/failure races; a later five-test speech check covered cleanup ordering (log `aec7fe0b6d73b4570fd3ec68f5005f01ee3ec44a718951cfb08250f9be60dfa4`). Desktop controller/component checks passed 136 (log `9e2c4937f6c331f1d4102ff22dcb995ff301403f08bd5831955af3e2ca850464`). Engine adapter checks passed 21, and local-runtime server checks passed 21 with five skips (logs `6e8757673bb177651f31bed0bb70af198ada7b6fe80fbdb4555028da291bf60f` and `303e511ac20990ff42b97dc1fee57676b3e6c6888eea2a6658856a4a7afdac61`).

Seven browser checks passed for speech cancellation, a genuine failure after cancellation, generated-media export cancellation, fake local-model cancellation and related notices (log `392eab2f752b828ca6076d762f0123b15c57dcd1ba93b4ad4b910e70e36226d0`). A later 1024×700 visibility check passed (log `b448d4e84353fe6071110c9a40ee45bc71ca035f3f03f402b6496b44a085db47`), but visual inspection found a toast partially covering Settings Save: [#257](https://github.com/sahamo123/dax-editor/issues/257). The screenshot hash is `e6273e53f78e3df251157bf43a879450f13d912eed1e08d42aef1f14a97cd466`. The browser evidence preceded the final core boundary correction and does not establish actual screen-reader speech or native behavior.

1. Finish and record the independent full check on corrected foundation head `7c0a9b401d0a1ffe63f03936b0fe3741005134c2`; inspect any failure rather than replacing it with earlier evidence.
2. Run full `pnpm check` and any affected browser checks on dependent head `6e32425648e52de20ddc92275a5f61d37cfd077c`, update both PRs and record self-review separately from independent review.
3. Investigate and fix [#257](https://github.com/sahamo123/dax-editor/issues/257) with geometry/hit-test evidence; retain the screenshots and do not hide errors behind the modal.
4. Continue S01.06. Actual keyboard-only import and post-change Narrator speech [#177](https://github.com/sahamo123/dax-editor/issues/177), native Windows/DPI acceptance and the intermittent chat focus investigation [#186](https://github.com/sahamo123/dax-editor/issues/186) remain open. No user project or real model download was used.
