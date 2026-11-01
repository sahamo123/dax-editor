---
type: Spec
title: "S03.04: Render video and still layers through the shared engine"
description: "Plan and evidence gates: Render video and still layers through the shared engine."
tags: [implementation, creator-workflows, composition]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S03.04
stage_id: S03
effort_days: [1, 2]
prerequisites: [S03.03, S03.02]
execution_state: not_started
---

# S03.04: Render video and still layers through the shared engine

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S03.03, S03.02**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [packages/core/src/render.ts](../../../packages/core/src/render.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/encoders.ts](../../../packages/core/src/encoders.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/image-overlays.ts](../../../packages/core/src/image-overlays.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/test-utils.ts](../../../packages/core/src/test-utils.ts) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Extend the existing render compiler for the agreed ordered video/still composition, normalized canvas geometry, crop/transform and opacity; no second render engine.
2. Retain the single source fps-normalization pass before clip trimming/splitting so joins do not accumulate extra frames; handle absent audio explicitly.
3. Implement still duration and picture-in-picture using validated local assets and the existing fit/encoder path; keep main-track audio and free audio mix semantics explicit.
4. Preserve existing textfile escaping and controlled output/temp paths; never accept arbitrary FFmpeg args or rely on shipped libx264/libx265.
5. Generate color/box/tone fixtures that reveal layer order, placement, crop and audio timing; keep cleanup/cancel failures owned and observable.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Pixels: measured sample frames show expected order, PiP rectangle, crop and opacity within declared tolerances, including portrait/landscape fits.
- Audio/time: silent still/video layers introduce no unwanted tone or drift; output duration matches composition on fractional project rates.
- Runtime: full decode succeeds through the supported encoder selection, cancel removes only owned partials and legacy-render regressions remain green.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

Incorrect output pixels or A/V timing block completion even if FFmpeg exits zero. Retain a minimal generated fixture and failed render plan safely; do not change expected images to hide unexplained differences.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Measured frame/audio results, full-decode logs, chosen encoder/runtime versions and legacy comparison artifacts.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s03-05-keyframes-transitions.md). Planning-file creation itself does not satisfy this gate.

