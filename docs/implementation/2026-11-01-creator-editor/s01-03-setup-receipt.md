---
type: Guide
title: S01.03 setup and contextual inspector receipt
description: Evidence and outstanding checks for the skippable setup and contextual-inspector workspace slice.
tags: [implementation, workspace, setup, testing, evidence]
status: draft
generated:
  by: process:implementer
  at: 2026-11-01T15:25:00Z
---

# S01.03 setup and contextual inspector

**State: VERIFIED (self-reviewed).** [Issue #142](https://github.com/sahamo123/dax-editor/issues/142), [PR #143](https://github.com/sahamo123/dax-editor/pull/143), tested commit `6ecf3b533df2029eda17699dbfc7c32d7598a689`, tree `d76163a2df2fe41e0b9187a86cfadd60876d3112`. Before entry, rechecked [issue #140](https://github.com/sahamo123/dax-editor/issues/140), [PR #141](https://github.com/sahamo123/dax-editor/pull/141), tested head `f3f019e353493a6050959170c72e33a73dc1b2ae`, tree `8875ec18156a129b38447894051c57626fc8223e` and current ancestry. The approved [workspace contract](../../specs/workspace-design-contract.md) is proposed design, not prior UI acceptance.

## Implementation

The empty-project surface offers Start editing and a Project options entry that opens the existing project tools, with a top-bar Project setup entry to reopen setup or show those tools for a populated project. New projects show setup; explicitly opened/copied projects enter the editor, and an initially loaded saved project bypasses setup. Skipping or Escape changes only viewer UI state and returns focus to the setup control; clip selection continues to open Inspector without moving focus. The existing controller and typed registry still own mutations; no project schema, history or provider semantics changed. Narrow-window setup was inspected in the full browser run; broader responsive layout remains S01.04.

## Evidence so far

- The new isolated browser test initially failed because the controls did not exist. An intermediate run exposed a timing race in the test's Escape action; it now waits for the explicitly restored focus. A later missing Project settings entry also failed before implementation. A subsequent full browser suite failed seven settings-related tests because that label ambiguously matched existing Settings selectors; it was renamed Project options. The final full browser rerun passed those tests and all **3** setup/inspector tests.
- `pnpm --filter @dax/desktop exec vitest run src/app/controller.test.ts` passed **21 tests**, including initial saved-empty and copied-empty project entry, successful new/open and failed-copy setup-state transitions.
- Final `pnpm check` passed on November 1 with explicitly selected system FFmpeg/ffprobe: **1,804 package tests passed, 67 skipped**, plus **17 script tests passed**. Private log: `artifacts/s01-03-check-final-5d6765b7e15b453f8aa5d16b2a946261.log`. The earlier full pass preceded two additional controller tests and the Project options entry. These are source/system-tool results, not packaged native acceptance.
- Final `pnpm --filter @dax/desktop test:e2e` passed **42 tests**, with the two opt-in offline/performance tests skipped. Private run: `artifacts/s01-03-browser-recheck-9307a175ae314bf0b532faf0c5e98a10/`. The first-run 1440×900 and small-window 1000×640 after-states were visually inspected; their SHA-256 values are `c7c8e4b2fc58168a719c7820f126ad604428445e0a96b5a8600939d8d96f52a7` and `043d942118baf8364df2a84991e0d83c829cccbb632c77ac4cd37fe0feba61a9`. The [S01.01 1440×900 screenshot](evidence/s01-01/empty-1440x900.png) is the approved before-state. The earlier failed run is preserved in `artifacts/s01-03-browser-final-319dffe44d01432d9d6687ffd235db7d/`; it was not counted as a pass. Other screenshots remain private; do not upload them without checking privacy and applicable approval.
- The separate opt-in offline walkthrough passed grouped undo/redo, save/reopen, revision-bound rendered review and full decoded six-second 640×360 audio/video export before the final Project options button was added and renamed; engine/export code was unchanged afterward. Its private `artifacts/s01-03-offline-55853159d7e54a0cb65fb809ef409897/result.json` SHA-256 is `9dedf643063f38fd845906677b3e448082daf624cad65a9aae163becf5732bdd`. Browser non-loopback requests were blocked; OS networking was not disabled. The saved project copy references temporary paths and needs relinking outside that test.
- The full check passed the existing server Planning and non-cancelling-steering tests; the browser suite separately exercised queued Planning and explicit Stop with a scripted assistant. These do not constitute an actual external-client or live-model acceptance.

## Remaining and recovery

The coordinator separately reviewed the published diff and evidence; this was self-review, not independent review. The issue and draft PR remain open for integration. The compact drawer and wasted preview width are S01.04 work, not claimed fixed here. Preserve `.dax-data`, ignored artifacts and original user projects. Native Windows/DPI and packaged runtime remain separate later gates.
