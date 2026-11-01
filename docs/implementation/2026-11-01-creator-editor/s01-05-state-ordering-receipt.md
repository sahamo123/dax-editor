---
type: Guide
title: S01.05 state refresh ordering child receipt
description: Reproduction and verification of stale desktop state handling.
tags: [implementation, state, recovery, testing]
status: draft
generated:
  by: process:implementer
  at: 2026-11-01T22:00:00Z
---

# S01.05 state refresh ordering

**State: VERIFIED with self-review.** [Issue #154](https://github.com/sahamo123/dax-editor/issues/154), [PR #155](https://github.com/sahamo123/dax-editor/pull/155), tested head `8ccea14c08fe51610be5ddb2715480c1117fc7c2`, tree `3c24460f1a9fc01a8745e18f29f00d5b33ccf4cb`, parent [#151](https://github.com/sahamo123/dax-editor/issues/151). It follows verified composer [PR #152](https://github.com/sahamo123/dax-editor/pull/152), commit `1ea0507cf7c0b00ffbf688f45b3b2f8803305072`. The [contract](../../specs/state-refresh-ordering.md) defines the bounded fix and compatibility.

A synthetic browser run observed a revision-1 push with a save error followed by a delayed revision-0 HTTP response without the error; the UI hid the warning. The private failed log SHA-256 is `873ba0cd279f94acbfd8651dc710a37cc5abc13158dd5e1972d8982d792d8815`. Deterministic tests reproduce stale same-project revisions and refreshes crossing project switches. A dependent, not-yet-published UI branch ran the original four-scenario browser recovery sequence three times after the candidate fix; this is integration evidence for that combined working tree, not a substitute for verifying this isolated child.

The corrected head passed `pnpm check`: 1,815 package tests passed with 67 skipped, plus 17 script tests. Ten focused browser workflows passed. Private source log SHA-256 `a5d27a2c8ead6cb8b270bf9f53125b9fa78e41fbc0050083ea9fd704bf1cdb86`; browser log `5d23d914a90f7f141d0812082d610055f2569614d825184bd10a684c9ed9667e`. The published diff and evidence received a separate self-review, not independent review. This guard is not a cross-client total-ordering protocol. Browser/system-FFmpeg results do not establish native desktop or DPI acceptance.

An initial isolated full check was intentionally stopped before completion to add coverage for two overlapping refreshes; it is not counted as a pass. The offline dependency restore used the existing pinned store with package scripts disabled.

The published first candidate passed a full source check and ten browser workflows, but review found that a provider-only refresh could suppress a newer project refresh. A new deterministic test reproduced that issue; the correction passed 31 focused controller/store tests and the fresh full/browser checks above. The earlier passes apply only to the first candidate.
