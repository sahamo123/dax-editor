---
type: Evidence
title: Keyboard editing, review and export workflow
description: Connected browser keyboard sequence using a pre-imported generated clip.
tags: [accessibility, keyboard, export, evidence]
status: draft
generated:
  by: process:scribe
  at: 2026-11-02T21:40:00Z
---

# Keyboard editing, review and export workflow

**State: VERIFYING.** [#279 / draft PR #280](https://github.com/sahamo123/dax-editor/pull/280), parent [#162](https://github.com/sahamo123/dax-editor/issues/162). This is an automated browser diagnostic of the connected workflow, not the required actual picker/manual assistive-technology walkthrough.

Two generated-media Edge browser cases passed for the staged test tree published as test head `bf81963207096c47db76c0f428600d57b9f05b25`, at 1000×768 and 1366×768. The fixture pre-imported a six-second synthetic clip and set a small output format before the interface opened. From there, Tab and keyboard commands selected the clip, stepped one second, split and removed the first section, undid and redid the deletion, opened a rendered review, played it with the keyboard and returned to editing. A keyboard-entered export path targeting a disposable existing file was refused; its sentinel contents and the edited project were preserved. A second keyboard-entered path exported successfully. Both streams decoded with the selected development FFmpeg; ffprobe reported a five-second file for each viewport. Final browser log SHA-256 `d6c5517e88b8b000ac060aba51721898117b455018a344b9a00c2f6f656e6962`.

Earlier progressively narrower browser runs passed before adding keyboard review playback; they do not replace the final run. The initial complete export-and-recovery run log is `13070cc5545324e4144940c8a38472f0fc1457f5f31dc55aae1d3c7b2e18d2c0`. These test-owned synthetic outputs are not user projects.

At the earlier test-only head `744e0a870d8a59d2c958a77978b1027ca423de3e`, `pnpm check:fast` and `pnpm deadcode` passed; fast log SHA-256 `56f0af0ab25353e5b8c34f476e301a18e8c3611239eb0b822063570a60032417`. After adding review playback, the desktop TypeScript check and scoped Biome check passed at the final test head. Application and package source are unchanged from the full-checked [toolbar candidate](s01-06-toolbar-layout-receipt.md) application/test head `d1dadc7bb4ec9c9b563cd18b89542da9fff1b467`; that full check passed on rerun after an unclassified Windows rename failure. It predates this new test.

The test does not operate the actual Windows file picker, exercise a real screen reader or establish native desktop, packaged runtime or DPI acceptance. The selected development FFmpeg is not packaged-runtime evidence. Self-review and independent review are pending; S01.06 stays open.