---
type: Guide
title: S01.06 timeline keyboard interaction
description: Scoped listbox navigation, focus recovery, shortcut changes and verification evidence.
tags: [implementation, accessibility, keyboard, timeline]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T14:30:00Z
---

# Timeline keyboard interaction

## Modal focus correction — November 2

After the earlier passing run, self-review reproduced a focus-recovery defect: when a simulated modal was open and an external edit removed the focused clip, recovery focused a clip behind the modal (private failing log `f049d1efef52fabb5397e085adf8899dd5b94b5f016b579a38346593239fd560`). Application/test head `f9a46b3564289781177974b9437f9de8a37bc0f7` clears pending timeline recovery while a modal owns focus.

Fourteen integrated generated-media Edge checks passed at this corrected head (private log `843b4eff7ab28dbdbf84001d42f70d6e7b51fa577adbdc2ebb5a315e80c2cd1d`), including the synthetic modal scenario. The final focus screenshots were inspected at wide and compact sizes (hashes `69a639cfc01d5d6570c01e11e0aff7e5dc9ed72baabe1b807cbc6e1147ed0f40` and `08d98ce1f66da13e8e8c7534694db2638102b309d0edec4f8057722fcb625ef8`); both previews were preparing. Host-authorized `pnpm check` passed at the corrected head: 1,896 package tests passed, 67 skipped, and 17 script tests passed (private log `2f9b270b983b5fd10316137c42d48f1f404b3583beca1a426748b2a6c76fb21c`). Actual screen-reader speech, native picker and packaged/DPI acceptance remain open. Earlier results below are historical.

**State: IN_PROGRESS.** [Issue #243 / draft PR #244](https://github.com/sahamo123/dax-editor/pull/244), branch `codex/s01-06-timeline-keyboard`, application/test head `9d331ebf28713a377599fcd208b7e2dd9d6beab4`, builds on [PR #242](https://github.com/sahamo123/dax-editor/pull/242) documentation head `510b5be4c7fe7a64aa1c6a63c73a645cc6d4cc0b`. The [investigation](s01-06-timeline-semantics-investigation.md) records the predecessor behavior. The S01.06 parent remains open.

## Change

The timeline now exposes one roving listbox tab stop. Left/Right moves focus in timeline-time order; Enter selects without moving focus. DOM reading order, `aria-posinset` and `aria-setsize` follow that order, including offscreen items. Navigation mounts and scrolls to a virtualized destination rather than rendering the entire project. Focus and selection remain distinct. Removing the focused item returns focus to a remaining item or the empty listbox, but does not reclaim focus after the user moves elsewhere.

Space retains playback. While an item is focused, Ctrl/Command+Left/Right steps frames and Shift+Left/Right steps seconds; outside the timeline, Left/Right still steps frames. The shortcut reference and transport tooltips explain the contextual change. This is a deliberate interaction change; it does not alter project schemas or introduce a new edit path. Home/End retain their transport actions and listbox type-ahead is not implemented; long-list usability and actual assistive-technology behavior need separate assessment.

## Verification and limitations

An integrated generated-video Edge run passed 13 tests, including wide and compact keyboard selection, ordering, playback and frame stepping, offscreen clip navigation, keyboard deletion, a held deletion after focus moved, simulated external removal, side-panel behavior, modal shortcuts and overlay contrast. Private log SHA-256 `d21fb03d2919c4188f91cd6207bea4bc1776e2ef7ea04e26a15c9ffdf8f4fb89`. A subsequent test-only expansion verified offscreen navigation through both a clip and text overlay; one focused test passed with unchanged application code (log `c1b3e9deddd0f01265a94f3a8bb10d3ba03aa92533009a77dadbb61994f01d17`). Both runs used system FFmpeg and a scripted local engine, not the packaged runtime or an actual MCP client.

Private synthetic focus screenshots were visually inspected at 1440×900 and 1000×700 (SHA-256 `7a9c7edf69d6e592c96be88763f26ea6800645a45b0187726c65e545e185943f` and `1c55675381c1094d98aa23199f009c63b694b0cb1f113b46b734675c671ebf86`); the compact preview was still preparing and is not certified by its screenshot.

The first regression run failed because the old timeline had three tab stops; its offscreen case also had a test-only malformed slider value (log `a0114aa4b426a493a4e2905825f043f3aeda0e6bb70cb2a8c424e28b26d57a73`). Candidate checks then exposed lost focus after local and simulated external removal (logs `ebcc3429d64b1976bc210e994b63cbaff3ae662b769f646d982c2fa4d26d3950` and `f5e8a6d0fc78e2b6460f3587fff10370059566647bf4f8181e506e0732d1cca3`), and a mismatch between DOM and keyboard order (log `24e9fe055663a7ada11aa7314e53647e7f716dc674b1e17d81aef48d62adf1bf`). These were corrected before the passing run. Another expanded run was stopped after its first test timed out looking for Project as a button; Project is a disclosure. The selector was corrected and the rerun passed (interrupted log `62bcb9bd1935036c72438c60d3ca5899732098b8ebeb9abbd86352958b1f44d7`; passing pre-order-change run `bc241f1b2275cc04c060423057d5619ddee3543e950292d50dee3ee6957d03c4`).

Host-authorized `pnpm check` passed at `9d331ebf28713a377599fcd208b7e2dd9d6beab4`: 1,896 package tests passed, 67 skipped, and 17 script tests passed (private log SHA-256 `cbb3b84565830378e2dfdfbb0a4870b383803dbb02b236650e0e396c8c4b8203`). No private project or user media was used.

Review remains pending. The browser tests do not establish actual screen-reader speech, keyboard-only native file-picker completion, packaged Windows execution or DPI acceptance. Do not advance S01.06 on this child alone. Revert the scoped application commit through review if needed; preserve private projects and prior evidence.
