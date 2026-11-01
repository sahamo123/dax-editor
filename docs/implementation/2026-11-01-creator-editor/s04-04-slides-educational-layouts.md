---
type: Spec
title: "S04.04: Build slide scenes and educational layouts"
description: "Plan and evidence gates: Build slide scenes and educational layouts."
tags: [implementation, creator-workflows, long-form]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S04.04
stage_id: S04
effort_days: [1, 1.5]
prerequisites: [S04.03, S03.04, S03.07]
execution_state: not_started
---

# S04.04: Build slide scenes and educational layouts

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S04.03, S03.04, S03.07**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [packages/core/src/image-overlays.ts](../../../packages/core/src/image-overlays.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/templates.ts](../../../packages/core/src/templates.ts) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/app/layout/EffectsTools.tsx](../../../apps/desktop/src/app/layout/EffectsTools.tsx) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/render.ts](../../../packages/core/src/render.ts) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Use S03 still layers and existing image-overlay capabilities for full-frame slide scenes, callouts and instructor PiP; do not create a second slide renderer.
2. Define deterministic educational layouts with editable readable title/callout placement, safe areas and explicit still duration.
3. Keep supplied slides/assets user-owned and validated; template data references chosen assets without shipping paths or fetching copyrighted materials.
4. Preserve meaningful pauses and source audio while adding scenes; profile application previews changes and one undo restores the prior edit.
5. Expose layout controls through the existing setup/context seams and show rendered-review coverage for composition effects.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Visual: rendered landscape/portrait examples preserve aspect, readable titles/callouts, safe areas and instructor PiP order.
- Timing/audio: slide duration and transitions align with selected chapter ranges; speech is neither cut nor duplicated by still insertion.
- Workflow: explicit overrides survive regenerate/apply/reset/save/reopen and one undo restores scene changes.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

Missing slides or unsupported layout steps stay visible as requirements, not fabricated generated content. If still insertion changes audio duration unexpectedly, block and repair time-map semantics before proceeding.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Educational layout definitions, measured sample frames/audio, one-undo/persistence tests and asset provenance.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s04-05-manual-camera-sync.md). Planning-file creation itself does not satisfy this gate.
