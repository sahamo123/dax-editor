---
type: Guide
title: S01.01 rendered workspace audit receipt
description: Browser-observed editing workflow, prioritized usability findings and design direction for the first-improvement route.
tags: [implementation, workspace, audit, evidence]
status: draft
generated:
  by: process:implementer
  at: 2026-11-01T13:25:00Z
---

# S01.01 rendered workspace audit

**State: VERIFYING, publication recheck pending.** [Issue #135](https://github.com/sahamo123/dax-editor/issues/135). Entry rechecked [issue #133](https://github.com/sahamo123/dax-editor/issues/133), [PR #134](https://github.com/sahamo123/dax-editor/pull/134), stage receipt, tested commit `1d520153a1f81d2429f815d2db5e655e1a0d538d` and tree `219fd8dbce965c48986b9b445fd4db4d3d2957ea`; that commit is the current branch ancestor. Independent S00 review and its correction are recorded in the predecessor receipt. No application source changed after the tested baseline.

## Method and boundaries

On November 1, 2026, isolated Playwright sessions used Windows Edge 156, a fresh local preview and generated six-second test video. One session used the real engine with system FFmpeg/ffprobe and no configured provider; another used the real server with a scripted assistant. Tests ran on the normal host after a restricted-sandbox attempt failed before useful execution. The first harness attempt also failed before testing because its private configuration loaded as the wrong module format; the corrected runs passed. These are browser observations, not packaged-runtime, Windows display-scaling, actual-provider or real external-client acceptance. Private originals and metrics are in ignored `artifacts/s01-01-workspace-audit-20261101/`; do not publish unredacted paths or transient tokens.

Fresh empty, malformed-import, imported, edited, rendered-review and export-dialog captures were taken at **1366×768, 1440×900 and 1920×1080**. A separate control run captured compact 1024×700, selection, task and maximum-chat-width states. Four isolated audit scripts passed individually; rendered review reached a playable-ready video element and the export dialog was opened. The earlier S00.05 isolated walkthrough actually exported and fully decoded video/audio, saved/reopened, and tested undo/redo; that existing evidence is reused at its recorded SHA, not newly claimed from the audit dialog.

The captures contain generated media. The error capture had the account component of local paths replaced with `[user]` in the live DOM before capture; layout and message length changed slightly, so the original private image remains the primary measurement. Automatic approval review initially rejected screenshot upload because sensitive-data content was not independently verified. The owner subsequently approved the five identified images; their SHA-256 values were rechecked and their GitHub blob uploads succeeded. The original unredacted images remain private. A [reproduction guide](s01-01-reproduce-audit.md) preserves the synthetic harness and was rerun successfully on the same laptop in a fresh folder. No Impeccable launcher, detector or live-injection tool was run. Existing `PRODUCT.md` and `DESIGN.md` were absent; the repository brief and existing implementation supply context.

## Ranked findings

| Priority | Finding and reproduction | Evidence and intended follow-up |
|---|---|---|
| P1 | Import malformed MP4, then continue working: a verbose raw FFprobe command and local paths fill a large toast over the editor and controls. The dismiss button offers a workaround; the message is not actionable for most users. | [Redacted 1366×768 capture](evidence/s01-01/error-redacted-1366x768.png); [issue #130](https://github.com/sahamo123/dax-editor/issues/130). Summarize the failure and keep bounded diagnostic detail separate. |
| P1 | At 1366×768, set chat width to 276 CSS px, start a slow scripted task, queue a Planning follow-up and type guidance: Stop, Queue and Steer crowd/overlap; expanded task text is clipped. | [Task capture](evidence/s01-01/task-queue-steer-1366x768.png); [issue #136](https://github.com/sahamo123/dax-editor/issues/136). Preserve separate actions and readable task details in S01.05/S01.06. |
| P2 | Import a 16:9 video at 1366×768. Review effects consumes about 120 px of a full-height flex column. Default preview region was 638 px and stage 517 px; with chat at 600 px they were 418 px and 297 px. The stage stays inside its bounds but becomes unnecessarily small. | [Maximum-chat capture](evidence/s01-01/frame-max-1366x768.png); [issue #137](https://github.com/sahamo123/dax-editor/issues/137). Reclaim the area while retaining a clear review action in S01.04. |
| P2 | The no-assistant card groups Claude Code, Codex and Gemini as though all were usable chat backends, although availability differs. | [Empty 1440×900 capture](evidence/s01-01/empty-1440x900.png); [issue #131](https://github.com/sahamo123/dax-editor/issues/131). Distinguish configured, usable and external MCP connection paths. |
| P2 | At compact 1024×700, opening the tools panel overlays much of the preview and timeline. The close control works, but selection and visual adjustment compete for space. | [Compact drawer capture](evidence/s01-01/compact-drawer-1024x700.png). Address the tradeoff as part of S01.03/S01.04; do not call the existing overlay broken solely because it covers content. |

For the preview measurements, the private `frame-metrics.json` SHA-256 is `9aab3878f6daafd740ca8a09c629ad4018458c8ac28534e34b6007e0b0f41e12`. Its `default` label at 1440 and 1920 reflects the **minimum** chat width carried from the preceding iteration, not the application default; the 1366 default and all `max` rows are as labelled. `workspace-metrics.json` SHA-256 `bd7f94b5439165e89908516dd9aa29b34f4fbb7965b1a4ee721d45ca1272e04c` records no document-level horizontal overflow in the three max-chat captures. Neither measures readability, native scaling or whole-app performance.

## Preserve and design direction

The incumbent is a dark task-focused editor with Inter/system fallback, blue selection/action accents, semantic task colors, a persistent timeline, selection-driven Inspector, resizable panels and stored per-viewer widths. Keep that visual identity and the existing command/session/history architecture. Make setup distinct from contextual inspection, reserve space for the actual frame and timeline, and make task status, separate Stop/Queue/Steer and actionable errors legible at constrained widths. Do not introduce a second design system, marketing layout, network font or mandatory paid provider.

In the control session, keyboard resizing changed the chat width and persisted after reload; clicking a clip selected Inspector; the compact drawer opened and closed. A scripted active task showed Planning, queued position, cancellation and Stop. Steer was visible but not submitted in this run: non-cancelling behavior has separate server test evidence in `packages/server/src/task-queue.test.ts` and is not claimed as a fresh live-model check. Planning selection alone does not prove edit suppression. S00.05 provides the separately verified offline manual undo/redo/export baseline. Focus traversal, contrast, actual assistive technology, native menus and DPI remain for later acceptance, not an accessibility certification.

## Evidence integrity and next gate

Approved synthetic screenshot SHA-256 values: empty `602c2d889c50f2b1ac676f1b3ce10c3187c576c49a21c0dd263db28f4c1e69ae`; redacted error `f7952d6eb073682cc288d22ccf26106ef9d2de9752cebfe767155d829ad21e32`; maximum-chat frame `d0f956e387dc080ee58ce6f4d50ec36c3bf390e7790481e86304385f1e81d755`; task `915e64fcfd64c6d457ff35b240ab66f66c9b8114f72b159af1f196578f8c4e80`; compact `94fc3208f1c645c1d2d9dc3f75d42d71abd90e61114ca81a149591289815534f`.

`pnpm docs:index`, `pnpm docs:okf`, `pnpm lint` and `git diff --check` passed after the audit. The full source and browser checks are reused from S00.05 because this slice changes documentation and screenshots only. A separate coordinator self-review checked the prior published tree, local screenshots and metrics; the final publication must be rechecked before marking VERIFIED. S01.07 still requires native DPI checks on a policy-authorized Windows target.
