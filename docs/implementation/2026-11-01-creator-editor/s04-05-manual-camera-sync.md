---
type: Spec
title: "S04.05: Add manual camera alignment and switching"
description: "Plan and evidence gates: Add manual camera alignment and switching."
tags: [implementation, creator-workflows, long-form]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S04.05
stage_id: S04
effort_days: [1, 2]
prerequisites: [S04.04, S03.04, S03.07]
execution_state: not_started
---

# S04.05: Add manual camera alignment and switching

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S04.04, S03.04, S03.07**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [packages/core/src/timeline.ts](../../../packages/core/src/timeline.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/render.ts](../../../packages/core/src/render.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/audio-layer.ts](../../../packages/core/src/audio-layer.ts) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/editor/inspector/Inspector.tsx](../../../apps/desktop/src/editor/inspector/Inspector.tsx) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Extend the agreed composition contract with explicit manual source offsets/sync anchors and a chosen master audio clock; record the design before changing persistence.
2. Let users align a visible/audible landmark, inspect offsets and select camera ranges through typed operations; do not claim automatic audio sync or drift correction.
3. Map all camera/source ranges through shared source↔timeline functions, including negative-relative start, source exhaustion, VFR and repeated cuts.
4. Define safe behavior outside a camera's available range and prevent accidental double audio by making master/muted camera audio explicit.
5. Persist alignment and switch decisions with one grouped undo, then verify trim/ripple/reorder and save/reopen preserve the intended sync.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Alignment: generated landmarks and real fixture landmarks remain within one project frame plus documented codec priming after repeated switches.
- Audio: exactly the chosen master is heard unless an explicit mix is requested; camera boundaries produce no unintended duplicate stream or gap.
- Persistence: offsets/anchors/switches survive undo/reopen; out-of-source and stale-revision requests fail without partial mutation.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

Growing real-recording clock drift is a measured limitation, not something a constant offset can fix. Block claims requiring accurate sync, preserve original sources and scope any resampling/time-warp solution in a separate decision.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Manual sync contract, landmark measurements, master-audio assertions, VFR/source-bound cases and persistence results.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s04-06-speakers-reviewed-highlights.md). Planning-file creation itself does not satisfy this gate.
