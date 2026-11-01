---
type: Spec
title: "S02.05: Preview and commit a profile as one edit"
description: "Plan and evidence gates: Preview and commit a profile as one edit."
tags: [implementation, creator-workflows, profiles]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S02.05
stage_id: S02
effort_days: [0.5, 0.75]
prerequisites: [S02.04, S02.02, S02.03]
execution_state: not_started
---

# S02.05: Preview and commit a profile as one edit

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S02.04, S02.02, S02.03**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [packages/core/src/templates.ts](../../../packages/core/src/templates.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/commands.ts](../../../packages/core/src/commands.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/session.ts](../../../packages/core/src/session.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/server/src/engine.ts](../../../packages/server/src/engine.ts) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Add typed profile preview/apply/reset commands to the existing registry; use a scratch Session like the deterministic template applier rather than a parallel edit engine.
2. Produce a bounded proposed change set identifying overrides, format/style differences, unsupported steps and required assets before altering an existing project.
3. Validate the complete proposal and capability/version inputs, then apply supported accepted operations as one history entry with accurate attribution.
4. Capture project identity/revision and check again at final commit after any asynchronous work; a manual edit during planning must prevent stale application.
5. Make retry/idempotence behavior explicit: repeat no-op application adds no duplicate overlays/history, and failure leaves the authoritative project unchanged.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Atomicity: a later invalid step causes zero partial mutation; successful multi-field application creates exactly one undo and redo restores it.
- Concurrency: changed project/revision or capabilities rejects the stale proposal; Planning refuses mutation while allowing read-only inspection.
- Overrides: explicit item/project customizations remain, reset affects only selected scope and unsupported/skipped steps appear in the returned result.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

A stale proposal requires a fresh preview, never blind replay. On unexpected partial mutation, preserve evidence and block the route until the atomicity bug has a regression test and verified recovery.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Typed command contract, proposed/applied result examples, atomicity/idempotence/revision tests and one-undo proof.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s02-06-profile-gallery-ui.md). Planning-file creation itself does not satisfy this gate.

