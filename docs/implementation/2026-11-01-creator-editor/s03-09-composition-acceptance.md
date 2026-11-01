---
type: Spec
title: "S03.09: Close layered composition with measured output"
description: "Plan and evidence gates: Close layered composition with measured output."
tags: [implementation, creator-workflows, composition]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S03.09
stage_id: S03
effort_days: [1.5, 2]
prerequisites: [S03.08, S00.04]
execution_state: not_started
---

# S03.09: Close layered composition with measured output

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S03.08, S00.04**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [packages/core/src/av-sync-render.test.ts](../../../packages/core/src/av-sync-render.test.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/test-utils.ts](../../../packages/core/src/test-utils.ts) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/e2e/manual-effects.spec.ts](../../../apps/desktop/e2e/manual-effects.spec.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/server/src/render-preview.test.ts](../../../packages/server/src/render-preview.test.ts) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Run the final layer-order/overlap/opacity/ripple/transition/alpha fixture matrix across integer/fractional rates and VFR sources.
2. Measure A/V drift over repeated joins and composed clips against one project frame plus documented codec priming; retain raw measurements and threshold rationale.
3. Exercise add/edit/undo/redo/save/reopen and migration across composition states, then fully decode review/export outputs for PiP, still scenes and supplied-matte text.
4. Repeat affected browser and actual native playback/interaction acceptance on the declared authorized target; verify current candidate hashes and coverage labels.
5. Compare performance/resource observations with S00, close all required findings and document bounded supported features plus excluded research before S04.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Rendering: measured frame/audio cases and full decode pass; no accumulating fractional-rate drift or legacy appearance regression.
- Persistence/UI: history, keyframes, alpha and ordering survive reopen; manual offline operations and Planning protections remain correct.
- Stage: all S03 receipts/current mandatory checks pass, with native evidence scoped to its tested machine and no automatic segmentation/advanced graph claim.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

Any required native/render/migration case missing or failing blocks S03.09. Preserve minimal fixtures and candidate artifacts, repair the affected step and rerun all invalidated comparisons before advancing.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Complete S03 matrix, A/V measurements, output hashes, native/browser candidate identity, resource comparison and bounded-feature handoff.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s04-01-long-form-contract-fixtures.md). Planning-file creation itself does not satisfy this gate.

