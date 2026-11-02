---
type: Guide
title: "Handoff: how another agent resumes dax-editor"
description: "Where the build stopped, what is merged, every dependency and system tool the build needs and where each is pinned, the unfinished patch and its state, and the order of the remaining work. Read this first when resuming from the repository alone."
tags: [handoff, process, agents, dependencies]
status: stable
generated:
  by: process:implementer
  at: 2026-11-01T10:00:00Z
---

# Handoff: resuming dax-editor

## Current contrast child — November 2, 2026

[#241 / draft PR #242](https://github.com/sahamo123/dax-editor/pull/242), branch `codex/s01-06-overlay-label-contrast`, has application change head `6a52fe4120f80845446cf9e9a0212ddebab74974` and test correction `7e0989e58bf4fc45858cd9dd53bb73ca10720a17`. Five browser checks and full `pnpm check` passed. See the [receipt](../implementation/2026-11-01-creator-editor/s01-06-overlay-label-contrast-receipt.md). Review and S01.06 acceptance remain open.

## Current continuation — November 2, 2026

The latest [#177](https://github.com/sahamo123/dax-editor/issues/177) recheck on PR #239 opened the Windows picker by keyboard but could not target it or select a file. Automatic approval review rejected reading the entire Narrator recap because it could contain unrelated private speech. The owned test browser, services and Narrator session were closed. See the [receipt](../implementation/2026-11-01-creator-editor/s01-06-native-acceptance-receipt.md); do not bypass the rejection or advance S01.06.

The current child is [#238 / draft PR #239](https://github.com/sahamo123/dax-editor/pull/239), branch `codex/s01-06-tab-panel-access`, application/test head `5706eae39e484e114081bb48b723cebda7f9f1d9`. Full source checks and affected browser checks passed; see the [receipt](../implementation/2026-11-01-creator-editor/s01-06-side-panel-accessibility-receipt.md). Review and actual native/accessibility acceptance remain open.

The current child is [#235 / draft PR #237](https://github.com/sahamo123/dax-editor/pull/237), branch `codex/s01-06-modal-focus-recovery`, application/test head `1c59e472ab99a9cb8697d6b2fc1e782a854f3575`. Focused, generated-video browser and full source checks passed; review remains pending. See the [receipt](../implementation/2026-11-01-creator-editor/s01-06-modal-focus-recovery-receipt.md). S01.06 and actual native/accessibility acceptance remain open.

The current child is [#234 / draft PR #236](https://github.com/sahamo123/dax-editor/pull/236) on `codex/s01-06-modal-focus-loss`, application/test head `8658ee94f0c5d279eaf3a20dcb2cca29ffa80335`. Focused, browser and full source checks passed. Actual modal focus containment is separately tracked in [#235](https://github.com/sahamo123/dax-editor/issues/235). See the [receipt](../implementation/2026-11-01-creator-editor/s01-06-modal-focus-loss-receipt.md). S01.06 remains open.

The current S01.06 child is [#232 / draft PR #233](https://github.com/sahamo123/dax-editor/pull/233) on `codex/s01-06-batched-announcements`. Focused checks passed at `8a104aa7fd8950795fb2fd10ac34e0adb02b1da3`; its full check failed an unused type export. Corrected head `3183a609eec3ee7bc68d1da0420848daad0067a3` passed full `pnpm check`; see the [receipt](../implementation/2026-11-01-creator-editor/s01-06-batched-announcements-receipt.md). Keep actual speech and native acceptance open.

An unattended [#177 / draft PR #231](https://github.com/sahamo123/dax-editor/pull/231) browser recheck on `codex/s01-06-unattended-picker-recheck` reached Import by keyboard, but no native file dialog was exposed as a target; see the [receipt](../implementation/2026-11-01-creator-editor/s01-06-native-acceptance-receipt.md). Continue independent work without asking the away user to participate. S01.06 remains open.

Start with the [cross-laptop guide](laptop-continuation.md), [status](../STATUS.md) and [dated handoff](../implementation/2026-11-01-creator-editor/handoff.md). The current S01.06 child is [#229 / draft PR #230](https://github.com/sahamo123/dax-editor/pull/230) at application/test head `f1aaee63e558aba57e51fac6c3a4951667121f83`; focused and full source checks passed. Keep S01.06 and native acceptance open. All continuation headings below are historical snapshots, not instructions to resume their older branches.

## Current S01.06 bridge probe errors — November 1, 2026

Continue [#203 / draft PR #205](https://github.com/sahamo123/dax-editor/pull/205) on `codex/s01-06-bridge-probe-errors`, application/test head `84a1c09e20dff39d4dc10e39e9f37e454205ac1d`, based on [draft PR #204](https://github.com/sahamo123/dax-editor/pull/204) head `f034dbf908656109a5cadef2cc867200aaafce15`. Fake-CLI and combined full checks passed; review remains pending. The original full-check failure's exact probe stage is unproven. See the [receipt](../implementation/2026-11-01-creator-editor/s01-06-bridge-probe-errors.md). S01.06, project/provider context [#201](https://github.com/sahamo123/dax-editor/issues/201), and native gates remain open. Earlier headings are historical.

## Current S01.06 chat attachment recovery — November 1, 2026

Continue [#200 / draft PR #204](https://github.com/sahamo123/dax-editor/pull/204) on `codex/s01-06-chat-attachment-recovery`, application/test head `85ae44268e4228e2f8f6efc7936e8e4688c7d8d0`, based on [draft PR #199](https://github.com/sahamo123/dax-editor/pull/199) head `e193332cdb533d38e98a848a0ea9a9e6e1970f31`. Focused tests passed; an earlier full check failed bridge test [#203](https://github.com/sahamo123/dax-editor/issues/203), and a later combined full check passed with that candidate fix. Review remains pending. See the [receipt](../implementation/2026-11-01-creator-editor/s01-06-chat-attachment-recovery.md). Investigate project/provider context [#201](https://github.com/sahamo123/dax-editor/issues/201) and staged-file retention [#202](https://github.com/sahamo123/dax-editor/issues/202) separately. S01.06 and native gates remain open. Earlier headings are historical.

## Current S01.06 handoff integrity — November 1, 2026

Continue [#198](https://github.com/sahamo123/dax-editor/issues/198) on codex/s01-06-handoff-integrity, based on draft PR #197 documentation head fce4a5479989d511902bf846c184c450ddef2e9e. Two corrupted commit references below were restored from verified Git objects; [draft PR #199](https://github.com/sahamo123/dax-editor/pull/199) is published at evidence head `399b872a0205d3101d02bce8e24f09d162f2e8ee`; review remains pending. S01.06 keyboard, screen-reader and native gates remain open. Earlier headings are historical.

## Current S01.06 inspector and export contrast — November 1, 2026

Continue [#196](https://github.com/sahamo123/dax-editor/issues/196) on codex/s01-06-inspector-export-contrast, based on [draft PR #195](https://github.com/sahamo123/dax-editor/pull/195) head `a07befd27e9b372379bd7d2a187b3a2a53955943`. Five browser checks and fast checks passed sequentially after an earlier overlapping-build failure; [draft PR #197](https://github.com/sahamo123/dax-editor/pull/197) is published at test head `65eb6458a3db471b13803e02fa6ab3e76705bdde`; review remains pending. See the [receipt](../implementation/2026-11-01-creator-editor/s01-06-panel-contrast-receipt.md). S01.06 and native/DPI gates remain open. Earlier headings are historical.

## Current S01.06 relink evidence — November 1, 2026

Continue [#194](https://github.com/sahamo123/dax-editor/issues/194) on codex/s01-06-relink-evidence, based on [draft PR #193](https://github.com/sahamo123/dax-editor/pull/193) head `05a4651986a411306c3f28e71a5a73dd4a8c5461`. The strengthened relink tests passed at both viewport sizes; [draft PR #195](https://github.com/sahamo123/dax-editor/pull/195) is published at test head `a9f1eaaee79d16f39b5325ab4431060ac1b99e82`; review remains pending. See the [receipt](../implementation/2026-11-01-creator-editor/s01-06-media-actions-receipt.md). S01.06 and native gates remain open. Earlier headings are historical.

## Current S01.06 keyboard recheck — November 1, 2026

The fresh synthetic keyboard attempt on [#177](https://github.com/sahamo123/dax-editor/issues/177) reached the Windows Open dialog, but the automation tool could not target that dialog for input. The file was not selected and the complete keyboard workflow remains open. See the [receipt](../implementation/2026-11-01-creator-editor/s01-06-native-acceptance-receipt.md). Continue on codex/s01-06-keyboard-recheck; actual screen-reader, native and DPI acceptance remain open. Earlier headings are historical.

## Active S01.06 media card actions — November 1, 2026

Continue [#190](https://github.com/sahamo123/dax-editor/issues/190) on `codex/s01-06-media-actions`, based on [draft PR #191](https://github.com/sahamo123/dax-editor/pull/191) documentation head `c3f0796069191a8e5d059c969b3b528ae30fb583`. Generated-video browser checks passed; full `pnpm check` passed and [draft PR #192](https://github.com/sahamo123/dax-editor/pull/192) is published at application/test head `7e1595b6a2c5e63b5f426383b4d085547102169c`; review remains pending. See the [receipt](../implementation/2026-11-01-creator-editor/s01-06-media-actions-receipt.md). S01.06 and native acceptance remain open; earlier headings are historical.

## Active S01.06 contextual contrast — November 1, 2026

Continue [#189](https://github.com/sahamo123/dax-editor/issues/189) on `codex/s01-06-panel-contrast`, based on [draft PR #188](https://github.com/sahamo123/dax-editor/pull/188) head `031b8a00b5f6c0e3274caefcf87e6c90763a3fe9`. Three focused browser contrast checks passed; draft [PR #191](https://github.com/sahamo123/dax-editor/pull/191) is published at test head `2349aebc75b0b9d2af880b6d04ebe2dc1841d63c`; review remains pending. A generated screenshot showed clipped media-card actions; fix [#190](https://github.com/sahamo123/dax-editor/issues/190) separately. See the [receipt](../implementation/2026-11-01-creator-editor/s01-06-panel-contrast-receipt.md). Keyboard-only import, actual Narrator speech and native acceptance remain open. Earlier headings are historical.

## Active S01.06 chat submission investigation — November 1, 2026

Continue [#186 / draft PR #188](https://github.com/sahamo123/dax-editor/pull/188), diagnostic/test head `a1b4d31259e4e32b7dbeece1a360b183acc0940c`, on `codex/s01-06-engine-reconnect`, based on [draft PR #187](https://github.com/sahamo123/dax-editor/pull/187) documentation head `c3ad581055db52e5a716363c6c60fdf21a5c65b9`. The earlier disconnected banner may have been produced by test cleanup. Before teardown, the engine was reachable and socket open, but the synthetic chat prompt had not appeared and no edit was made. The cause is unknown. See the [investigation receipt](../implementation/2026-11-01-creator-editor/s01-06-chat-submission-investigation.md). Complete this scoped investigation without masking failures; keyboard-only and actual screen-reader gates remain open. Earlier entries are historical.

## Active S01.06 live accessibility — November 1, 2026

Continue [#185 / draft PR #187](https://github.com/sahamo123/dax-editor/pull/187) on `codex/s01-06-live-acceptance`, application/test head `6c3fbea9723fcf17018d736f518e749cb7533860`, based on [PR #184](https://github.com/sahamo123/dax-editor/pull/184) head `0bb231d7848b416be11c2801ef59d08f67aa0081`. The full source check passed in an authorized isolated test environment; the browser suite found an intermittent disconnected-engine failure tracked as [#186](https://github.com/sahamo123/dax-editor/issues/186). The earlier live keyboard/Narrator run was partial: the operator used the mouse in the file picker, heard preview completion, and reported missing export-start/progress and existing-file-error speech. The user is away. Actual post-change speech and complete keyboard-only import remain pending under [#177](https://github.com/sahamo123/dax-editor/issues/177); do not advance S01.06. See the [receipt](../implementation/2026-11-01-creator-editor/s01-06-live-announcement-receipt.md). Earlier headings are historical.

## Active S01.06 setup and error contrast — November 1, 2026

Setup and task-error contrast [#183 / PR #184](https://github.com/sahamo123/dax-editor/pull/184) passed focused browser, fast, dead-code and docs checks and was separately self-reviewed at test/docs head `6fdb6a7f7958b723c618226d02ae42dce4753ffe` (not independently reviewed). The earlier full check is reused only for unchanged application source. Actual keyboard-only and Narrator acceptance [#177](https://github.com/sahamo123/dax-editor/issues/177) remain blocked on computer-use access. Do not advance to S01.07. See the [receipt](../implementation/2026-11-01-creator-editor/s01-06-setup-error-contrast-receipt.md). Earlier headings are historical.

## Active S01.06 task-state evidence — November 1, 2026

Task-state label verification [#181 / PR #182](https://github.com/sahamo123/dax-editor/pull/182) passed focused browser, fast, dead-code and docs checks and was separately self-reviewed at test/docs head `78d5acb861b3a6328dd490852f226744fed71bcb` (not independently reviewed). The earlier full check is reused only for unchanged application source. Actual keyboard-only and Narrator acceptance [#177](https://github.com/sahamo123/dax-editor/issues/177) remain blocked on computer-use access. Do not advance to S01.07. See the [receipt](../implementation/2026-11-01-creator-editor/s01-06-task-state-receipt.md). Earlier headings are historical.

## Active S01.06 task cancellation names — November 1, 2026

Task-cancellation naming [#179 / PR #180](https://github.com/sahamo123/dax-editor/pull/180) passed focused component/browser and full source checks and was separately self-reviewed at application/test head `d92bc08a210312d68403a870e3fffac97e584f0e` (not independently reviewed). Actual keyboard-only and Narrator acceptance [#177](https://github.com/sahamo123/dax-editor/issues/177) remain blocked on computer-use access. Do not advance to S01.07. See the [receipt](../implementation/2026-11-01-creator-editor/s01-06-task-cancel-receipt.md). Earlier headings are historical.

## Active S01.06 native accessibility — November 1, 2026

Native accessibility acceptance [#177](https://github.com/sahamo123/dax-editor/issues/177) is BLOCKED on computer-use access. The synthetic test browser's Open dialog is visible, but targeting its transient window was rejected; starting Narrator timed out waiting for app approval. No actual screen-reader speech or complete keyboard-only import has been observed. [PR #176](https://github.com/sahamo123/dax-editor/pull/176) was self-reviewed at `abed94254a22c19f436ad5157c599217c1ebbf4d`. The parent S01.06 remains IN_PROGRESS; do not advance to S01.07. See the [receipt](../implementation/2026-11-01-creator-editor/s01-06-native-acceptance-receipt.md). Earlier headings are historical.

## Active S01.06 evidence reconciliation — November 1, 2026

Accessibility evidence reconciliation [#175](https://github.com/sahamo123/dax-editor/issues/175) is IN_PROGRESS on `codex/s01-06-contrast-audit`, based on self-reviewed [PR #174](https://github.com/sahamo123/dax-editor/pull/174) `21c531bc2cd604f9a819c5ee01ff687761ca0808`. A limited opaque-color scan's ruler warning was disproved by rendered geometry; actual ruler contrast measured 8.10:1. This is not a whole-app audit. Actual keyboard-only import and screen-reader speech remain required; native/DPI checks remain separate. See the [receipt](../implementation/2026-11-01-creator-editor/s01-06-audit-reconciliation-receipt.md). Earlier headings are historical.

## Active S01.06 history contrast — November 1, 2026

History contrast [#173](https://github.com/sahamo123/dax-editor/issues/173) is IN_PROGRESS on `codex/s01-06-contrast-sweep`, based on self-reviewed [PR #172](https://github.com/sahamo123/dax-editor/pull/172) `3f5a185e6861268621c21bbe0f68138a5ea528b5`. The focused browser checks pass after improving history text and labelling other-branch entries. The full source check and final focused browser tests passed; fast checks for the later test-only assertion also passed; publication and self-review remain pending. Actual assistive-technology and native/DPI evidence remain open. See the [receipt](../implementation/2026-11-01-creator-editor/s01-06-history-contrast-receipt.md). Earlier headings are historical.

## Active S01.06 dialog shortcuts — November 1, 2026

Dialog shortcut isolation [#171](https://github.com/sahamo123/dax-editor/issues/171) is IN_PROGRESS on `codex/s01-06-dialog-shortcuts`, based on self-reviewed [PR #170](https://github.com/sahamo123/dax-editor/pull/170) `5f766c48f1ec329b8d111593ee638849681f717f`. Component tests reproduced split/delete and undo behind a modal; candidate focused and browser tests pass, as does the host-permission full source check. Publication and self-review remain pending. See the [receipt](../implementation/2026-11-01-creator-editor/s01-06-dialog-shortcuts-receipt.md). S01.06 keyboard-only and actual assistive-technology gates remain open; native/DPI evidence is separate. Earlier headings are historical.

## Active S01.06 reduced motion — November 1, 2026

Continue [#168](https://github.com/sahamo123/dax-editor/issues/168) on `codex/s01-06-reduced-motion`, based on self-reviewed [PR #169](https://github.com/sahamo123/dax-editor/pull/169) `bb087001bfd21a8b570a82be2afb09f69fa2a6f1`. Reduced and normal preference browser tests pass; run full checks and separately review the published diff. Confirm publication before switching laptops. Actual assistive-technology and native/DPI evidence remain open. Earlier headings are historical.

## Active S01.06 primary contrast — November 1, 2026

Continue [#165](https://github.com/sahamo123/dax-editor/issues/165) on `codex/s01-06-primary-contrast`, based on self-reviewed [PR #167](https://github.com/sahamo123/dax-editor/pull/167) `ee1c4726c7e4fb03986fe986440521f428dc5b4c`. A rendered test reproduced 3.84:1 hover contrast and the adjusted color passed at 5.79:1; full checks and review remain pending. Confirm publication before switching laptops. Actual assistive-technology and native/DPI evidence remain separate. Earlier headings are historical.

## Active S01.06 export-focus child — November 1, 2026

Continue [#164](https://github.com/sahamo123/dax-editor/issues/164) on `codex/s01-06-export-focus`, based on self-reviewed [PR #166](https://github.com/sahamo123/dax-editor/pull/166) `1a57506035551b4d6cf3ddae414acd54f044274b`. Focused component/browser checks passed; run full verification and review the published diff. Hover contrast #165 and actual assistive-technology acceptance remain open. Check publication before another laptop resumes.

## Active S01.06 accessibility audit — November 1, 2026

Continue [#162](https://github.com/sahamo123/dax-editor/issues/162) on local `codex/s01-06-review-announcements`, starting from self-reviewed [PR #161](https://github.com/sahamo123/dax-editor/pull/161) `594f1866bdc760a76a3bd37659ce1d7c25fe7449`. Its [predecessor receipt](../implementation/2026-11-01-creator-editor/s01-05-task-recovery-receipt.md), issue/PR, tested head and log hashes were rechecked. Confirm publication; conduct keyboard, contrast, reduced-motion and actual assistive-technology work. Do not confuse browser and native verification. Earlier headings are historical.

## S01.05 parent reconciliation — November 1, 2026

All recovery children are self-reviewed; [#157 / PR #160](https://github.com/sahamo123/dax-editor/pull/160) is the final tested application/test head `3760930c9f1de626ab3ce341f8cf2e5823e81e67`. Continue the documentation-only `codex/s01-05-stage-reconciliation` branch, check publication, and separately review the [parent receipt](../implementation/2026-11-01-creator-editor/s01-05-task-recovery-receipt.md) before marking [#151](https://github.com/sahamo123/dax-editor/issues/151) verified. Earlier headings are historical.

## Active S01.05 combined recovery — November 1, 2026

Continue [#157](https://github.com/sahamo123/dax-editor/issues/157) on `codex/s01-05-recovery-acceptance-v2`, based on self-reviewed [shutdown PR #159](https://github.com/sahamo123/dax-editor/pull/159), head `368fd843ba4fd7984e0d12c49440b5a2914ec4dc`. Check publication before switching laptops. The [receipt](../implementation/2026-11-01-creator-editor/s01-05-recovery-acceptance-receipt.md) records the failed earlier run and the pending combined browser suite; earlier headings are historical.

## Active S01.05 shutdown recovery — November 1, 2026

Continue [#158](https://github.com/sahamo123/dax-editor/issues/158) on `codex/s01-05-chat-shutdown`, based on self-reviewed [PR #156](https://github.com/sahamo123/dax-editor/pull/156), head `082314a691f1ee1720beaf85c8c1280858727842`; check publication before resuming on another laptop. The [receipt](../implementation/2026-11-01-creator-editor/s01-05-shutdown-receipt.md) records the failed browser run and deterministic shutdown regression. Separate [#157](https://github.com/sahamo123/dax-editor/issues/157) recovery tests remain in an isolated worktree and need revalidation on the fixed baseline. Earlier headings are historical.

## Active S01.05 failure visibility — November 1, 2026

Continue [child #153](https://github.com/sahamo123/dax-editor/issues/153) in draft [PR #156](https://github.com/sahamo123/dax-editor/pull/156), based on self-reviewed [PR #155](https://github.com/sahamo123/dax-editor/pull/155), head `8ccea14c08fe51610be5ddb2715480c1117fc7c2`. The [failure receipt](../implementation/2026-11-01-creator-editor/s01-05-failure-receipt.md) records prior synthetic evidence; this child's fresh checks and review remain pending. Earlier headings are historical.

## Active S01.05 state-ordering child — November 1, 2026

Continue [#154](https://github.com/sahamo123/dax-editor/issues/154) on local `codex/s01-05-state-ordering`, based on [PR #152](https://github.com/sahamo123/dax-editor/pull/152), head `1ea0507cf7c0b00ffbf688f45b3b2f8803305072`. Verify publication before resuming elsewhere. The [receipt](../implementation/2026-11-01-creator-editor/s01-05-state-ordering-receipt.md) records the reproduced warning-loss defect. Dependent failure-visibility work #153 is retained separately; earlier headings below are historical.

## Active S01.05 — November 1, 2026

Continue [issue #151](https://github.com/sahamo123/dax-editor/issues/151) on local `codex/s01-05-task-recovery`, after checking publication. The baseline [PR #150](https://github.com/sahamo123/dax-editor/pull/150) is at `5b29ed64956f770febaf2ec6c119215ffd9caca9`; the dated [handoff](../implementation/2026-11-01-creator-editor/handoff.md) is current. The following headings are historical checkpoints.

## Active save-as recovery — November 1, 2026

Continue [issue #146](https://github.com/sahamo123/dax-editor/issues/146) on local `codex/save-as-recovery` after checking publication. Its verified predecessor is [PR #148](https://github.com/sahamo123/dax-editor/pull/148), head `77a6c17ccee8854968c0b92567ea847fd9d017a3`. Follow the [dated handoff](../implementation/2026-11-01-creator-editor/handoff.md) and [save-as contract](../specs/save-as-recovery.md); previous active headings below are historical. S01.05 follows recovery and its predecessor recheck.

## Active S01.04 — November 1, 2026

Continue `codex/s01-04-responsive-workspace`, [issue #144](https://github.com/sahamo123/dax-editor/issues/144). Rechecked preview child [issue #137](https://github.com/sahamo123/dax-editor/issues/137), [PR #147](https://github.com/sahamo123/dax-editor/pull/147), tested head `798c87ca5872dbb1aaff95a996b4a7b8f52cf0f6` and tree `db3c2c754d71f33c91e47de23aa30e527f39f781`. Retest and publish the dependent compact slice before S01.05; then prioritize confirmed save-as recovery defect [#146](https://github.com/sahamo123/dax-editor/issues/146). Native/packaged acceptance remains separate.

## Active S01.03 — November 1, 2026

Continue `codex/s01-03-setup-inspector`, [issue #142](https://github.com/sahamo123/dax-editor/issues/142). Rechecked S01.02's verified [issue #140](https://github.com/sahamo123/dax-editor/issues/140), [PR #141](https://github.com/sahamo123/dax-editor/pull/141) and head `f3f019e353493a6050959170c72e33a73dc1b2ae`. Finish the setup/inspector implementation, acceptance and scoped PR before S01.04. Native/packaged acceptance remains separate.

## Active S01.02 — November 1, 2026

Continue `codex/s01-02-workspace-contract`, [issue #140](https://github.com/sahamo123/dax-editor/issues/140). Rechecked S01.01's verified [issue #135](https://github.com/sahamo123/dax-editor/issues/135), [PR #138](https://github.com/sahamo123/dax-editor/pull/138) and head `48bb5b00fce1399cd193123e49bc16b43266c99b`. Finish and review the proposed [workspace contract](../specs/workspace-design-contract.md) before S01.03. Native/packaged acceptance remains separate.

## Active S01.01 — November 1, 2026

Continue `codex/s01-01-workspace-audit`, [issue #135](https://github.com/sahamo123/dax-editor/issues/135). S00.06 passed independent review at [PR #134](https://github.com/sahamo123/dax-editor/pull/134), tested head `1d520153a1f81d2429f815d2db5e655e1a0d538d`. Fresh synthetic browser findings and their limitations are in the [audit receipt](../implementation/2026-11-01-creator-editor/s01-01-audit-receipt.md). Complete the second review and scoped publication, then recheck before S01.02. Native/packaged acceptance remains open.

## Active S00.06 — November 1, 2026

Continue `codex/s00-06-baseline-stage-review` under [issue #133](https://github.com/sahamo123/dax-editor/issues/133). Independently review S00.01–S00.05 receipts, commits and artifacts; reconcile release gates and findings before preparing the stage-closure PR. The [current handoff](../implementation/2026-11-01-creator-editor/handoff.md) tracks next actions. Do not present browser/system-FFmpeg evidence as native or packaged acceptance.

## S00.05 checkpoint — November 1, 2026

[Issue #129](https://github.com/sahamo123/dax-editor/issues/129) completed fresh source/browser/isolated offline editing and decoded-export acceptance on `codex/s00-05-offline-baseline`; current work is in the newer section above. The packaged-renderer and native-policy boundaries remain separate.

## S00.04 checkpoint — November 1, 2026

[Issue #127](https://github.com/sahamo123/dax-editor/issues/127) was verified with self-review on `codex/s00-04-performance-baseline`; current work is in the newer section above. The [performance receipt](../implementation/2026-11-01-creator-editor/s00-04-performance.md) records isolated browser samples and the test-only seeded 720p cache; normal proxies are 480p. Native, painted-frame, model and long-session performance are not certified.

## S00.03 checkpoint — November 1, 2026

[Issue #125](https://github.com/sahamo123/dax-editor/issues/125) was verified with self-review on `codex/s00-03-acceptance-fixtures`; current work is in the newer section above. The [fixture receipt](../implementation/2026-11-01-creator-editor/s00-03-fixtures.md) describes generated cases and provenance limits. Independent stage review remains due. Do not treat synthetic tones or system-FFmpeg checks as human speech or packaged-native acceptance.

## S00.02 checkpoint — November 1, 2026

[Issue #123](https://github.com/sahamo123/dax-editor/issues/123) was verified with self-review on `codex/s00-02-capability-reconciliation`; current work is in the newer section above. S00.01 was verified with self-review at PR #122's tested head; independent stage review remains due. The packaged FFmpeg process returned `spawn UNKNOWN` on the normal host; do not present a system-FFmpeg run as packaged validation.

## Execution start checkpoint — November 1, 2026

The selected route is first-improvement. S00.01 was started on `codex/s00-01-baseline-receipt` using [issue #121](https://github.com/sahamo123/dax-editor/issues/121) and its [baseline receipt](../implementation/2026-11-01-creator-editor/s00-01-receipt.md). Its later verification and current branch are in the active section above and [current handoff](../implementation/2026-11-01-creator-editor/handoff.md).

## Dated implementation handbook — November 1, 2026

Latest full continuation: `codex/staged-implementation-handbook`, based on the creator-plan branch at `f05a57b99a2d184900ddd809a7480b30052ae5c1`. Start with the [dated master index](../implementation/2026-11-01-creator-editor/master-plan.md), [current plan handoff](../implementation/2026-11-01-creator-editor/handoff.md) and [progress snapshot](../implementation/2026-11-01-creator-editor/progress.md). Tracking: [planning #72](https://github.com/sahamo123/dax-editor/issues/72). The folder contains 100 Markdown files: 10 stages, 76 steps, 13 controls/operating records and one generated index. All implementation steps are NOT_STARTED; the [future execution goal](../implementation/2026-11-01-creator-editor/execution-goal.md) remains inactive until owner launch. No application behavior or readiness changes. Earlier continuation entries below are historical; the latest branch includes their source and setup.

## Creator-workflow planning continuation — November 1, 2026

`codex/creator-platform-plan` contains the documentation-only [creator workflow review/roadmap](../specs/creator-platform-plan.md), based on `codex/impeccable-design-setup` at `2032f0d191aa46cb90dc29b76d002ce7dcb31451`. Issue [#70](https://github.com/sahamo123/dax-editor/issues/70) tracks this planning delivery. The proposal has not implemented layers, characters, reference analysis, specialist orchestration or hosting. The application baseline and setup remain the same; follow M0 then the focused M1/M2 slices after a request to execute.

## Design-tool continuation — November 1, 2026

`codex/impeccable-design-setup` adds the pinned Impeccable skill setup on top of `codex/laptop-agent-handoff`. Read [design setup and editor brief](impeccable-design.md) for manual-context usage and reinstall instructions; skill copies are ignored local developer files. No UI redesign or engine/hook installation is implied. Issue [#68](https://github.com/sahamo123/dax-editor/issues/68) tracks the setup. The October 31 guide below remains the application baseline and fresh-laptop procedure.

## Current entry point — October 31, 2026

**Read [Continue on another laptop or agent](laptop-continuation.md) before executing commands below.** It is the authoritative branch/setup/transfer/next-work guide for this handoff, including Antigravity. Use `codex/laptop-agent-handoff`; default `main` is older. Issue [#66](https://github.com/sahamo123/dax-editor/issues/66) tracks this delivery. Earlier sections preserve historical evidence; their live-process, branch, cache and incomplete-feature statements are not current instructions. Last application acceptance was October 27; no engine is promised running on another machine. Private ad projects/exports are inventoried in the new guide, not committed.

## October 27 continuation

The latest manual acceptance uses authorized real footage through an MCP SDK client over the actual stdio editor proxy. Import, grouped trim/title/volume, actual timeline undo/redo, Planning refusal, full-decode MP4 export and WebM review pass in the visible live project. The editor is left on this separate test project; artifacts/real-video-mcp/edited-project.dax.json reopens it, and previous-project.dax.json preserves the prior project. Result/log and media remain private ignored artifacts. This is live MCP protocol verification, without a natural-language external assistant inference claim.

Current application gates pass: pnpm check (1,799 package plus 17 root tests) and all 39 browser workflows. PR #61 fixes completed render jobs stuck at 100%, with six red/green regressions. The rebuilt live editor completes review and returns idle; saved .dax-data/ is preserved. Logs: artifacts/job-state-full-check.log and job-state-browser.log. See STATUS for exact current results and remaining gates.

Corrected installer 40528351026 (source 4de7ce832591efbcad6625a0ecdb3cf981db1314) builds successfully. Installed-native [40532196608](https://github.com/sahamo123/dax-editor/actions/runs/40532196608) PASSES actual Open/Save dialogs, interactive playback, manual title/undo/redo, effects review, audio/video export, saved restart, graceful shutdown, same-version reinstall and uninstall preservation. Hash-verified local evidence: artifacts/native-windows-acceptance/pass-18/. Older native #16 was a false workflow pass with a FAIL result; its wrapper/Save driver are repaired, and #18 is the final authoritative PASS. No cross-version upgrade or owner-laptop execution is claimed.

Real offline AI editing/export/restart/cleanup and longer synthetic speech pass; see STATUS. Development uses Start Development Preview - System FFmpeg.cmd because Application Control blocks the packaged renderer and native shell on this laptop. The installed system renderer works; the preview is running at http://127.0.0.1:4175/. Its WebM review works; its H.264 interactive proxy is unavailable in IAB, while actual Windows WebView2 playback passes. Do not change machine policy or weaken model ownership checks. Normal Windows socket visibility is required for those checks.

Remaining: policy-authorized owner-laptop native execution and verified local current installer transfer; configured hosted credentials; actual external-assistant sessions; cross-version upgrades, display scaling/whole-app peak memory and human/hours-long speech. Optional Windows Blender remains policy-blocked; real Linux templates pass. Source/history backups and dependency/model caches are local; artifacts/DELIVERY.json records exact trees/hashes. PRs #55–#63 contain implementation/native acceptance; the final evidence PR follows them. Main is unchanged.

## October 23 autonomous continuation

Final continuation is `codex/autonomous-release-final`, following draft PRs #40–#53. Application checks pass (1,788 package tests, 39 browser workflows); transport-only follow-up has all 15 root tests/lint/dead-code/OKF passing. Current unsigned installer build 39925892009 succeeds, including the client configuration correction. Its 1.7 GB archive and smaller transport parts remain on GitHub: connector downloads time out even at 64 MiB and the standard browser download also times out. Only the small hash receipt is verified locally. No current local installer is claimed. See the top of STATUS for exact hashes, current acceptance boundaries and native execution blocker. Local source ZIP, verified Git bundle, checksums and `artifacts/DELIVERY.json` capture this handoff. Main remains unchanged.

Continue from the latest dependent draft PR after #47, not the older provider branch. PRs #40–#41 add named connection snapshots; #42–#45 add manual zoom/audio/ducking/image tools and browser/export validation; #46 verifies real Blender rendering in Linux; #47 adds shared-registry live task cancellation. Follow `docs/STATUS.md` for final gate results. Real longer speech evidence is `artifacts/speech-longform/result.json`; reproduce with the opt-in fixture/verification scripts after installing the offline speech assets. Native Windows execution and actual hosted/external-client edits remain unverified. Preserve `.dax-data/` and ignored evidence. Preview effect parity is limited; review exact zoom/music/image appearance in an export.

## October 22 functional release checkpoint

Start with `docs/specs/functional-desktop-release.md`, `docs/STATUS.md` and `DEVELOPMENT-TASKS.md`. Delivery issue #8 indexes #9–#17. Dependent draft PRs #18–#37 publish the implementation through `codex/functional-windows-build`; the final evidence handoff is on `codex/functional-release-handoff`. Local and connector-created commit IDs differ, but published Git trees were checked against local trees. Do not force-push the older provider branch or main. The artifact-only candidate run is linked from PR #37; it does not publish a release.

New capabilities include task/revision guards, captured queued credentials, per-provider diagnostics, project UI/relink/manual tools, offline speech and review controls, active-project MCP with a private stdio proxy, and three optional controlled Blender templates. Native and Blender execution remain blocked by Code Integrity event 3077. Preserve `.dax-data/` and all ignored artifact evidence; no Windows policy has been changed.

Application source 0d1b7e7 passes the full repository check (1,780 package tests plus 14 root tests), 37 browser workflows and 25 Rust tests. Packaging follow-up f42200a passes 13 shell-script tests and actual local preparation. The strongest real offline result is `artifacts/offline-smoke-1792707259245/result.json`: PASS, including format fit/fps and title timing preservation, volume, trim, unsupported request, manual-only export, restart and inference cleanup. Earlier narrower PASS missed a fit mutation and is superseded. Local AI requests still take 49–129 seconds on this CPU. Use the pinned toolchain from `scripts/Enter-Dev.ps1`.

Application Control blocks both the Tauri native Node binding and the official Cargo CLI's generated Windows build helpers. No policy change was attempted. The first candidate CI build exposed a hardcoded C++ redist path; 76943a6 discovers release CRT/OpenMP using the local SDK or official vswhere, with synthetic-layout tests. Follow PR #37 for the updated build. The October 20 installer predates these features and must not be delivered as current. The preview has been saved and restarted against current engine resources.

Actual hosted API calls, individual Claude/Codex sessions, multiple named same-family provider profiles, complete manual parity, final installer and native clean-install/upgrade checks remain acceptance items. Browser JSON project copies reference existing media; they are not portable media bundles. Never expose tokens from `.dax-data/live-mcp.json`, engine startup lines or preview connection URLs.

Historical checkpoints follow.

Provider continuation is on `codex/lightweight-ai-providers`, issue #6. OpenRouter now has its own settings/key namespace and fixed endpoint; generic APIs have endpoint presets and generation settings. No hosted API call was made. The smaller local model was tested but rejected as the default because real command execution failed; preserve the current 2B bundle and the ignored trial evidence. See `docs/specs/lightweight-ai-providers.md`.

Steering was corrected after the initial task-queue delivery: `Steer task` now adds guidance at the next model boundary in the same active run, without cancellation. Stop is separate. Modes/attachments or older runners continue after current work finishes. See the updated ADR 0013 and `packages/agent/src/steering.test.ts`.

The latest preview work is on `codex/browser-chat-tasks`, tracked in issue #4 and described in `docs/specs/browser-import-and-responsive-chat.md`, `docs/specs/chat-task-queue.md` and ADR 0013: browser picker/upload, chat video attachments, engine task queue, steering and enforced Planning mode. Full checks pass in `artifacts/chat-tasks-full-check.log`; live browser import/playback and a real offline Planning reply were observed. The native installer has not been rebuilt for these improvements. Preserve ignored `.dax-data/` sources, projects, models and task history.

The repository is the source of truth. The upstream baseline is `82f1d24` on `claude/exciting-lamport-1k91fh`; the October 20 Windows implementation is on `codex/windows-offline-desktop`, split into logical commits. Inspect `git status` before switching branches. Build artifacts, dependency caches and `.dax-data/` preview project data are ignored by Git. Read the Windows checkpoint in `docs/STATUS.md`, the root `DEVELOPMENT-TASKS.md`, and `WINDOWS-DEVELOPMENT.md` before the historical state below. Delivery tracking is [GitHub issue #2](https://github.com/sahamo123/dax-editor/issues/2). Section 3 lists baseline dependencies and pins.

The unsigned Windows installer includes offline AI. Full `pnpm check`, 32 browser workflows and the real-model development preview smoke pass. `Start Development Preview.cmd` opens the browser editor and offline AI with persistent `.dax-data/`. Native validation remains blocked by Windows Application Control event 3077; Smart App Control reports enforcement on this personal administrator-owned laptop. No signing certificate is available, and no security policy was changed. Bundled-engine/browser evidence does not replace native install and dialog validation.

## 1. Start (any agent, any machine)

1. Follow the current [cross-laptop continuation](laptop-continuation.md); the branch/setup steps in this historical section are superseded. Preserve local changes before switching.
2. Read `AGENTS.md`, then this file, then `docs/STATUS.md` (current state and "Needs a human").
3. Install the toolchain in section 3.1, then `corepack enable && pnpm bootstrap`.
4. `pnpm check`. It must pass before you change anything. If it fails, fix that first. Known flaky tests are in section 6.
5. Work in small steps: test first, `pnpm check` green, one Conventional Commit, push the issue branch. Use tool-neutral authorship; do not invent an agent identity or vendor author trailer.

## 2. Where we stopped

The product is not finished. The goal (a shippable desktop video editor with an embedded model, bring-your-own API key and two sign-in options) is about 55% done. Estimates by area are in `docs/STATUS.md`.

Merged on this branch (`git log` is the record):
- Video engine: timeline model, 45 commands, cuts with energy-gated word gaps and word tails, breath attenuation (12 dB), captions, text overlays with animations, zoom, music ducking, image overlays (engine only), templates, undo and history.
- Render: FFmpeg export, atomic and cancellable. Picture and sound stay in step after cuts (within 1 ms over 60 joins, `packages/core/src/av-sync-render.test.ts`).
- Agent loop, skills, server, launcher (`@dax/engine`), MCP server and `dax` CLI.
- Desktop shell and editor (browser build), Tauri 2 shell (Linux build only).
- Embedded local model runtime (`@dax/local-llm`) and speech-to-text (`@dax/stt`), wired into the launcher. Verified on Linux CPU only.
- Claude Code sign-in bridge (`@dax/bridges`), Linux only.
- Review pass: symlink containment, declared-size and inflate bounds, pinned runtime digests, listener identity check, start and stop races, finite numbers, asset-path validation, FFmpeg protocol whitelist.

### Verified state of the local build worktrees

During this handoff I checked every local git worktree under `.claude/worktrees/` (20 of them, each on a `worktree-agent-*` branch):
- Every commit on those branches is already reachable from `claude/exciting-lamport-1k91fh`. None of them holds commits that exist only locally. The `worktree-agent-*` branches are not pushed and not needed. Do not push them.
- One worktree (`agent-afda45debdc07fce8`) had two **uncommitted** edits, the only work that existed nowhere else. They are saved as a patch in section 4.
- The "In progress" list in `docs/STATUS.md` was written before those commits landed. Check `git log` before trusting any "not merged" claim there.

## 3. Dependencies and system requirements

Nothing here needs a paid service. Versions below come from the files named in the table.

### 3.1 Toolchain

| Need | Pinned in | What to do |
|---|---|---|
| Node 22 | `.node-version` (`22`), AGENTS.md ("Node 22+") | Install Node 22. Note: `scripts/bootstrap.sh` still checks for Node 20+. It passes Node 22, so it is consistent with the pin, but the message is looser than the requirement. |
| pnpm 10.28.0 | `packageManager` in root `package.json` | `corepack enable`. Do not install pnpm globally at another version. |
| FFmpeg and ffprobe on `PATH` | not in the repo (system tool) | `apt install ffmpeg`, `brew install ffmpeg` or `choco install ffmpeg`. Tested on **FFmpeg 6.1.1 only**. FFmpeg 7 is untested. Builds we ship must be LGPL-safe (see `packages/core/src/render.ts`). |
| Rust 1.82 or newer, `cargo` | `apps/desktop/src-tauri/Cargo.toml` (`rust-version = "1.82"`) | Needed only for the Tauri shell. Built here with cargo 1.97. |
| Tauri 2 Linux system libraries (WebKitGTK and GTK development packages) | Tauri v2 prerequisites | Needed to compile `apps/desktop/src-tauri`. They are missing in the cloud sandbox, so the shell cannot be compiled there. Install them from the Tauri prerequisites page for your distribution. |
| Chromium for Playwright | `@playwright/test` `1.56.1` in `apps/desktop/package.json` | Local: `pnpm exec playwright install chromium`. The cloud container has Chromium at `/opt/pw-browsers` (`PLAYWRIGHT_BROWSERS_PATH`) and must not run `playwright install`. |

### 3.2 JavaScript dependencies

- `pnpm-lock.yaml` is tracked and is the source of truth. Install with `pnpm install` (or `pnpm install --frozen-lockfile` to match CI exactly).
- Workspaces: `packages/*` and `apps/*` (`pnpm-workspace.yaml`). Each package's own `package.json` lists its dependencies.
- `Cargo.lock` is tracked in `apps/desktop/src-tauri/` for the Rust side.
- **Open item:** pnpm 10 skips dependency build scripts unless allowed, and `bootstrap` prints `Ignored build scripts: esbuild@0.28.2`. The build works without it because esbuild ships its binary in an optional package, but the warning stays. Decide once with `pnpm approve-builds` (it writes an allow-list to `package.json`) rather than silencing it by hand. Not changed in this handoff.
- Dev tools in the root `package.json`: Biome (`@biomejs/biome`), knip, TypeDoc, TypeScript and `yaml`.

### 3.3 Runtime components the engine downloads (not in the lockfile)

These are fetched only when a user asks, never at install or test time. Tests do not use the network.

| Component | Pinned in | Notes |
|---|---|---|
| llama.cpp server runtime, release `b11721` | `packages/local-llm/src/runtime.ts` (one archive per platform, each with a SHA-256) | Verified before it runs. Unverified installs are refused unless `allowUnverified` is passed. |
| Local model catalogue (GGUF files) | `packages/local-llm/src/catalog.ts` (`sha256` per model, Hugging Face `revision` per model) | Only models whose licence permits commercial use and redistribution are listed. The Gemma-class licence and tool-calling behaviour are still unconfirmed (see section 5). |
| whisper.cpp runtime, `v1.9.2` | `WHISPER_RUNTIME_VERSION` in `packages/stt/src/binary.ts` (SHA-256 computed by download, since upstream publishes none) | **Not installed by anything yet.** No engine route or desktop button installs it, and no speech model is bundled. |

### 3.4 External CLIs (optional, the user's own)

- Claude Code: `DAX_CLAUDE_BIN` overrides the `claude` binary. The bridge uses only the CLI's own `auth status`. It never reads or passes credentials.
- Codex: detection only (`DAX_CODEX_BIN`). Not yet supported as a chat backend, and the MCP setup for it is not confirmed (see section 5).
- Gemini: deliberately not supported.

### 3.5 Environment variables

| Variable | Purpose |
|---|---|
| `DAX_FFMPEG`, `DAX_FFPROBE` | Explicit FFmpeg and ffprobe binaries (default: `PATH`). |
| `DAX_LLAMA_SERVER` | Explicit `llama-server` binary, instead of the downloaded runtime. |
| `DAX_WHISPER_CLI`, `DAX_STT_MODEL` | Use this whisper-cli binary instead of downloading one. The speech model defaults to `base.en-q5_1`. Without a runtime, captions, filler cuts and transcript cuts report `transcription unavailable: <reason>`. |
| `DAX_CLAUDE_BIN`, `DAX_CODEX_BIN` | CLI bridge binaries. |
| `DAX_SERVER_BIN` | Explicit engine server binary, read by the launcher (otherwise an installed `@dax/server`, else `dax-server` on `PATH`). |
| `DAX_NODE`, `DAX_SERVER_ENTRY` | Debug-builds-only overrides for the Tauri shell's Node and server entry point. Ignored in release builds. |
| `DAX_DATA_DIR`, `DAX_PROJECT`, `DAX_SKILLS_DIR`, `DAX_TEMPLATES_DIR` | Data location, project file (`--project`, else `DAX_PROJECT`), and skill and template folders. |
| `DAX_SERVER_TOKEN`, `DAX_MCP_TOKEN` | Bearer tokens, generated at run time. **Never commit a value.** |
| `DAX_LIVE_TESTS=1` with `DAX_LLAMA_SERVER` or `DAX_LIVE_LLAMA_SERVER` | Opt-in switch for the live llama test (it needs a real binary). Off by default; default test runs never touch the network. |
| `DAX_STANDIN_MODE`, `DAX_STANDIN_CHILD` | Test knobs for the stand-in child process that the process-supervision tests spawn. |

## 4. Unfinished work, in priority order

### 4.1 Patch: local-llm archive symlink chains (saved, not applied)

- File: `docs/handoff/local-llm-archive-symlink-chains.patch` (253 lines). Two files: `packages/local-llm/src/archive.ts` and `packages/local-llm/src/archive.test.ts`.
- What it does: archive extraction refuses to write through symlinks that point outside the destination, including chains of links that only escape once followed (`s1 -> sub/..`, `s2 -> s1/../escaped`). It resolves links against the real file system, checks every link again after all links exist, and removes any link it created when it refuses.
- **State:** it was written against worktree base `e37aaf8`, and `archive.ts` has since changed on this branch. `git apply --check` fails on this branch. `git apply -3` applies the test file cleanly and puts **conflicts in `archive.ts`**. Nothing from the patch has been run: no test has passed on it.
- To finish it: resolve the conflict by hand (the ideas are right, the base is old), then run `pnpm --filter @dax/local-llm test`, then `pnpm check`. Commit it as `fix(local-llm): refuse symlink chains that escape the extraction root` with a regression test that fails before the fix and passes after. Delete the patch file in the same commit.

### 4.2 Remaining work, in order

Each item needs a regression test that fails before and passes after, one commit per item, and `pnpm check` green.

1. **Finish review hardening.** Finish the patch in 4.1. Still open from the review: confirm the pinned digests against the API `digest` field when it is reachable; check the macOS and Windows port-owner lookups; `ffprobe` in `media.ts`, and the MCP and server frame paths, still need the same protocol whitelist as FFmpeg.
2. Local model in the desktop app: the reconciliation with the engine server has landed (`92f58a9`), but `apps/desktop/e2e/real-engine.spec.ts` still expects the local model to show "not available". With the wiring merged, the card should offer a download, so update that test with the change.
3. Speech install route and desktop controls (the engine has no install route for whisper yet), then the model evaluation study on real models. The adapter exists; no real-model run is recorded yet.
4. Draft/approve flow for external MCP agents ([ADR 0006](../adr/0006-draft-approve-for-external-agents.md)). Today MCP edits the live session, credited as AI and undoable.
5. Tauri desktop app in a real window: chat on the left, preview and timeline on the right. Needs the Linux GTK libraries in 3.1 to compile.
6. Engine gaps from the creator research: a second video layer for B-roll; shapes and generated cards; automatic zoom placement (cursor, code, face); automatic sound-effect placement; transitions. Wire the effects layers (zoom, music, sound effects, image overlays) into the server, protocol types and desktop timeline.
7. Screen and mic recording.
8. Connectors: Google Drive first, then rclone.
9. Plugin system ([plugin architecture research](../research/plugin-architecture.md)).

Unfinished edits go to `docs/handoff/` as a patch (see its README). Do not leave them in a worktree or a chat.

## 5. Blocked, or needs a human

- Repo settings per `docs/maintainers/repo-settings.md`: branch protection, required CI, private vulnerability reporting, Dependabot.
- Code of Conduct contact email. Until then, the interim route is GitHub private reporting.
- First CI run on GitHub, to confirm Linux passes and to see macOS and Windows results.
- Real macOS and Windows testing. Nothing has run on either.
- Signing for macOS and Windows builds (Apple Developer ID, Windows code-signing certificate). These cost money and need a human.
- Licence call, only if ever wanted: Mediabunny (MPL-2.0) for in-browser demux, or Twick (SUL, currently excluded by the dependency rule). See [timeline UI patterns](../research/timeline-ui-patterns.md).
- Confirm the Gemma-class model licence and tool-calling behaviour before relying on it. **(unverified)**
- Google Drive: a decision on OAuth app verification (restricted scope or Picker). **(unverified)**
- CLI bridge: Codex needs a confirmed per-run MCP setup before it can run (API key first, subscription sign-in opt-in). The Claude bridge needs a live end-to-end check on each supported Claude Code version, and a written answer from Anthropic on the bridge.

## 6. Known issues

- CI has not yet run on GitHub.
- Flaky under full-suite load, fine alone: `packages/bridges` ("reports a slow sign-in check") and `packages/stt` ("kills whisper-cli when the signal fires"). Make them deterministic (wait for an explicit ready signal, not a timer) before relying on `pnpm check` in CI.
- Projects saved before the frame-grid change are not re-quantised on open. Cuts are snapped at render, so the timeline can differ from the output by up to half a frame per old cut.
- Breath depths per preset and the render ramp are not built (a flat 12 dB is).
- Windows and macOS are untested.
- Core export is not yet atomic or cancellable. Cancelling an MCP export lets FFmpeg finish in the background, then deletes its file.
- Speech-to-text is wired but nothing installs whisper-cli or a model. Until a user sets `DAX_WHISPER_CLI` and `DAX_STT_MODEL`, captions, filler-word removal and transcript cuts report "transcription unavailable".
- The embedded local model is wired but not merged into a shipped build, so the built-in chat still needs the user's own provider until a model is downloaded and started.
- The Tauri shell cannot be compiled in the cloud sandbox (missing WebKitGTK libraries).
- MCP edits go straight into the live session with no approval step. They are credited as AI and undoable.
- The effects layers are engine and command only. The server, protocol types and desktop timeline do not show zooms, audio clips or image overlays yet. Tests ran on FFmpeg 6.1.1 only.
- Research reports contain claims marked unverified. Check them before relying on them, starting with [landscape](../research/landscape.md).
- `scripts/bootstrap.sh` checks Node 20+, while the pin and AGENTS.md say 22 (see 3.1).

## 7. Scratch and local state

- `/tmp`, `scratchpad` and `/root/.cache` are not needed by any commit. Keep only what a commit needs.
- Ignored and generated, safe to delete: `node_modules/`, `dist/`, `packages/*/.test-dist/`, `packages/evals/.dax-cache/`, and the `.claude/worktrees/` checkouts (their commits are already on this branch, see section 2).
- Never commit `.dax.json` projects, media, model files or tokens. `.gitignore` covers the usual cases.
