---
type: Spec
title: "S03.02: Add versioned layers and preserve saved history"
description: "Plan and evidence gates: Add versioned layers and preserve saved history."
tags: [implementation, creator-workflows, composition]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S03.02
stage_id: S03
effort_days: [1, 1.5]
prerequisites: [S03.01, S02.02]
execution_state: not_started
---

# S03.02: Add versioned layers and preserve saved history

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S03.01, S02.02**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [packages/core/src/schema.ts](../../../packages/core/src/schema.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/session.ts](../../../packages/core/src/session.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/protocol/src/index.ts](../../../packages/protocol/src/index.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/schema.test.ts](../../../packages/core/src/schema.test.ts) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Extend the accepted versioned project representation with bounded layer/item fields and explicit units; use the S02 migration boundary for all persisted states.
2. Validate IDs, asset kinds, finite times, source bounds, order, opacity/transform limits and reference integrity; prohibit path/URL/filter injection through layer parameters.
3. Migrate existing effects into the specified compatible representation without changing their visual order; avoid two competing persisted sources of truth.
4. Update protocol summaries and core public exports while keeping Node runtime dependencies out of browser code.
5. Round-trip every history branch/checkpoint, including empty/legacy projects and layered states; define refusal and recovery for unsupported composition versions.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Schema: invalid references, duplicate IDs, NaN/infinity, out-of-range opacity and impossible ranges fail clearly before mutation/render.
- Persistence: legacy and layered projects preserve effects, branches, checkpoints and selected current state across save/restart/undo.
- Compatibility: legacy export is allowed only for actually compatible features; unsupported layers are never silently flattened or discarded.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

Any migration changes legacy appearance or loses a history state blocks this step. Preserve originals and compare serialized fixtures before rerunning render acceptance; do not patch around invalid data in the UI.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Layer schema/version contract, validated fixture matrix, history round-trip results and legacy refusal cases.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s03-03-layer-commands-anchoring.md). Planning-file creation itself does not satisfy this gate.
