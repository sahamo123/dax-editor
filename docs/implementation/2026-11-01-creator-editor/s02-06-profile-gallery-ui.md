---
type: Spec
title: "S02.06: Integrate the profile chooser and template gallery"
description: "Plan and evidence gates: Integrate the profile chooser and template gallery."
tags: [implementation, creator-workflows, profiles]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S02.06
stage_id: S02
effort_days: [0.5, 0.75]
prerequisites: [S02.05, S01.07]
execution_state: not_started
---

# S02.06: Integrate the profile chooser and template gallery

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S02.05, S01.07**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [apps/desktop/src/app/layout/Shell.tsx](../../../apps/desktop/src/app/layout/Shell.tsx) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/app/controller.ts](../../../apps/desktop/src/app/controller.ts) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/app/layout/ProjectTools.tsx](../../../apps/desktop/src/app/layout/ProjectTools.tsx) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/editor/presets/PresetsPanel.tsx](../../../apps/desktop/src/editor/presets/PresetsPanel.tsx) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Integrate a profile chooser and capability-driven template gallery into the S01 setup/workspace; keep one editor and avoid confusing text-preset chips with full recipes.
2. Show pinned selected profile/style and editable project overrides; existing projects enter the editor directly and profile selection remains optional.
3. Present the proposed change set and skipped/unavailable reasons before applying to an existing project; provide targeted reset with clear consequences.
4. Drive UI mutations through controller/registry commands and read authoritative state after commit; no optimistic project fork or runtime Node import.
5. Cover loading, no templates, unavailable runtime, missing asset, stale preview, apply failure and successful undo states with keyboard/focus behavior.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- UI workflow: choose each profile, inspect proposal, apply, customize, reset and undo without an LLM; state survives save/reopen.
- Truthfulness: gallery and result show incomplete requirements visibly; clicking unavailable features never starts hidden downloads or paid calls.
- Regression: S01 layout/keyboard/tasks remain usable and canceled/stale application leaves current project unchanged.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

If a new panel obscures required editor controls or bypasses confirmation of destructive differences, restore the prior safe flow and fix before advancing. Do not conceal capability errors behind a success toast.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Profile/gallery browser/component results, failure-state captures and command/undo/save-reopen observations.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s02-07-profile-contract-acceptance.md). Planning-file creation itself does not satisfy this gate.

