---
type: Spec
title: "S02.07: Verify profile contracts across all entry points"
description: "Plan and evidence gates: Verify profile contracts across all entry points."
tags: [implementation, creator-workflows, profiles]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S02.07
stage_id: S02
effort_days: [0.5, 0.75]
prerequisites: [S02.06, S02.02, S02.05]
execution_state: not_started
---

# S02.07: Verify profile contracts across all entry points

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S02.06, S02.02, S02.05**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [packages/core/src/templates.test.ts](../../../packages/core/src/templates.test.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/server/src/project-workflows.test.ts](../../../packages/server/src/project-workflows.test.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/server/src/live-mcp.test.ts](../../../packages/server/src/live-mcp.test.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/session.test.ts](../../../packages/core/src/session.test.ts) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Run the full compatibility matrix against final code, including old plain projects, branched history, checkpoints, missing assets and unknown future versions.
2. Exercise profile operations through manual UI, core commands and real local server/MCP protocol boundaries; use mocks only for unavailable external inference.
3. Inject stale revision, invalid override, missing capability and cancellation before commit; verify no partial or duplicate mutation.
4. Verify saved pinned versions and explicit overrides round-trip through project export/open, undo/redo and restart; do not rely only on in-memory schema tests.
5. Recheck existing template behavior and source-time transcript/caption timing so migration/profile work does not regress established editing.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Contracts: identical accepted profile inputs resolve equivalently through supported entry points; Planning refuses writes and revision checks remain enforced.
- Persistence: every retained history state matches expected output after migration/reopen and missing/future data fails with the specified recovery path.
- Regression: relevant core/server/MCP tests plus `pnpm check` pass; actual assistant inference remains a distinct optional acceptance claim.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

Any discrepancy between entry points or lost persisted override blocks this step. Keep the failing fixture and compare serialized/command outputs; do not update expected snapshots to bless unexplained differences.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Cross-entry acceptance matrix, migration round-trip evidence, failure-injection logs and explicitly untested external-client scope.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s02-08-first-improvement-candidate.md). Planning-file creation itself does not satisfy this gate.

