---
type: Spec
title: "S08.07: Verify quotas backup restore and workspace recovery"
description: Execute S08.07 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s08]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S08.07
stage_id: S08
effort_days: [1, 1.5]
prerequisites: [S08.06]
execution_state: not_started
---

# S08.07: Verify quotas backup restore and workspace recovery

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-1.5 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S08.06](s08-06-host-reconnect.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [packages/server/src/stores.ts](../../../packages/server/src/stores.ts)
- [packages/server/src/project-manager.ts](../../../packages/server/src/project-manager.ts)
- [packages/server/src/tasks.ts](../../../packages/server/src/tasks.ts)
- [packages/server/src/media-pipeline.ts](../../../packages/server/src/media-pipeline.ts)
- [docs/engineering/laptop-continuation.md](../../../docs/engineering/laptop-continuation.md)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Define coherent backup boundaries for projects, referenced assets, workflow journal and private configuration; handle in-flight mutations by quiescence or the accepted snapshot contract.
2. Implement/document quota accounting for originals, generated output, staging and caches with preflight and runtime enforcement.
3. Separate reproducible cache eviction from user assets/history; preserve unresolved operation artifacts and never prune media still referenced by a checkpoint.
4. Rehearse restore into a fresh private volume/host, verify digests, relink assets and reconcile interrupted jobs without automatic uncertain mutation replay.
5. Document restore ownership, secret reprovisioning, recovery time/data-loss targets and safe rollback to the last known valid workspace.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Backup/restore reproduces saved projects/history and fully decoded exports on a clean host; hashes identify every collected asset.
- Disk-full during upload/render/journal write fails safely and recovers without corrupting the last committed project.
- Quota enforcement includes temporary/native output and cannot be bypassed by concurrent jobs or repeated failed uploads.
- Restored sessions/keys follow the security policy, old sessions are not unintentionally revived and no secrets enter downloadable backups without explicit handling.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- A backup that cannot be restored and decoded is not a passing recovery gate; retain failed evidence and fix the process.
- If free space is exhausted, stop admissions and safely remove only proven disposable cache/task output before retrying.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Quota tests, fresh-volume restore receipt and measured recovery/runbook results.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S08.08](s08-08-host-close.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.
