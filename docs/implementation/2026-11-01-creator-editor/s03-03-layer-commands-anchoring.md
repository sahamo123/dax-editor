---
type: Spec
title: "S03.03: Implement pure layer operations and anchoring"
description: "Plan and evidence gates: Implement pure layer operations and anchoring."
tags: [implementation, creator-workflows, composition]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S03.03
stage_id: S03
effort_days: [1, 2]
prerequisites: [S03.02]
execution_state: not_started
---

# S03.03: Implement pure layer operations and anchoring

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S03.02**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [packages/core/src/timeline.ts](../../../packages/core/src/timeline.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/commands.ts](../../../packages/core/src/commands.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/effect-commands.ts](../../../packages/core/src/effect-commands.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/timeline-grid.test.ts](../../../packages/core/src/timeline-grid.test.ts) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Introduce proposed pure composition operations and a command registry module within core; reuse existing Session/history and typed validation.
2. Implement bounded add/update/remove/order/move/trim operations with stable identifiers and one grouped undo; add no direct UI/AI mutation path.
3. Apply the ADR's fixed/ripple anchoring consistently across base trim/delete/reorder and dependent video/still/text/matte/keyframe items.
4. Use the shared source↔timeline mapping and frame snapping rather than duplicating arithmetic in each command; document zero-length and out-of-source behavior.
5. Enforce captured project/revision guards for composed requests and make repeats/no-ops deterministic without duplicate layer items or extra history.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Pure operations: original input remains unchanged; insert/move/delete/trim/reorder produce exact expected frame-aligned ranges and order.
- Anchoring: fixed and ripple elements follow specified behavior through multi-clip edits; paired foreground mattes stay synchronized.
- Commands: one undo restores the complete grouped operation; stale revisions, invalid IDs and Planning reject writes without partial changes.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

A mismatch between preview gesture and core operation must be fixed at the contract/pure-operation seam. Preserve the authoritative project and reject ambiguous edits instead of guessing layer positions.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Command list/contracts, pure/frame-grid/anchoring regressions, no-op/idempotence cases and one-undo evidence.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s03-04-layer-renderer.md). Planning-file creation itself does not satisfy this gate.

