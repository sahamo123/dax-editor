---
type: Spec
title: "S06.06: Commit and regenerate character assets atomically"
description: Execute S06.06 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s06]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S06.06
stage_id: S06
effort_days: [1, 2]
prerequisites: [S06.05]
execution_state: not_started
---

# S06.06: Commit and regenerate character assets atomically

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-2 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S06.05](s06-05-character-alpha.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [packages/core/src/motion-commands.ts](../../../packages/core/src/motion-commands.ts)
- [packages/core/src/session.ts](../../../packages/core/src/session.ts)
- [packages/server/src/engine.ts](../../../packages/server/src/engine.ts)
- [packages/server/src/project-manager.ts](../../../packages/server/src/project-manager.ts)
- [packages/core/src/motion-commands.test.ts](../../../packages/core/src/motion-commands.test.ts)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Adapt render/import so rendering produces a staged artifact outside the short mutation lock; only the authoritative session can add or replace the asset.
2. Capture project identity/revision, old asset identity/digest and recipe before dispatch; validate them again immediately before commit.
3. Add new or regenerated output through the shared command registry as one undo entry, preserving stable asset IDs and enforcing duration/placement compatibility.
4. Keep originals reachable by undo/history and saved checkpoints; define cleanup by references rather than deleting the replaced file immediately.
5. On stale revision, cancelled late completion or missing target asset, leave a bounded recoverable artifact with explicit reapply/discard choices instead of overwriting intervening edits.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Import/regenerate/undo/redo/save/reopen restore exact asset identities and recipes; one user operation yields one history entry.
- A manual edit during rendering remains intact and stale commit is rejected; cancelled jobs cannot commit after cancellation.
- Duration mismatch, removed target, changed recipe/pack version and duplicate delivery do not create duplicate clips or silently replace the wrong asset.
- Crash between render completion and commit preserves either the prior valid project or a committed valid state; recovery does not replay an uncertain mutation.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- If asset ownership or revision cannot be proved, preserve the artifact and require a newly validated commit; never guess the intended current project.
- Do not garbage-collect media referenced by any retained history/checkpoint or user project.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Atomic commit/regeneration tests, before/after history records and stale/cancel recovery examples.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S06.07](s06-07-character-configurator.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

