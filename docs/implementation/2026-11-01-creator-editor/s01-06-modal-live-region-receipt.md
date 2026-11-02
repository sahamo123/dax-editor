---
type: Guide
title: Modal task announcement accessibility-tree audit
description: Synthetic Edge accessibility-tree evidence and remaining real assistive-technology acceptance.
tags: [implementation, accessibility, dialogs, notifications, testing]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T18:40:00Z
---

# Modal task announcement accessibility-tree audit

**State: IN_PROGRESS / diagnostic only.** [Issue #262 / draft PR #263](https://github.com/sahamo123/dax-editor/pull/263), branch `codex/s01-06-modal-live-region-audit`, test head `2ea06cf90aa1f30423a195748e8becfd222e4f8c`, follows [PR #261](https://github.com/sahamo123/dax-editor/pull/261). No production behavior changed; this does not complete S01.06.

The existing notice stack is moved into the active dialog, while its polite and urgent live-region elements remain outside the dialog. A synthetic test inspected the full browser accessibility tree and partial nodes before Settings, after synthetic status and error outcomes while Settings was open, after Settings, and while rendered review was open.

On Windows and headless Edge `156.0.4314.58`, both nodes appeared in the full accessibility tree with an ancestor path to `RootWebArea`; each node itself was unignored and retained its polite or assertive live property and atomic property. Their underlying DOM elements remained identical across those dialog transitions. Both remained outside the modal in the DOM. The final asserted diagnostic passed (private log SHA-256 `4de68dc34fe5e334ade18f53085417ccb0a10a9d968b3c88e7adb624af7636b5`); earlier exploratory logs were `31296915002e3d34dcc7825175df02501b25810917f114a7153e241b9bb2deb3`, `ea34b4ea8c09f677f655eceec49e11c17f4f8408dc3b583cc979c719c4c8f53b`, and `6bc4362d989fa26f0e692d27daad2f3c73dcc46b32aee23fbf718faba659b2e0`. The test used fake task outcomes and a generated clip; its owned preview work was settled.

`pnpm check:fast`, `pnpm deadcode`, `pnpm docs:index` and `pnpm docs:okf` passed with the diagnostic and receipt. The preceding application/test head `7960135d19d8842fe9e6a5132d0eab6ed302ac76` passed the full `pnpm check`: 1,955 package tests passed, 67 skipped, and 17 script tests passed (log `f2d2201a6048b2abef8b4319cb305e2f4880fbb3b19c8c45108716771883b714`). Application source is unchanged; this test-only child does not retroactively run the full check on its own head. The separate self-review inspects the tree assertions and synthetic cleanup; it is not independent review.

This finding does **not** establish that Narrator spoke the messages, that screen-reader navigation within an `aria-modal` dialog includes the outside regions, or that native WebView behaves the same. Do not move the live regions or claim the suspected defect is resolved solely from this result. Actual task-specific screen-reader speech and keyboard-only import remain [#177](https://github.com/sahamo123/dax-editor/issues/177); native Windows/DPI testing and the broader S01.06 gate remain open.
