---
type: Spec
title: "S01.06: Complete keyboard and accessibility behavior"
description: "Plan and evidence gates: Complete keyboard and accessibility behavior."
tags: [implementation, creator-workflows, workspace]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S01.06
stage_id: S01
effort_days: [0.5, 1]
prerequisites: [S01.05]
execution_state: not_started
---

# S01.06: Complete keyboard and accessibility behavior

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S01.05**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [apps/desktop/src/app/ui/Modal.tsx](../../../apps/desktop/src/app/ui/Modal.tsx) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/app/layout/Drawer.tsx](../../../apps/desktop/src/app/layout/Drawer.tsx) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/app/use-shortcuts.ts](../../../apps/desktop/src/app/use-shortcuts.ts) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/editor/shortcuts.ts](../../../apps/desktop/src/editor/shortcuts.ts) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Walk import→manual edit→review→export with keyboard only, including setup bypass, tabs, resizers, dialogs and error recovery.
2. Ensure visible focus, programmatic names and tab semantics; restore focus after dialogs/drawers and prevent selection-triggered focus theft.
3. Preserve shell undo shortcuts and editor playback/edit shortcuts without duplicate handlers or intercepting text input fields.
4. Measure normal/large text and essential control contrast against the selected design standard; task state must remain understandable without color.
5. Honor reduced motion and provide restrained live announcements for task milestones/errors rather than every progress tick; record assistive technology and platform used.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Keyboard: complete workflow and Escape recovery pass with no inaccessible control, trapped focus or shortcut firing during text entry.
- Visual semantics: measured contrast values, visible focus and non-color labels satisfy the documented acceptance standard.
- Announcements: task start/final/failure messages are announced once as intended; progress updates do not produce screen-reader spam.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

An inaccessible required action blocks completion. Fix the minimal component semantics and rerun the affected keyboard path; automated checks or screenshots alone cannot replace the manual walkthrough.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Keyboard script/results, contrast measurements, reduced-motion evidence and screen-reader/platform observations.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s01-07-workspace-acceptance.md). Planning-file creation itself does not satisfy this gate.

