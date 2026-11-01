---
type: Spec
title: "S07.02: Persist journal and idempotent mutation receipts"
description: Execute S07.02 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s07]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S07.02
stage_id: S07
effort_days: [1, 1.5]
prerequisites: [S07.01]
execution_state: not_started
---

# S07.02: Persist journal and idempotent mutation receipts

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-1.5 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S07.01](s07-01-workflow-contract.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [packages/server/src/tasks.ts](../../../packages/server/src/tasks.ts)
- [packages/server/src/stores.ts](../../../packages/server/src/stores.ts)
- [packages/server/src/project-manager.ts](../../../packages/server/src/project-manager.ts)
- [packages/core/src/session.ts](../../../packages/core/src/session.ts)
- [packages/server/src/task-queue.test.ts](../../../packages/server/src/task-queue.test.ts)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Implement durable transition writes with explicit success/failure acknowledgement; dispatch must not proceed after a swallowed write error.
2. Record operation identity, input digest, base revision and outcome needed to deduplicate a completed mutation across restart and duplicate delivery.
3. Coordinate session persistence and journal evidence according to the accepted crash-window ADR; do not assume two independent atomic files form one transaction.
4. Define retention/compaction rules that preserve unresolved operations and dedupe evidence for the supported retry horizon, even when recent task UI history is pruned.
5. Load unknown/corrupt journals conservatively, preserving files for diagnosis and marking uncertain work interrupted; migrate existing recent-task data without automatically restarting it.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Inject disk/write/rename failure before dispatch and assert no work starts; the UI receives a recoverable persistence error.
- Crash before and after artifact/commit/receipt boundaries produces one committed edit at most; duplicate operation/input returns the recorded outcome.
- Conflicting reuse of an operation ID with different inputs is rejected and current project history remains intact.
- Retention, restart and corruption tests keep unresolved mutation evidence; a missing receipt never becomes an assumption of success.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- On ambiguous commit state, stop retry and preserve both journal/project evidence for deterministic reconciliation.
- If persistence fails, stop scheduling affected work and report the storage issue; do not fall back to memory-only successful execution.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Fault-injection results, journal migration/retention evidence and duplicate-mutation receipts.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S07.03](s07-03-workflow-coordinator.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

