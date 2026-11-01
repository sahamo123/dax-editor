---
type: Spec
title: "S03.05: Add bounded keyframes and transitions"
description: "Plan and evidence gates: Add bounded keyframes and transitions."
tags: [implementation, creator-workflows, composition]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S03.05
stage_id: S03
effort_days: [1, 2]
prerequisites: [S03.04]
execution_state: not_started
---

# S03.05: Add bounded keyframes and transitions

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S03.04**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [packages/core/src/zoom.ts](../../../packages/core/src/zoom.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/render.ts](../../../packages/core/src/render.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/timeline.ts](../../../packages/core/src/timeline.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/av-sync-render.test.ts](../../../packages/core/src/av-sync-render.test.ts) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Implement only the finite transform properties, interpolation modes and transition types accepted by S03.01; persist stable keyed times with explicit source/timeline convention.
2. Validate keyframe ordering, duplicate-time policy and parameter bounds; trim/reorder/ripple operations preserve or adjust keys exactly as specified.
3. Compile transitions through the shared renderer using explicit overlap and source handles; define the resulting duration and audio crossfade rather than shortening the project accidentally.
4. Reuse existing zoom behavior where compatible while preserving legacy look; avoid broad refactoring or adding arbitrary expressions/speed ramps.
5. Expose typed commands and preview coverage metadata for new controls; unsupported interactive playback must direct the user to rendered review.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Motion: sample frames at start/mid/end and key boundaries match the expected transform/opacity, including fractional-fps projects.
- Transitions: insufficient handles, adjacent/overlapping transitions and duration boundaries are validated; measured sound envelope and A/V end alignment match the contract.
- Persistence: edit/undo/redo/save/reopen preserves keys and transitions; legacy zoom/fade exports retain established behavior.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

If a transition needs undefined overlap or time-warp semantics, reject that case and update the bounded spec before implementation. No silent duration change or filter-string escape hatch is allowed.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Supported keyframe/transition matrix, sampled render measurements, duration/audio assertions and compatibility results.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s03-06-alpha-supplied-mattes.md). Planning-file creation itself does not satisfy this gate.

