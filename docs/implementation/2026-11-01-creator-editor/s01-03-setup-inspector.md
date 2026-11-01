---
type: Spec
title: "S01.03: Separate project setup from contextual inspection"
description: "Plan and evidence gates: Separate project setup from contextual inspection."
tags: [implementation, creator-workflows, workspace]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S01.03
stage_id: S01
effort_days: [0.75, 1.25]
prerequisites: [S01.02]
execution_state: not_started
---

# S01.03: Separate project setup from contextual inspection

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S01.02**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [apps/desktop/src/app/layout/Shell.tsx](../../../apps/desktop/src/app/layout/Shell.tsx) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/app/layout/EmptyState.tsx](../../../apps/desktop/src/app/layout/EmptyState.tsx) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/app/layout/ProjectTools.tsx](../../../apps/desktop/src/app/layout/ProjectTools.tsx) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/editor/inspector/Inspector.tsx](../../../apps/desktop/src/editor/inspector/Inspector.tsx) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Read the manual-context craft-floor guidance immediately before UI edits; preserve the source/behavior boundaries established by S01.02.
2. Add the smallest setup/context separation within the current app package; new workflow components may be introduced, but content-profile persistence waits for S02.
3. Keep existing projects opening directly into the editor and make setup dismissible without an LLM, network or repeated modal.
4. Move project-wide format/import/style entry points into setup/project controls while selected-item properties remain contextual; retain relink/save/undo access.
5. Preserve `api.state` as authoritative, route mutations through the existing controller/registry and ensure selecting a clip does not unexpectedly move keyboard focus.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Component regression: existing project, empty project, canceled setup, failed import and changed selection all expose the expected controls without losing edits.
- Command boundary: manual actions still call the existing registry, a grouped action has one undo and Planning prevents mutations.
- Focus: setup dismissal and inspector selection leave focus predictable; required actions remain reachable without a pointer.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

If moving a control changes command arguments or edit semantics, stop and isolate that behavior change in its own scoped issue/commit. Restore the previous accessible entry point until the regression is fixed.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Before/after UI captures, component tests, preserved command traces and focus/undo observations.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s01-04-responsive-workspace.md). Planning-file creation itself does not satisfy this gate.
