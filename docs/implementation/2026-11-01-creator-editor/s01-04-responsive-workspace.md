---
type: Spec
title: "S01.04: Keep the preview usable across workspace sizes"
description: "Plan and evidence gates: Keep the preview usable across workspace sizes."
tags: [implementation, creator-workflows, workspace]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S01.04
stage_id: S01
effort_days: [0.75, 1.25]
prerequisites: [S01.03]
execution_state: not_started
---

# S01.04: Keep the preview usable across workspace sizes

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S01.03**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [apps/desktop/src/app/layout/Shell.tsx](../../../apps/desktop/src/app/layout/Shell.tsx) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/app/styles/workspace.css](../../../apps/desktop/src/app/styles/workspace.css) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/app/ui/Splitter.tsx](../../../apps/desktop/src/app/ui/Splitter.tsx) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/editor/AGENTS.md](../../../apps/desktop/src/editor/AGENTS.md) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Implement the specified wide/narrow layout using current tokens and resizers; preview/timeline parents retain definite sizes and `min-width: 0`.
2. Make assistant collapse/switch behavior explicit and keep task state reachable in either mode; use the specified compact inspector rather than permanently covering the preview.
3. Preserve persisted panel dimensions while clamping stale values to the current viewport; moving between narrow/wide must not create zero-size panels.
4. Exercise mouse and keyboard splitter interaction, resize during playback and selection/inspector changes without duplicating shortcut registration.
5. Keep layout changes separate from rendering and timeline model changes; use measured viewport failures to select breakpoints.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Viewport matrix: 1366x768, 1440x900 and 1920x1080 show usable preview, timeline and primary actions; record exact sizes and screenshots.
- Resize regression: previously saved extreme dimensions recover, keyboard splitters work and no horizontal overflow hides controls.
- Playback/interaction: resizing does not reset playhead, selection, active tasks or undo history; compact navigation restores focus.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

If a supported size cannot expose required actions, block layout acceptance and keep a usable fallback. CSS screenshots at simulated scale do not satisfy later real Windows DPI acceptance.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Viewport/resizer matrix, screenshots, layout tests and preserved playback/selection observations.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before the next step (`s01-05-task-recovery-visibility.md`; later publication batch). Planning-file creation itself does not satisfy this gate.

