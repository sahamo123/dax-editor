---
type: Spec
title: "S03.07: Expose layer lanes and contextual controls"
description: "Plan and evidence gates: Expose layer lanes and contextual controls."
tags: [implementation, creator-workflows, composition]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S03.07
stage_id: S03
effort_days: [1, 1.5]
prerequisites: [S03.06, S03.03, S01.07]
execution_state: not_started
---

# S03.07: Expose layer lanes and contextual controls

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S03.06, S03.03, S01.07**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [apps/desktop/src/editor/timeline/Timeline.tsx](../../../apps/desktop/src/editor/timeline/Timeline.tsx) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/editor/store.ts](../../../apps/desktop/src/editor/store.ts) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/editor/inspector/Inspector.tsx](../../../apps/desktop/src/editor/inspector/Inspector.tsx) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/editor/AGENTS.md](../../../apps/desktop/src/editor/AGENTS.md) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Extend current timeline lanes/selection types for the accepted layer model, with stable ordering, visibility/mute and clear primary-versus-upper-layer distinction.
2. Add bounded inspector controls for range, transform/crop/opacity, anchoring and supported keyframes/transitions; preserve existing text/image/audio controls.
3. Use pure gesture previews and commit one registry command on release; Escape cancels and stale/failed responses restore authoritative state.
4. Preserve keyboard navigation, definite-size preview/timeline parents and high-frequency playhead isolation; no direct browser runtime core imports.
5. Exercise layer selection, reorder, delete, hidden/muted state and paired matte feedback across wide/narrow layouts and existing task surfaces.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Gestures: drag/resize/reorder previews match committed core operations, cancel changes nothing and one undo restores a committed gesture.
- Accessibility: keyboard can select and operate layers with visible focus; state is understandable without color and selection does not steal focus.
- Regression: playhead performance, legacy lane controls, task access and S01 supported layouts remain usable.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

If UI preview and committed geometry disagree, block the affected gesture rather than applying a compensating hidden edit. Preserve current selection/history and fix the shared mapping or preview calculation.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Layer interaction matrix, component/browser tests, gesture/core comparisons and accessibility/layout evidence.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before the next step (`s03-08-preview-review-coverage.md`; later publication batch). Planning-file creation itself does not satisfy this gate.

