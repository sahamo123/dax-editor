---
type: Spec
title: "S07.03: Execute dependencies and recover interrupted work"
description: Execute S07.03 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s07]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S07.03
stage_id: S07
effort_days: [1, 1.5]
prerequisites: [S07.02]
execution_state: not_started
---

# S07.03: Execute dependencies and recover interrupted work

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-1.5 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S07.02](s07-02-workflow-journal.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [packages/server/src/engine.ts](../../../packages/server/src/engine.ts)
- [packages/server/src/tasks.ts](../../../packages/server/src/tasks.ts)
- [packages/server/src/jobs.ts](../../../packages/server/src/jobs.ts)
- [packages/server/src/interfaces.ts](../../../packages/server/src/interfaces.ts)
- [packages/server/src/task-queue.test.ts](../../../packages/server/src/task-queue.test.ts)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Add a bounded deterministic workflow coordinator within the existing server package, using the journal rather than treating JobManager bookkeeping as a scheduler.
2. Dispatch children only after all dependencies have successful validated artifacts; cap fan-out, depth and attempts and classify failed/blocked dependencies explicitly.
3. Run analysis/rendering outside the short mutation lock and submit typed proposals through the session owner with expected project/revision.
4. Recover active work as interrupted; permit explicit retry only for proven read-only/idempotent phases and reconcile recorded mutation outcomes before replay.
5. Propagate Stop/cancel to owned child jobs, reject cancelled late completions and keep steering as new guidance at a safe model boundary without cancelling the active run.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Tests cover success DAG, failed dependency, cycle, bounded fan-out, duplicate delivery and restart at every phase.
- Manual edits during analysis survive; stale proposals are rejected with a recoverable artifact and no accidental second history entry.
- Stop prevents pending children from dispatching and waits for owned cleanup; late completions cannot resurrect terminal work.
- Steering keeps the same active run and captured settings where required; Planning cannot dispatch mutation children.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- A child with uncertain durability/ownership blocks its dependents; retain the trace rather than skipping it silently.
- Do not replay non-idempotent operations simply because a job shows interrupted after restart.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Coordinator transition tests, crash/retry traces and stale/manual-edit evidence.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S07.04](s07-04-resource-admission.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.
