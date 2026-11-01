---
type: Spec
title: "S02.02: Implement safe project and history migration"
description: "Plan and evidence gates: Implement safe project and history migration."
tags: [implementation, creator-workflows, profiles]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S02.02
stage_id: S02
effort_days: [0.5, 0.75]
prerequisites: [S02.01]
execution_state: not_started
---

# S02.02: Implement safe project and history migration

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S02.01**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [packages/core/src/session.ts](../../../packages/core/src/session.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/schema.ts](../../../packages/core/src/schema.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/server/src/project-manager.ts](../../../packages/server/src/project-manager.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/session.test.ts](../../../packages/core/src/session.test.ts) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Introduce explicit version dispatch and proposed migration modules inside core; validate original input before any write and reject unknown future versions.
2. Migrate plain project and every persisted history entry/checkpoint through the same reader, preserving IDs, branches, currentId and lastChild relationships.
3. Handle the current loadHistory equality check after consistent migration of both current states; do not silently drop history because one side changed representation first.
4. Implement the ADR's backup, atomic-file and pair-recovery protocol; a failed migration leaves originals recoverable and surfaces an actionable diagnostic.
5. Update project-manager/open/upload paths and all direct ProjectSchema readers to use the agreed boundary; preserve autosave's truthful save-error behavior.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Round trip: v1 plain project plus branched history/checkpoints→v2 save→reopen preserves current edit and every retained state; undo/redo/restore behave identically.
- Failure injection: malformed entry, future version, missing history, write failure and crash between pair writes have explicit safe outcomes and never overwrite the only original.
- Compatibility: old-build refusal/legacy-compatible export follows the ADR; unsupported new fields cannot be silently stripped.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

Any lost branch/checkpoint or mismatched current history blocks completion. Restore from the verified backup in a separate recovery copy, fix the reader, and rerun all migration fixtures; never normalize corruption by discarding history.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Migration fixture matrix, before/after sanitized data digests, crash-recovery results and original-restoration procedure.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s02-03-content-profiles.md). Planning-file creation itself does not satisfy this gate.
