---
type: Guide
title: S01.06 side-panel keyboard access
description: Reproduced tab-panel navigation gaps, scoped fix and browser and source verification.
tags: [implementation, accessibility, keyboard, workspace]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T13:05:00Z
---

# Side-panel keyboard access

**State: IN_PROGRESS.** [Issue #238 / draft PR #239](https://github.com/sahamo123/dax-editor/pull/239), branch `codex/s01-06-tab-panel-access`, application/test head `5706eae39e484e114081bb48b723cebda7f9f1d9`, builds on [PR #237](https://github.com/sahamo123/dax-editor/pull/237) documentation head `e294734f007511be1ebbd6b4e7f1d8d433ccb080`. Predecessor ancestry and its full-check log hash were verified before the work. The S01.06 parent remains open.

## Reproduction and change

In a generated-video Edge session, Tab from the Inspector tab skipped its text-only no-selection instructions, and inactive tabs referenced absent panel IDs. Both checks failed before the change (private log SHA-256 `3f6b633083be18dd7960525ca482972cf34136ba381dcdd74c26fa961e6d803a`). A separate before screenshot test failed on the same focus assertion (log `babe29a8df209a83f128d93c0951504666a84523cb0cd5586a51a8be46acaca9`; inspected screenshot `aa8bffac41af4dadf687fd8f994a399943d80ecd6e4e1ff11d3b6f59dd97e111`).

Each tab now retains a labelled panel target; only the active panel mounts editing content and enters the tab order. An inset focus outline keeps the active panel's focus visible. This follows the [W3C tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/); it is not an accessibility certification.

## Verification and limits

The first post-change browser run passed three checks and failed the selection check because its synthetic `click()` did not trigger the timeline's pointer/keyboard selection (private log `2f87879278ca2a18c7ef1a02c3739b126c28239de52fcf247c1f0169867972bf`). The test was corrected to select with Enter and verify that the clip retained focus. Four affected browser tests then passed (log `98cb2811990d9fb51babbcb4af5c63865b4a78c61cc094513f5bf6db9ab6f0e1`). A later test-only addition checked the compact dock and Escape; 13 side-panel, dialog and responsive browser tests passed (log `faf3d7e9e387768b8bb3302b720bcb14fdc08c02a54c7a2c274ea4b12dd7e23d`). They used system FFmpeg diagnostically. Inspected screenshots show focus in the wide panel (`e020386ce8273b085b0a75d68a4e1f929401993407acbf3b467075e198421840`) and 1000×700 dock (`4508a3eb237d28f56b80b3b71e81801c532def291298a19bce2b48f79e654c30`).

Full host-authorized `pnpm check` passed at application/test head `5706eae39e484e114081bb48b723cebda7f9f1d9`: 1,896 package tests passed, 67 skipped, and 17 script tests passed (private log `ba4d629c614172aa17602dc91429ff64ef8ac463c477caa229d1fcae962ee1ec`). The compact check was added afterward as a test-only change and passed with unchanged application source. The first targeted formatting check flagged test formatting; it was corrected before the full run. Browser sizes are not native Windows scaling evidence.

Review remains pending. Actual screen-reader behavior, keyboard-only native file selection, and packaged Windows acceptance remain open; this child does not complete S01.06. Revert the application child commit to remove this change without reverting its predecessor. No private media or projects were used.
