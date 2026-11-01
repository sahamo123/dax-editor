---
type: Spec
title: "S07.01: Define bounded workflow and journal semantics"
description: Execute S07.01 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s07]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S07.01
stage_id: S07
effort_days: [0.5, 1]
prerequisites: [S06.08, S02.08]
execution_state: not_started
---

# S07.01: Define bounded workflow and journal semantics

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **0.5-1 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S06.08](s06-08-character-close.md), S02.08. Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [packages/server/src/tasks.ts](../../../packages/server/src/tasks.ts)
- [packages/server/src/jobs.ts](../../../packages/server/src/jobs.ts)
- [packages/server/src/engine.ts](../../../packages/server/src/engine.ts)
- [packages/protocol/src/index.ts](../../../packages/protocol/src/index.ts)
- [docs/adr/0013-local-chat-task-queue.md](../../../docs/adr/0013-local-chat-task-queue.md)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Write the workflow/journal ADR and feature spec before implementation: one authoritative session owner, deterministic dependency execution and bounded roles using current provider adapters.
2. Define parent/child/dependency IDs, captured mode/settings/project/revision, resource class, input digest, attempt, output references, failure category and idempotency/operation IDs.
3. Separate task metadata, artifact completion and project commit state; document each crash window and the evidence needed to determine whether a mutation already happened.
4. Audit TaskStore limits and error semantics: current recent-task JSON is not a transaction journal, put queues writes and logs write errors. Define explicit durable acknowledgements before dispatch.
5. Prefer extending the bounded local store; adopt a database only with measured atomicity/volume justification and a migration ADR. Do not introduce Redis or a second agent runtime.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- A state-transition table covers queued/resource-wait/running/blocked/interrupted/completed/cancelled with legal retry and commit rules.
- Schema rejects cyclic/self dependencies, malformed IDs, unbounded child counts, secret-bearing snapshots and unsupported future versions.
- Crash scenarios distinguish before dispatch, after artifact, after commit and before receipt; none permits blind mutation replay.
- Existing task queue, non-cancelling steering, Stop and Planning semantics remain contractual invariants.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- If the current storage cannot prove the selected durability contract, resolve the ADR before enabling workflows.
- An optional adapter is represented as unavailable until its prerequisite capability exists; do not build speculative duplicate services.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Workflow/journal ADR, schemas, crash-state table and bounded store decision.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S07.02](s07-02-workflow-journal.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.
