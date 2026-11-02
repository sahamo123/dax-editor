---
type: Status
title: Project status
description: "Current state of dax-editor: what works, what is in progress, what is next in order, what is blocked, and how to resume."
tags: [status, roadmap, handoff]
status: stable
generated:
  by: process:scribe
  at: 2026-11-01T10:00:00Z
---

# Project status

## S01.06 live accessibility and export announcements — November 1, 2026

The live walkthrough [#177](https://github.com/sahamo123/dax-editor/issues/177) is partial: the generated clip was selected with a mouse; Narrator was heard announcing preview completion, but the operator reported no export-start or progress speech and did not hear the existing-file error. The candidate fix [#185 / draft PR #187](https://github.com/sahamo123/dax-editor/pull/187) is under verification at application/test head `6c3fbea9723fcf17018d736f518e749cb7533860`. Full source checks passed in an authorized isolated test environment; the affected browser suite exposed an intermittent disconnected-engine failure, tracked separately in [#186](https://github.com/sahamo123/dax-editor/issues/186). The user is away, so actual post-change speech and a complete keyboard-only import remain pending. Do not advance to S01.07. See the [receipt](implementation/2026-11-01-creator-editor/s01-06-live-announcement-receipt.md); earlier entries are historical.

## S01.06 setup and error contrast — November 1, 2026

Setup and task-error contrast [#183 / PR #184](https://github.com/sahamo123/dax-editor/pull/184) passed focused browser, fast, dead-code and docs checks and was separately self-reviewed at test/docs head `6fdb6a7f7958b723c618226d02ae42dce4753ffe` (not independently reviewed). The earlier full check is reused only for unchanged application source. Actual keyboard-only and Narrator acceptance [#177](https://github.com/sahamo123/dax-editor/issues/177) remain blocked on computer-use access. Do not advance to S01.07. See the [receipt](implementation/2026-11-01-creator-editor/s01-06-setup-error-contrast-receipt.md).

## S01.06 task-state evidence — November 1, 2026

Task-state label verification [#181 / PR #182](https://github.com/sahamo123/dax-editor/pull/182) passed focused browser, fast, dead-code and docs checks and was separately self-reviewed at test/docs head `78d5acb861b3a6328dd490852f226744fed71bcb` (not independently reviewed). The earlier full check is reused only for unchanged application source. Actual keyboard-only and Narrator acceptance [#177](https://github.com/sahamo123/dax-editor/issues/177) remain blocked on computer-use access. Do not advance to S01.07. See the [receipt](implementation/2026-11-01-creator-editor/s01-06-task-state-receipt.md).

## S01.06 task cancellation names — November 1, 2026

Task-cancellation naming [#179 / PR #180](https://github.com/sahamo123/dax-editor/pull/180) passed focused component/browser and full source checks and was separately self-reviewed at application/test head `d92bc08a210312d68403a870e3fffac97e584f0e` (not independently reviewed). Actual keyboard-only and Narrator acceptance [#177](https://github.com/sahamo123/dax-editor/issues/177) remain blocked on computer-use access. Do not advance to S01.07. See the [receipt](implementation/2026-11-01-creator-editor/s01-06-task-cancel-receipt.md).

## S01.06 native accessibility access — November 1, 2026

Native accessibility acceptance [#177](https://github.com/sahamo123/dax-editor/issues/177) is BLOCKED on computer-use access. The synthetic test browser's Open dialog is visible, but targeting its transient window was rejected; starting Narrator timed out waiting for app approval. No actual screen-reader speech or complete keyboard-only import has been observed. [PR #176](https://github.com/sahamo123/dax-editor/pull/176) was self-reviewed at `abed94254a22c19f436ad5157c599217c1ebbf4d`. The parent S01.06 remains IN_PROGRESS; do not advance to S01.07. See the [receipt](implementation/2026-11-01-creator-editor/s01-06-native-acceptance-receipt.md).

## S01.06 evidence reconciliation — November 1, 2026

Accessibility evidence reconciliation [#175](https://github.com/sahamo123/dax-editor/issues/175) is IN_PROGRESS on `codex/s01-06-contrast-audit`, based on self-reviewed [PR #174](https://github.com/sahamo123/dax-editor/pull/174) `21c531bc2cd604f9a819c5ee01ff687761ca0808`. A limited opaque-color scan's ruler warning was disproved by rendered geometry; actual ruler contrast measured 8.10:1. This is not a whole-app audit. Actual keyboard-only import and screen-reader speech remain required; native/DPI checks remain separate. See the [receipt](implementation/2026-11-01-creator-editor/s01-06-audit-reconciliation-receipt.md).

## S01.06 history readability — November 1, 2026

History contrast [#173](https://github.com/sahamo123/dax-editor/issues/173) is IN_PROGRESS on `codex/s01-06-contrast-sweep`, based on self-reviewed [PR #172](https://github.com/sahamo123/dax-editor/pull/172) `3f5a185e6861268621c21bbe0f68138a5ea528b5`. The focused browser checks pass after improving history text and labelling other-branch entries. The full source check and final focused browser tests passed; fast checks for the later test-only assertion also passed; publication and self-review remain pending. Actual assistive-technology and native/DPI evidence remain open. See the [receipt](implementation/2026-11-01-creator-editor/s01-06-history-contrast-receipt.md).

## S01.06 modal shortcuts — November 1, 2026

Dialog shortcut isolation [#171](https://github.com/sahamo123/dax-editor/issues/171) is IN_PROGRESS on `codex/s01-06-dialog-shortcuts`, based on self-reviewed [PR #170](https://github.com/sahamo123/dax-editor/pull/170) `5f766c48f1ec329b8d111593ee638849681f717f`. Component tests reproduced split/delete and undo behind a modal; candidate focused and browser tests pass, as does the host-permission full source check. Publication and self-review remain pending. See the [receipt](implementation/2026-11-01-creator-editor/s01-06-dialog-shortcuts-receipt.md). S01.06 keyboard-only and actual assistive-technology gates remain open; native/DPI evidence is separate.

## S01.06 reduced motion — November 1, 2026

Primary contrast [#165 / PR #169](https://github.com/sahamo123/dax-editor/pull/169) is verified with self-review at `bb087001bfd21a8b570a82be2afb09f69fa2a6f1`. Reduced motion [#168](https://github.com/sahamo123/dax-editor/issues/168) is under test on `codex/s01-06-reduced-motion`; full source and focused browser checks pass; publication and self-review remain pending. Confirm publication before switching laptops. Actual assistive-technology and native/DPI evidence remain open.

## S01.06 primary-button contrast — November 1, 2026

Export-focus [#164 / PR #167](https://github.com/sahamo123/dax-editor/pull/167) is verified with self-review at `ee1c4726c7e4fb03986fe986440521f428dc5b4c`. Primary-hover contrast [#165](https://github.com/sahamo123/dax-editor/issues/165) is under test on local `codex/s01-06-primary-contrast`: a rendered regression measured the original hover at 3.84:1; the adjusted color measured 5.79:1. Full checks and review remain pending. Confirm publication before switching laptops; actual assistive-technology and native/DPI evidence remain open.

## S01.06 export focus — November 1, 2026

Review progress [#163 / PR #166](https://github.com/sahamo123/dax-editor/pull/166) is verified with self-review at `1a57506035551b4d6cf3ddae414acd54f044274b`. Export-focus [#164](https://github.com/sahamo123/dax-editor/issues/164) is under test on `codex/s01-06-export-focus`; 34 component tests and seven focused browser tests passed. Full checks and separate review are pending. Hover contrast #165 and real assistive-technology observations remain open. Verify publication before another laptop resumes.

## S01.06 keyboard and accessibility — November 1, 2026

An isolated partial browser keyboard walkthrough identified [review progress live-region updates #163](https://github.com/sahamo123/dax-editor/issues/163) and [export focus loss #164](https://github.com/sahamo123/dax-editor/issues/164). The first fix is under test; the second remains pending. A browser file-selection helper was required and native-window access timed out, so complete manual and assistive-technology acceptance is not claimed. See the [audit receipt](implementation/2026-11-01-creator-editor/s01-06-accessibility-audit-receipt.md).

S01.05 [#151 / PR #161](https://github.com/sahamo123/dax-editor/pull/161) is verified with self-review at documentation head `594f1866bdc760a76a3bd37659ce1d7c25fe7449`, following tested application/test head `3760930c9f1de626ab3ce341f8cf2e5823e81e67`. S01.06 [#162](https://github.com/sahamo123/dax-editor/issues/162) begins on local `codex/s01-06-review-announcements`; confirm publication before another laptop resumes. The [progress mirror](implementation/2026-11-01-creator-editor/progress.md) records 11 of 76 steps verified. Actual keyboard, contrast and assistive-technology observations are pending.

## S01.05 parent evidence reconciliation — November 1, 2026

All five scoped children now have self-reviewed draft PRs, most recently [recovery acceptance #157 / PR #160](https://github.com/sahamo123/dax-editor/pull/160), tested head `3760930c9f1de626ab3ce341f8cf2e5823e81e67`. The [parent receipt](implementation/2026-11-01-creator-editor/s01-05-task-recovery-receipt.md) reconciles the checklist and is awaiting its separate review; the step is not yet verified. Check branch publication before resuming elsewhere.

## S01.05 combined recovery acceptance — November 1, 2026

Shutdown [#158 / PR #159](https://github.com/sahamo123/dax-editor/pull/159) is self-reviewed at `368fd843ba4fd7984e0d12c49440b5a2914ec4dc`. Recovery acceptance [#157](https://github.com/sahamo123/dax-editor/issues/157) continues on `codex/s01-05-recovery-acceptance-v2` from that commit; see the [receipt](implementation/2026-11-01-creator-editor/s01-05-recovery-acceptance-receipt.md). The full browser suite must pass before S01.05 can be reconciled. Check branch publication before resuming elsewhere.

## S01.05 chat shutdown investigation — November 1, 2026

The corrected failure-visibility [PR #156](https://github.com/sahamo123/dax-editor/pull/156) passed source/browser checks and self-review at `082314a691f1ee1720beaf85c8c1280858727842`. Recovery acceptance [#157](https://github.com/sahamo123/dax-editor/issues/157) found a shutdown cleanup failure. The independently reproduced ordering defect is being fixed in [#158](https://github.com/sahamo123/dax-editor/issues/158), local branch `codex/s01-05-chat-shutdown`; see the [receipt](implementation/2026-11-01-creator-editor/s01-05-shutdown-receipt.md). This step is not verified; confirm publication before resuming elsewhere.

## S01.05 failure visibility — November 1, 2026

[Child #153](https://github.com/sahamo123/dax-editor/issues/153) implements task failure and autosave visibility in draft [PR #156](https://github.com/sahamo123/dax-editor/pull/156), based on self-reviewed state-ordering [PR #155](https://github.com/sahamo123/dax-editor/pull/155), tested head `8ccea14c08fe51610be5ddb2715480c1117fc7c2`. The [failure receipt](implementation/2026-11-01-creator-editor/s01-05-failure-receipt.md) records earlier synthetic checks; this child's full verification remains pending.

## S01.05 state ordering — November 1, 2026

[Issue #154](https://github.com/sahamo123/dax-editor/issues/154) isolates a reproduced delayed-refresh defect from failure-visibility work [#153](https://github.com/sahamo123/dax-editor/issues/153). Local worktree branch `codex/s01-05-state-ordering` follows self-reviewed composer [PR #152](https://github.com/sahamo123/dax-editor/pull/152), tested head `1ea0507cf7c0b00ffbf688f45b3b2f8803305072`. See the [receipt](implementation/2026-11-01-creator-editor/s01-05-state-ordering-receipt.md) for pending verification and check publication before resuming elsewhere.

## First-improvement S01.05 — November 1, 2026

[Issue #151](https://github.com/sahamo123/dax-editor/issues/151) begins task and recovery visibility on local `codex/s01-05-task-recovery`, based on [save-as PR #150](https://github.com/sahamo123/dax-editor/pull/150), tested head `5b29ed64956f770febaf2ec6c119215ffd9caca9`. S01.04's [receipt](implementation/2026-11-01-creator-editor/s01-04-responsive-receipt.md), published issue/PR, log hashes and current-tree ancestry were rechecked; it was self-reviewed, not independently reviewed. Check branch publication before resuming elsewhere. Native/DPI acceptance and the separate Windows rename investigation [#149](https://github.com/sahamo123/dax-editor/issues/149) remain open.

## Save-as recovery — November 1, 2026

S01.04 is VERIFIED with self-review at [issue #144](https://github.com/sahamo123/dax-editor/issues/144), [PR #148](https://github.com/sahamo123/dax-editor/pull/148), published head `77a6c17ccee8854968c0b92567ea847fd9d017a3`; see the [receipt](implementation/2026-11-01-creator-editor/s01-04-responsive-receipt.md) for the tested code commit and evidence. Work is in progress on the distinct [save-as recovery defect #146](https://github.com/sahamo123/dax-editor/issues/146), initially on local branch `codex/save-as-recovery`. Check its publication before continuing elsewhere. This is not a release or native acceptance claim.

## First-improvement S01.04 — November 1, 2026

The preview/sizing child is VERIFIED with self-review at [issue #137](https://github.com/sahamo123/dax-editor/issues/137), [PR #147](https://github.com/sahamo123/dax-editor/pull/147), tested head `798c87ca5872dbb1aaff95a996b4a7b8f52cf0f6`. Its dependent compact workspace is VERIFYING on `codex/s01-04-responsive-workspace`, [issue #144](https://github.com/sahamo123/dax-editor/issues/144): the dependent tree passed full source and browser checks, and review/publication remain pending. Native/packaged and DPI acceptance remain open.

During verification, one unchanged CLI-detection test failed in a full run and passed five isolated reruns; its original cause is unconfirmed and a full rerun remains required. Separate source review found that a failed CLI help probe can be classified as unsupported; [issue #145](https://github.com/sahamo123/dax-editor/issues/145) tracks that distinct issue.

A subsequent full run passed that CLI case but one unchanged temporary-project save test returned HTTP 400. Five isolated reruns of the exact case and 100 synthetic create/save attempts passed; the cause and real-project impact remain unknown. [Issue #146](https://github.com/sahamo123/dax-editor/issues/146) tracks the investigation. Do not treat these isolated passes as proof the failure is resolved.

The final full source check subsequently passed. A separate deliberate history-write failure confirmed that save-as can return an error after writing the project and changing its active save location. This is a confirmed recovery defect tracked in [#146](https://github.com/sahamo123/dax-editor/issues/146), independent of the unexplained intermittent failure. Fix it before claiming reliable save-as recovery.

## First-improvement S01.03 — November 1, 2026

S01.02's product/design contract passed self-review: [issue #140](https://github.com/sahamo123/dax-editor/issues/140), [PR #141](https://github.com/sahamo123/dax-editor/pull/141). Setup and contextual-inspector work is IN_PROGRESS on `codex/s01-03-setup-inspector`, [issue #142](https://github.com/sahamo123/dax-editor/issues/142). Targeted tests pass; full acceptance and publication remain pending. Native/packaged and DPI acceptance remain open.

## First-improvement S01.02 — November 1, 2026

S01.01 passed its scoped self-reviewed browser audit: [issue #135](https://github.com/sahamo123/dax-editor/issues/135), [PR #138](https://github.com/sahamo123/dax-editor/pull/138). The owner approved five synthetic screenshots. S01.02 is IN_PROGRESS on `codex/s01-02-workspace-contract`, [issue #140](https://github.com/sahamo123/dax-editor/issues/140); its proposed [workspace contract](specs/workspace-design-contract.md) does not claim implementation. Native/packaged and DPI acceptance remain open.

## First-improvement S01.01 — November 1, 2026

S00.06 passed independent stage review: [issue #133](https://github.com/sahamo123/dax-editor/issues/133), [PR #134](https://github.com/sahamo123/dax-editor/pull/134). The rendered workspace audit is IN_PROGRESS on `codex/s01-01-workspace-audit`, [issue #135](https://github.com/sahamo123/dax-editor/issues/135); its [receipt](implementation/2026-11-01-creator-editor/s01-01-audit-receipt.md) records synthetic browser evidence and findings #130, #131, #136 and #137. Complete its second review and publish before S01.02. Native/packaged and DPI acceptance remain separate and open.

## First-improvement S00.06 — November 1, 2026

[Issue #133](https://github.com/sahamo123/dax-editor/issues/133) independently reviews the baseline stage on `codex/s00-06-baseline-stage-review`. S00.01–S00.05 have self-reviewed receipts; the S00.05 [offline baseline](implementation/2026-11-01-creator-editor/s00-05-offline-baseline.md) passed the full source check, browser suite and isolated decoded-export walkthrough with system FFmpeg. Native/packaged acceptance remains open; UI issues [#130](https://github.com/sahamo123/dax-editor/issues/130) and [#131](https://github.com/sahamo123/dax-editor/issues/131) remain open.

## First-improvement S00.05 checkpoint — November 1, 2026

[Issue #129](https://github.com/sahamo123/dax-editor/issues/129) completed a fresh offline editing baseline on `codex/s00-05-offline-baseline`, after [issue #127](https://github.com/sahamo123/dax-editor/issues/127) and [PR #128](https://github.com/sahamo123/dax-editor/pull/128) were rechecked. Current work is in the newer section above. Browser/system-FFmpeg results and native/packaged acceptance are separate.

## First-improvement S00.04 checkpoint — November 1, 2026

[Issue #127](https://github.com/sahamo123/dax-editor/issues/127) measured and documented baseline budgets on `codex/s00-04-performance-baseline`, then passed self-review. The [performance receipt](implementation/2026-11-01-creator-editor/s00-04-performance.md) records short isolated Edge samples, including a test-seeded 720p cache; normal proxies are 480p. Native, painted-frame, whole-process, model and two-hour measurements remain open. Packaged FFmpeg remains unresolved.

## First-improvement S00.03 checkpoint — November 1, 2026

[Issue #125](https://github.com/sahamo123/dax-editor/issues/125) prepared offline acceptance fixtures on `codex/s00-03-acceptance-fixtures` and was verified with self-review; current work is in the newer section above. The [fixture inventory](implementation/2026-11-01-creator-editor/s00-03-fixtures.md) distinguishes regenerated synthetic clips from authorized private footage and records unresolved real-media and packaged-runtime gates.

## First-improvement S00.02 checkpoint — November 1, 2026

[Issue #123](https://github.com/sahamo123/dax-editor/issues/123) reconciled source capability and history claims on `codex/s00-02-capability-reconciliation` and was verified with self-review; see the current section above. S00.01 is VERIFIED in [issue #121](https://github.com/sahamo123/dax-editor/issues/121) and [PR #122](https://github.com/sahamo123/dax-editor/pull/122); independent stage review remains pending. A normal-host test using packaged FFmpeg failed with `spawn UNKNOWN`; explicit system-FFmpeg tests are separate evidence and cannot establish packaged-runtime readiness.

## First-improvement baseline checkpoint — November 1, 2026

The user launched the first-improvement route. At this checkpoint S00.01 was verifying under [issue #121](https://github.com/sahamo123/dax-editor/issues/121); its [baseline receipt](implementation/2026-11-01-creator-editor/s00-01-receipt.md) records source ancestry, provisional scope, tool versions and a verified private project/history byte backup. The current state is in the newer section above.

## Detailed planning delivery — November 1, 2026

The [dated handbook](implementation/2026-11-01-creator-editor/master-plan.md) decomposes the creator proposal into 10 stages and 76 individually specified steps, with predecessor checks, acceptance/recovery instructions and one shared execution contract. [Progress](implementation/2026-11-01-creator-editor/progress.md) starts at **0/76 implementation steps**. [Review report](implementation/2026-11-01-creator-editor/review-report.md) records planning verification only; application acceptance below retains its historical scope. Tracking [#72](https://github.com/sahamo123/dax-editor/issues/72); latest continuation `codex/staged-implementation-handbook`.

The folder coordinates context, current handoff, issue-backed progress, decisions, gotchas, errors/recovery, evidence and daily logs. First-improvement is 21 steps /10–17 engineering person-days; desktop creator is 68 /56–95; full hosted is 76 /64–109 before contingency and artist time. No implementation goal has been started. Review and launch a selected route explicitly; no required failed/blocked gate may be skipped.

## Creator workflow planning — November 1, 2026

[Creator-platform review and implementation plan](specs/creator-platform-plan.md) is a documentation-only proposal based on source `2032f0d`; tracking [#70](https://github.com/sahamo123/dax-editor/issues/70), branch `codex/creator-platform-plan`. It covers current gaps, content profiles, layered composition, curated Blender characters, reference-style analysis, bounded specialist workflows, optional personal hosting, effort/dependencies and a proposed project/module outline. No new application capabilities, runtime validation or release readiness are claimed. Begin with M0 baseline reconciliation and M1/M2 workspace/profile work when implementation is requested; the current setup/native boundaries below remain in force.

Planning checks pass: docs indexes/OKF, lint and 35 local links. Full application/browser/native checks were not rerun for this documentation-only delivery.

## Design skill setup — November 1, 2026

Impeccable 4.8.0 is installed at a pinned upstream commit for Codex and the project Antigravity workspace. [Setup, integrity pins and UI/UX brief](engineering/impeccable-design.md) describe manual-context use, private install receipts and reproducible installation on another laptop. Root AGENTS.md governs the skill: no launcher/engine download, hooks, live injection or CSP/permission changes. This adds design guidance only; no application UI or live project has changed. Tracking: [#68](https://github.com/sahamo123/dax-editor/issues/68), branch `codex/impeccable-design-setup`, based on the complete laptop handoff branch below.

[PR #69](https://github.com/sahamo123/dax-editor/pull/69): final full check PASS (1,799 package +17 root tests, 67 explicit platform/opt-in skips), docs/OKF/lint and fresh-folder reinstall with matching tree hashes PASS. Ignored receipts/log: `artifacts/impeccable-reinstall-result.json`, `artifacts/impeccable-setup-final-check.log`. The skill is available on the next Codex turn; no UI audit/redesign is claimed by installation.

## Cross-laptop handoff — October 31, 2026

Continue from `codex/laptop-agent-handoff`, based on the published October 27 application tree. Read [the current continuation guide](engineering/laptop-continuation.md) for the exact baseline, fresh Windows commands, live MCP configuration, private data boundaries and prioritized issue links. Root README/AGENTS and setup entry points now agree. Default `main` remains older; stacked implementation PRs are not merged by this handoff. Tracking: [#66](https://github.com/sahamo123/dax-editor/issues/66).

This is a documentation handoff, not a new native-release certification. October 27 evidence below retains its original scope; runtime-running statements describe that checkpoint. Rerun checks on the new laptop. Local creative evidence additionally contains three decoded 30-second vertical ad variations under ignored `artifacts/workshop-ad-variations/`; no private media or credentials are published. Their October 28 event date has passed. Projects/media need a separate private transfer and relinking; models/dependencies are reproducible downloads.

Fresh October 31 `pnpm check` PASS: 1,799 package +17 root tests; 67 explicit platform/opt-in package skips. The normal Windows host passes the symlink fixture denied by the initial stopped sandbox run; no assertions or security settings changed. Docs indexes/OKF and 37 handoff links also pass. Private log: `artifacts/laptop-handoff-check-authorized.log`. [PR #67](https://github.com/sahamo123/dax-editor/pull/67) carries this handoff; new-laptop/browser/native acceptance is not inferred from the source checks.

## Complete-effects review continuation — October 27, 2026

Real-footage acceptance also passes: an authorized 60.13-second Drive clip is imported through a real MCP SDK client over the stdio editor proxy into a separate live project. A grouped trim (source seconds 2–22), title and volume edit becomes one history entry; MCP undo/redo restores the actual timeline, and a separate Planning connection refuses edits. MCP export produces a fully decoded 20-second 1280 x 720 audio/video MP4; complete-effects WebM review also passes. Six MCP-origin tasks are recorded. Private local evidence: artifacts/real-video-mcp/result.json, run.log, edited-project.dax.json and edited-review.webm. Original Drive footage and previous-project backup remain intact. This verifies real MCP transport/tools against the visible live editor; it does not establish a Claude/Codex assistant inference session. Private footage, identifiers, titles and screenshots are excluded from GitHub.

**Ready for development testing. Owner-laptop native release remains NOT READY because Application Control blocks unsigned app/rendering executables.** The development editor is running at http://127.0.0.1:4175/ using the explicit system-FFmpeg launcher, with saved data retained in .dax-data/. No machine policy was changed.

Current pnpm check passes: **1,799 package tests plus 17 root tests**, followed by all **39 browser workflows**. Evidence: artifacts/job-state-full-check.log and artifacts/job-state-browser.log. The rebuilt live preview completes review and returns to idle (artifacts/job-state-live-review.png). PRs #55–#63 contain the latest implementation and acceptance continuation; main is unchanged.

**Installed-native acceptance [40532196608](https://github.com/sahamo123/dax-editor/actions/runs/40532196608) PASSES** on the corrected installer: clean install, actual native Open/Save file dialogs, decoded interactive playback, manual title/undo/redo, complete-effects review playback, audio/video MP4 export, saved restart, graceful shutdown, same-version reinstall persistence, and project/state preservation after uninstall. Bundled local AI is installed/supported and remains unloaded during manual editing. Downloaded, SHA-256-verified evidence: artifacts/native-windows-acceptance/pass-18/result.json and native-review.png. Evidence archive 12747475077: 147,613 bytes, SHA-256 1254beef915ce9898abbe638db27b58be518cb37b4c4488871dca276ea048b5f. Actual application binary SHA-256: 71d54d7724142161070d26a89c7cb7303cef2492b944f3df7079b5328734188b. This does not establish owner-laptop execution or cross-version upgrades.

The corrected unsigned Windows installer build [40528351026](https://github.com/sahamo123/dax-editor/actions/runs/40528351026) PASSES, source 4de7ce832591efbcad6625a0ecdb3cf981db1314. Archive artifact 12744853483: 1,705,302,024 bytes, SHA-256 6f80ee550e891e0ee3cd903db1f278d1d857b879ed967fa880731e36dd036ae5. No verified current installer copy is local; previous large transfers failed. Source ZIP, complete verified Git-history bundle and dependency/model caches remain local. Current receipt: artifacts/DELIVERY.json.

The real native extension exposed a completed render stuck at 100%. PR #61 fixes job-event/editor-state synchronization, guards terminal outcomes against stale running snapshots, and captures project/history/jobs after asynchronous provider discovery. Five UI and one server regressions fail before and pass after the fix. See [job completion ordering](specs/job-completion-ordering.md). Native run 40530091909 passed review but falsely reported workflow success after a Save-driver failure; its FAIL result is authoritative. The wrapper now retains the child handle, rejects invalid exit markers and independently requires result PASS. Run 40531328404 correctly failed on Save selection; the corrected owned filename edit notification is verified by the complete passing run above. No global keyboard input, owner-desktop automation or policy changes were used.

Complete-effects review renders zooms, images, music/ducking and captions through the shared export renderer into revision-bound private VP9/Opus WebM; MP4 export is unchanged. Generated-media/component/browser checks verify authenticated Range serving, stale revision invalidation, unchanged history, progress/cancellation/retry, playback and cleanup. The in-app browser cannot play the existing H.264 interactive proxy; its WebM review works. Actual Windows WebView2 interactive playback passes in native acceptance.

The fresh local-model connection/tool probe passes in 12.7 seconds. The real offline suite passes format, title creation/revision, volume, unsupported no-edit request, trim, manual-only/edited export, restart persistence and model cleanup (artifacts/offline-smoke-1793106272961/result.json). Measured requests take 17–96 seconds; inference is functional but not instant. Restricted socket-table visibility initially caused an ownership-check failure; normal authorized Windows execution restored the existing checks without weakening them. Longer synthetic offline speech passes: 143.65 seconds, 318 words, 89 caption lines, correction, reviewed cuts, trim and export, with 68.625 ms stream drift (artifacts/speech-longform/result.json).

| Delivery work | Verified/implemented | Remaining release gate |
|---|---|---|
| T01 baseline | Current full checks, browser suite and installed-native workflow pass | Owner-laptop native execution remains separate |
| T02 tasks/revisions | Queue/steering/Planning/cancellation/recovery tests; native job completion correction | Broader actual-client task scenarios |
| T03 providers | Independent saved connections and truthful status; real local AI suite | Actual OpenAI/OpenRouter/custom edits with configured credentials |
| T04 manual/projects | Native file dialogs/import/playback/manual title/undo/review/export/restart pass; browser effects/project tests pass | Missing-media and broader owner-footage acceptance |
| T05 workspace | Resizable chat/timeline/tools; browser tests and native 1024 x 700 review | Windows display scaling/full accessibility walkthrough |
| T06 speech | Offline assets and longer synthetic correction/cut/caption/export pass | Human-recorded/hours-long media |
| T07 MCP | Shared live project, revision/task/cancellation and configuration tests | Individual actual Claude/Codex assistant-driven sessions |
| T08 Blender | All three templates/render/regenerate/undo/cancel pass in Linux | Optional local Windows Blender remains policy-blocked |
| T09 release | Corrected installer and complete installed-native workflow pass; source/history/dependencies local | Owner-laptop execution, current installer transfer, cross-version upgrades/scaling and peak memory |

Current Windows CI for PR #62 passes. Experimental macOS rendering/fallback/bridge failures remain tracked in issue #39; Windows-first scope is unchanged. Hosted provider availability remains false until credentials are configured; no live hosted call or real external-assistant session is claimed. Paid providers and Blender remain optional. Use Start Development Preview - System FFmpeg.cmd for local testing while preserving .dax-data/.

## Autonomous continuation — October 23, 2026

T03 named connection snapshots and desktop Save/Load/Remove controls are implemented (PRs #40–#41). Same-family accounts retain isolated private keys; loading never invokes inference. Builds, 37 targeted server/security tests, 52 UI/controller tests and all nine settings browser scenarios pass. Existing settings remain compatible.

T04 manual zoom, music/SFX, ducking and image controls are implemented. Seven media-upload regressions pass, including real WAV validation; the laptop browser workflow verifies zoom adjustment, actual WAV/PNG selection, undo/redo, manual tasks and playable video/audio export without AI. Exact effect appearance is reviewed through export while preview parity remains limited.

Real Blender acceptance passes in Linux run [39920503783](https://github.com/sahamo123/dax-editor/actions/runs/39920503783): all three templates, import, regeneration/undo and cancellation cleanup. Evidence: `artifacts/blender-real-evidence/result.json`. Local Windows Blender execution remains blocked. Longer offline speech also passes on 143.65 seconds of synthetic narration, with 318 words, corrected captions, a reviewed pause cut, trim and synchronized export (68.625 ms drift, below one 12 fps frame); `artifacts/speech-longform/result.json`. This does not establish hours-long or human-recorded speech performance.

T07 adds typed `cancel_task` through the shared registry, with active-project ownership and Planning exclusion; reads and cancellation no longer wait behind the render being stopped. Targeted live MCP/media/connection regressions pass. Full repository/browser gates are being refreshed. Native installation and actual hosted/client sessions remain separate. The October 22 evidence below is historical baseline, not certification of this continuation.

The Codex setup box now emits valid multiline TOML. Its component regression and the installed Codex CLI parser both accept separate edit/Planning launch settings, including Windows paths (`artifacts/codex-config-acceptance/result.json`). This is configuration verification, without inference or global client changes. The preview is saved, rebundled and reconnected with current engine source; installed local AI remains unloaded until requested (`artifacts/autonomous-preview-smoke.log`, `autonomous-preview-final.png`).

Final current-source gates pass: `pnpm check` (1,788 package tests plus 14 script tests), all 39 browser workflows, and the subsequent build/type/lint refresh after correcting the client snippet. Logs: `artifacts/autonomous-final-check.log`, `autonomous-final-browser.log`, `autonomous-final-fast.log`. Windows junction fixtures and browser process cleanup required the normal authorized host rather than the restricted sandbox; the clean reruns pass. Documentation indexes/OKF pass. The latest unsigned candidate is built through PR #51; native readiness remains separate.

Current Windows candidate [39925892009](https://github.com/sahamo123/dax-editor/actions/runs/39925892009) **PASSES**, source `4e019ae9a2486bdcf1fce4c053704ce2f8bbd365`. Archive artifact 12489234079: 1,705,237,220 bytes, SHA-256 `389098aa3fd5b27ae3c911c2854ce5d99529c81c1c9dbaeffc5f864a259c3314`. The installer itself is 1,705,237,046 bytes, SHA-256 `14b8d9925cfbec3a94000665fb237e24e192c33263ab5abd37cb1881898f7ff0`. A transport-only follow-up [39927794724](https://github.com/sahamo123/dax-editor/actions/runs/39927794724) splits that exact artifact into 26 hashed parts; its byte-preservation regression, all 15 root tests, lint/dead-code and docs/OKF pass (`artifacts/candidate-transfer-check.log`). Even a 64 MiB connector download times out, as does the standard browser download event. Only the small signed receipt has been downloaded and hash-verified. **No verified current installer exists locally.** Obtain it from the linked successful build; do not substitute an older installer. Native execution/installation remains unverified and policy-blocked.

## Functional desktop release — October 22, 2026

The owner approved the [functional release contract](specs/functional-desktop-release.md), tracked by [issue #8](https://github.com/sahamo123/dax-editor/issues/8), issues #9–#17 and dependent draft PRs #18–#37. Implemented: task/revision guards, captured queued settings/credentials, provider probes and independent provider namespaces, project lifecycle/relink/manual controls, responsive tools, offline speech, live-session MCP, and optional bounded Blender templates. Current application source (0d1b7e7) passes `pnpm check`, 37 browser workflows and 25 Rust tests. Packaging follow-up f42200a passes 13 shell-script tests, dead-code checks and actual local offline-resource preparation. Native release remains **NOT READY**; no security policy has been changed.

- **Verified now:** real speech transcription/correction/captioned export (23 words; stream durations differ by under 1 ms), MCP transport/read-only/revision/batch tests, and laptop manual project-copy/undo/redo controls. See the contract and root tracker for evidence paths.
- **Local AI:** on-demand startup and configurable idle unload are implemented. The stronger offline suite passes format/title/follow-up/volume/trim/unsupported requests, manual-only export, restart persistence and inference cleanup with outbound fetches refused. Final assertions include fit/fps/title timing preservation (ADR 0015). Evidence: `artifacts/offline-smoke-1792707259245/result.json`. Measured requests took 49–129 seconds on the i5-8265U; first response took 15–85 seconds. This is slow and does not establish arbitrary-request correctness. A mid-run inference sample was 2.66 GB; whole-application peak memory remains unmeasured.
- **Blocked or pending:** actual hosted-provider edits without owner-configured keys; actual Claude/Codex sessions; multiple named same-family connections; complete manual parity; final installer and native clean install/upgrade/dialogs. The verified official Blender 4.5.14 executable is also blocked by Code Integrity event 3077, so real template renders are unverified. Local native rebuilding is blocked both at the Tauri Node binding and the official Cargo CLI's generated build helpers. PR #37 provides an unsigned artifact-only Windows candidate build; CI artifacts and native installation are separate gates.
- **Preview:** `Start Development Preview.cmd` uses persistent `.dax-data/`. It has been restarted with current application source; the final smoke verifies frontend, authenticated engine and installed/unloaded local AI (`artifacts/functional-final-preview-smoke.log`). Browser playback was observed after reconnect. Final screenshots live under `artifacts/functional-audit/final/`. Historical checkpoints below retain their original evidence and are superseded by this section.
- **Cloud checks:** Windows and Linux pass in run 39867954167. Experimental macOS fails because its FFmpeg lacks text/subtitle filters and process/fallback/path tests need investigation; [issue #39](https://github.com/sahamo123/dax-editor/issues/39) records the exact failures. This does not establish macOS release readiness.
- **Final local gate:** full `pnpm check` passed again after portable packaging changes and the evidence handoff (`artifacts/functional-delivery-final-check.log`). Documentation indexes/OKF also pass after recording the macOS follow-up. This supersedes earlier notes that the final gate was still running.
- **Installer candidate:** [Windows build 39867954073](https://github.com/sahamo123/dax-editor/actions/runs/39867954073) succeeds and uploads the current unsigned NSIS candidate (1,705,211,086-byte ZIP, SHA-256 `d5a5db25a804b67e137a6dc662a9ecb8c1adef01c4f843559cf725d386223760`, source head a889a7f3c777ae8cfb49a98189ab33a22881953d). This is build evidence only. The local connector caps downloads at 512 MiB; a follow-up build supplies four separately hashed transport parts. Actual local installation remains unverified.
- **Local installer transfer:** bounded run 39906232080 also succeeds, producing all four transport parts. The connector times out even on the 289,634,369-byte final-part ZIP; browser download also failed to complete. No verified current installer copy exists locally. Use the successful GitHub run to obtain the unsigned candidate manually; do not substitute the October 20 installer. A visible-directory transport-only follow-up (39906791452) was still running at this handoff and is not needed to establish the earlier successful build.

## Windows laptop checkpoint — October 20, 2026

The next continuation ([issue #6](https://github.com/sahamo123/dax-editor/issues/6), branch `codex/lightweight-ai-providers`) adds explicit OpenRouter setup with isolated key storage, model ID and context/output/temperature settings, plus generic OpenAI/LM Studio/Ollama endpoint presets. Hosted connection status is configuration only; no paid API was called. A verified 533 MB Qwen3.5 0.8B trial measured 17.74 tokens/second but failed a basic format edit and changed an unsolicited fit parameter. It is not promoted to the shipping catalogue; 2B remains bundled. MIT llama.cpp remains the embedded runtime, LM Studio is optional. See [the spec and trial outcome](specs/lightweight-ai-providers.md).

The preview now has a browser video picker and local streaming upload, including dropped files and chat video attachments (1 GiB per file, up to 10 attachments per request). Send queues follow-ups; Steer task adds guidance to the active run at its next model step without cancelling or restarting it; attachment/mode changes continue after the active run. Tasks show queue positions, status and recent results, persisted in private `tasks.json`. Engine restart marks unfinished work interrupted. Planning/Edit is captured per request; Planning exposes only read-only registry tools and never imports attachments into the timeline (ADR 0013, [issue #4](https://github.com/sahamo123/dax-editor/issues/4)). Manual timeline history and export jobs retain their existing tracking.

Local replies stream with template thinking disabled, a 512-token cap and a 90-second per-request timeout without retries. A live file chooser imported generated footage and played its preview; a real offline Planning reply completed without timeline changes. Full checks pass in `artifacts/chat-tasks-full-check.log`; subsequent attachment/drop/control regressions have separate final logs. The native installer predates these preview improvements and remains unvalidated.

The browser preview launcher now redirects the plain root address to the current engine session. Fresh tabs and bookmarks no longer require manually carrying the per-launch engine URL/token; this also replaces stale remembered connections after a launcher restart. The redirect stays loopback-only and is not cached.

Current local implementation and evidence supersede older "not merged" / "Windows untested" statements below. Delivery remains **NOT READY** until native validation is completed.

- Source and dependency caches are in the laptop checkout. See [the implementation plan](engineering/windows-desktop-plan.md) and `DEVELOPMENT-TASKS.md` at the repository root.
- The native Windows executable compiled. The shell now targets the React editor and bundles the full engine, fonts, skills and templates. Export save permission is narrowly granted (ADR 0011).
- Real Windows FFmpeg overlay export failed before the drive-colon fix and passes after it (17 filter/render tests). Real-engine browser integration passed 3 tests.
- A fresh-data-directory bundled-engine test, with outbound fetches refused, started Qwen 3.5 2B, made an actual AI title edit, exported video/audio, preserved the edit on restart and cleaned up inference. Evidence: `artifacts/offline-live-smoke.log` and `artifacts/offline-smoke-1792517191814/result.json` (local, ignored).
- Single-installer packaging includes the verified small model, pinned CPU runtime, licence/provenance records and app-local Microsoft C++ release DLLs. WebView2 uses its offline installer. The unsigned NSIS installer rebuilt successfully with the render/archive/shutdown fixes (1.53 GiB). Installation validation is blocked. See ADR 0012 and the ignored local delivery record `artifacts/DELIVERY.json`.
- Two native startup defects were isolated: Node 22 rejects Tauri's verbatim Windows drive paths; path normalization passes a Windows Rust regression. Zod 3's `toString` assignment fails with frozen Object.prototype; a minimal pnpm dependency patch preserves prototype freezing. That startup regression and 3 real-engine browser tests pass (4 total).
- Windows Application Control event 3077 blocked the unsigned executable. The owner confirmed this is a personal laptop with administrator access but no signing certificate. Registry `VerifiedAndReputablePolicyState=1` reports Smart App Control enforcement; administrator access alone does not override it. Policy-trusted signing or an authorized development environment is required for native validation. No security settings were changed.
- The full required `pnpm check` passes on Windows (`artifacts/check-windows-verified.log`); the final added preview launcher also passes lint/dead-code checks. Windows fixtures now use junctions and native path expectations. Bridge fake executables run through a test-only adapter; POSIX-only mode-bit and signal-forwarding assertions are explicitly scoped. All 32 browser editor workflows pass (`artifacts/desktop-all-e2e-verified.log`).
- A browser teardown failure reproduced a real engine shutdown race: FFmpeg still held a preview file after shutdown returned. Media tasks, process close events and export completion/cleanup are now awaited. The regression failed before the fix and passes afterward; 40 pipeline/server checks pass.
- `Start Development Preview.cmd` runs the browser editor with the packaged offline engine. Its real-model smoke passes (`artifacts/development-preview-smoke.log`); data persists in ignored `.dax-data/`. This gives a usable development workflow while native launch is blocked. Browser imports use typed file paths; native dialogs remain unverified.
- Delivery work and remaining gates are tracked in [GitHub issue #2](https://github.com/sahamo123/dax-editor/issues/2) and the root task tracker.
- The original two-hour deadline was missed. Speech installation controls, native import/save/export dialogs and the final clean-install test remain incomplete or blocked. No ready desktop release is claimed.

## Historical upstream baseline (superseded by the October checkpoints)

The sections below preserve the earlier handoff for provenance. Their "not merged", "not run" and feature-absence statements describe that earlier branch, not the current functional-release source. Use the October 22 section and linked acceptance contract for current work.

## Where we were

Resuming from another agent or machine: start with [the handoff guide](engineering/handoff.md).


The engine, command registry, skills, templates, agent, engine server and launcher, the desktop app's browser build, the `dax` CLI and the `dax-mcp` MCP server are merged on branch `claude/exciting-lamport-1k91fh`. There is no installed product yet: the Tauri shell is still in progress, the embedded local model and speech-to-text are wired into the engine (not yet merged, and not yet installed by any user action), and an independent review has open findings that a hardening pass is fixing. The plan and its checklists are in [ROADMAP](ROADMAP.md).

## Works today

- **Command registry** (`packages/core/src/commands.ts`, `template-commands.ts`, `effect-commands.ts`): 45 commands with typed arguments, model-facing descriptions and JSON-schema tool specs. It is the only way a project changes.
- **Timeline and edits**: undoable pure edits, a gapless main track, clip fades, and 8 ms audio fades at real cuts so joins do not click. Cuts sit on the project's frame grid, and each source is converted to the project rate once before trimming, so picture and sound end together after 60 joins (measured, see [A/V sync](research/av-sync-and-breath-recipes.md)).
- **History tree** (`session.ts`): states tagged manual, AI or template; jump to any state; named checkpoints; undo then edit keeps the old branch.
- **Cut engine** (`cuts.ts`): speech detection relative to the noise floor, five presets (gentle, standard, tight, podcast, tutorial), and reviewable cut plans. Commands `plan_cuts`, `apply_cut_plan`, `smart_cut`. Filler-word cuts need a transcript from `transcribe`, which needs the speech runtime and a model installed (see Known issues).
- **Word-timed captions** (`captions.ts`): three looks burned in via ASS, following every cut. Command `set_captions`. Needs a transcript.
- **Text overlays** (`overlays.ts`, `overlay-filters.ts`, `presets.ts`): titles, lower-thirds, captions and callouts, with six animation presets rendered by FFmpeg `drawtext`. Overlays follow ripple deletes. Text is safe from filter injection. Inter (OFL-1.1) is bundled.
- **Effects layers** ([spec](specs/effects-layers.md); `zoom.ts`, `audio-layer.ts`, `image-overlays.ts`, `effect-commands.ts`): punch-in and push-in zooms with easing and a focus point (`add_zoom`), music and sound effects on an audio track with automatic ducking under speech and a limiter so the mix cannot clip (`add_audio`, `set_ducking`), and PNG or JPG logos, watermarks and stickers with five presets and the text animations (`add_image_overlay`). All undoable, safe to repeat, and checked by measuring rendered frames and audio levels. Music is anchored to the timeline, so ripple deletes do not chop it; zooms, images and sound effects follow the footage.
- **Templates apply more**: a template's `effects` (zoom moves, a music bed, a logo) are now applied instead of skipped. Music and logos are never bundled: pass `music` or `logo` to `apply_template`, or the step says what to do.
- **Output shape**: fit modes (contain, cover, blur) and format presets via `set_format`: landscape 1080p and 720p, portrait 1080x1920, square 1080, portrait 4:5.
- **Renderer** (`render.ts`): LGPL-safe encoder choice; main track, overlays and captions in one FFmpeg command.
- **Templates**: 34 style and industry recipes (16 styles, 18 industries) in `templates/`, applied by a deterministic applier with no AI involved. One applied template is one history entry.
- **Skills**: 24 `SKILL.md` playbooks plus a router in `skills/`. The loader picks the few that fit a request within a character budget.
- **Agent** (`@dax/agent`): a tool loop over the registry with OpenAI-compatible and Anthropic providers, JSON repair and recovery of tool calls written as text. It needs a provider the user configures: an API key, or an OpenAI-compatible endpoint. Eval adapters let the eval harness score any provider on the same loop.
- **Engine server** (`@dax/server`, bin `dax-server`): HTTP and WebSocket API on 127.0.0.1 implementing `@dax/protocol`. Serves media with HTTP Range support. Checks the bearer token, Host and Origin.
- **Engine launcher** (`@dax/engine`, bin `dax-engine`): starts the server with the agent, skills and provider registry wired in, plus the built-in local model (download, start, stop, cancel, uninstall) and the whisper.cpp speech engine. Nothing downloads until the user asks; missing speech setup reports `transcription unavailable: <reason>`.
- **Desktop app, browser build** (`apps/desktop`): app shell with chat, settings, history, a media bin and a reconnecting client. Editor with a gapless two-video preview, a CSS overlay preview matched to the FFmpeg output, timeline editing (reorder, trim, split, fades, volume, overlay lanes, snapping, zoom), drag-and-drop animation presets and an inspector. Playwright tests live in `apps/desktop/e2e`.
- **CLI** (`packages/cli`, `dax`): `commands`, `run <command> --json '{...}'`, `project new|show`, `import`, `cut`, `export`, `mcp`, `serve`. Machine-readable `--json` output and documented exit codes. Projects persist as `.dax.json` with their undo history, so `dax run undo` works between invocations.
- **MCP server** (`packages/mcp`, `dax-mcp`): every core command as a tool (annotations from `readOnly`/`irreversible`), a `preview_frame` image tool, project and history resources, export progress and cancellation. stdio, or loopback Streamable HTTP with a bearer token and Host/Origin checks. See [CLI and MCP server](architecture/cli-and-mcp.md).
- **Core engine basics**: FFmpeg probe, silence detection and scene detection; transcript helpers; `Connector` interface (local).
- **Shared contract** (`packages/protocol`, `@dax/protocol`): request, response and event types for the server, desktop UI and agent, including the local-model, job, chat and import reply shapes as zod schemas. The server is the source of truth; the desktop client checks the shapes it cannot guess.
- **Desktop e2e against the real engine** (`apps/desktop/e2e`): Playwright runs the app against the real `@dax/server` in-process (fake assistant and local model only) and against the real `dax-engine` process (`pnpm --filter @dax/desktop test:e2e`).
- **CLI bridges** (`packages/bridges`, `@dax/bridges`, see [CLI bridges](architecture/cli-bridges.md)): Claude Code runs as a chat backend through the user's own signed-in `claude` binary. dax exposes its editing tools over a per-run loopback MCP endpoint on the live project session, and edits are credited to `ai`. The CLI may use only those tools. Settings shows not installed, not signed in, or ready. Codex is detected and reported as not supported yet. Gemini is deliberately not supported. Tested with a fake CLI, plus a recorded real run. Credentials are never read.
- **Evals harness** (`packages/evals`): oracle adapter passes 3/3 starter tasks.
- **Tooling**: `pnpm check` runs lint, typecheck, knowledge-base validation, doc coverage, dead-code check and tests across all packages. Test totals, all passing: core 365, desktop 292, agent 157, server 116, MCP 52, CLI 25, evals 21, protocol 5, engine 51, scripts 14.
- **Dev environment**: Biome lint and format, TypeDoc doc-coverage gate, knip dead-code check, git hooks (the pre-commit hook blocks commits that fail lint), AGENTS.md and contributor docs.
- **Knowledge base**: OKF validator and index generator (`pnpm docs:okf`, `pnpm docs:index`); ADRs 0001-0009 (0006 is a draft proposal); engineering docs; architecture overview and CLI/MCP architecture; evals docs; product v1 spec (draft); research reports; scribe and researcher agent definitions.
- **CI workflow** (`.github/workflows/ci.yml`): written, with Linux required and macOS and Windows non-blocking. It has not yet run on GitHub.

## In progress

Built in separate git worktrees under `.claude/worktrees`. Every commit on those `worktree-agent-*` branches is already on `claude/exciting-lamport-1k91fh`, so the worktrees are local scratch and are not needed. Check `git log` before trusting any "not merged" line below. The one unsaved edit is in [docs/handoff](handoff/README.md) (the local-llm archive symlink patch), and it does not apply cleanly yet.

- Hardening pass for the independent review's 3 high and 9 medium findings: export encoder fallback, preview blocklist, rollback after a failed autosave, path traversal through overlay ids, atomic and cancellable export, history pruning, a cancel signal, context budgets for small models, and safe template replacement.
- `@dax/local-llm` and `@dax/stt` are wired into `@dax/engine` (the default local-model controller and speech transcriber, with tests that need no network). Branch `claude/exciting-lamport-1k91fh` carries the wiring; it has not been merged. The live llama.cpp and whisper.cpp tests stay opt-in.
- Tauri shell (`apps/desktop/src-tauri`): built and checked on Linux with the engine sidecar. macOS and Windows packaging, signing and the release workflow are not run; see [ADR 0010](adr/0010-desktop-sidecar-packaging.md) and the maintainer guide.
- Reconciling the desktop client with the engine server API.
- Core engine: zoom keyframes, music ducking and image overlays.
- Scouts on cut-quality field notes, audio enhancement and screen recording.
- CLI bridges, open items: Codex needs a confirmed per-run MCP setup before it can run (API key first, subscription sign-in opt-in). The Claude bridge still needs a live end-to-end check on each supported Claude Code version, and a written answer from Anthropic on the bridge (the compliance page suggests asking sales).

## Next up (in priority order)

Each item starts after the in-progress builds it depends on are merged.

1. Merge the hardening pass and the desktop-client reconciliation, so the desktop app runs end to end against the engine server.
2. Merge the local model and speech-to-text wiring, add the desktop controls that install them (the engine has no install route for speech yet), then run the model evaluation study on real models. The adapter exists; no real-model run is recorded yet.
3. Draft/approve flow for external MCP agents ([ADR 0006](adr/0006-draft-approve-for-external-agents.md)). Today MCP edits the live session, credited as AI and undoable.
4. Tauri desktop app in a real window: chat on the left, preview and timeline on the right.
5. Engine gaps from the creator research: a second video layer for B-roll; shapes and generated cards; finding where to zoom automatically (cursor, code, face); automatic sound-effect placement; transitions. Music and sound-effect layers, punch-in and zoom, and image overlays are built in the engine (the effects layers); wire them into the server, the protocol types and the desktop timeline.
6. Screen and mic recording.
7. Connectors: Google Drive first, then rclone.
8. Plugin system ([plugin architecture research](research/plugin-architecture.md)).

## Blocked / needs a human

- Set up repo settings per `docs/maintainers/repo-settings.md`: branch protection, required CI, private vulnerability reporting, Dependabot.
- Provide a Code of Conduct contact email. Until then, the interim route is GitHub private reporting.
- First CI run on GitHub, to confirm Linux passes and to see macOS and Windows results.
- Real macOS and Windows testing. Nothing has been run on either system yet.
- Signing for the macOS and Windows builds, which are unsigned. Signing needs an Apple Developer ID and a Windows code-signing certificate, which cost money and need a human to obtain. **(unverified: current prices)**
- Licence call, only if ever wanted: Mediabunny (MPL-2.0) for in-browser demux, or Twick (SUL, currently excluded by the dependency rule). See [timeline UI patterns](research/timeline-ui-patterns.md).
- Confirm the Gemma 4 licence and tool-calling behaviour before relying on it. The local-llm builder must confirm this. **(unverified)**
- Google Drive needs a decision on OAuth app verification: restricted scope or Picker. **(unverified)**

## Known issues

- CI has not yet run on GitHub.
- The local-llm archive symlink-chain patch (`docs/handoff/local-llm-archive-symlink-chains.patch`) conflicts with the current `archive.ts`, and nothing in it has been run. Finish it per [handoff section 4](engineering/handoff.md).
- pnpm 10 ignores the esbuild build script (`pnpm approve-builds` decides it). Dependencies and system tools are listed in [handoff section 3](engineering/handoff.md#3-dependencies-and-system-requirements).
- Projects saved before the frame-grid change are not re-quantised on open. Their cuts are snapped at render, so the timeline can differ from the output by up to half a frame per old cut. Breaths are kept and attenuated by 12 dB (see [cut intelligence status](research/cut-intelligence.md)); the per-preset breath depths and render ramp are not built.
- Windows and macOS are untested.
- The independent review's 3 high and 9 medium findings stay open until the hardening pass merges.
- Core export is not yet atomic or cancellable. Cancelling an MCP export lets FFmpeg finish in the background and then deletes its file.
- Speech-to-text is wired into the engine, but nothing installs its whisper-cli runtime or model yet (no engine route or desktop button), and the default never downloads on its own. Until a user or the developer provides `DAX_WHISPER_CLI` and a model, captions, filler-word removal and transcript-based cuts report "transcription unavailable".
- The embedded local model is wired into the engine but not merged, so the built-in chat still needs the user's own provider until a user downloads and starts the model. The desktop e2e test in `apps/desktop/e2e/real-engine.spec.ts` expects the real engine to show the local model as "not available"; with the wiring the card should offer a download instead, so that test will need updating (not run here).
- There is no Tauri shell yet, so the desktop app runs only as a browser build. The Tauri shell cannot be compiled in the cloud sandbox because the Linux WebKitGTK libraries are missing.
- MCP edits go straight into the live session with no approval step yet. They are credited as AI and are undoable.
- The effects layers are engine and command only: the server, protocol types and desktop timeline do not show zooms, audio clips or image overlays yet. The effects tests ran on FFmpeg 6.1.1 only; FFmpeg 7 is untested.
- Research reports contain claims marked unverified. Check them before relying on them, starting with [landscape](research/landscape.md).

## How to resume

1. Run `pnpm bootstrap` (one-time: checks the toolchain, installs dependencies, enables git hooks).
2. Run `pnpm check` (everything CI runs).
3. Run `git worktree list` to see the builds in progress, so you do not duplicate them.
4. Read the newest entries in [log](log.md), then pick the top issue in GitHub Issues.
5. After your work, do the scribe step (see [knowledge protocol](engineering/knowledge-protocol.md)).
