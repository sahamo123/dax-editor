---
type: Spec
title: "S06.02: Version bounded character recipes and provenance"
description: Execute S06.02 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s06]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S06.02
stage_id: S06
effort_days: [1, 2]
prerequisites: [S06.01, S02.08]
execution_state: not_started
---

# S06.02: Version bounded character recipes and provenance

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-2 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S06.01](s06-01-character-intake.md), S02.08. Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [packages/core/src/motion.ts](../../../packages/core/src/motion.ts)
- [packages/core/src/schema.ts](../../../packages/core/src/schema.ts)
- [packages/core/src/motion-commands.ts](../../../packages/core/src/motion-commands.ts)
- [packages/core/src/session.ts](../../../packages/core/src/session.ts)
- [packages/protocol/src/index.ts](../../../packages/protocol/src/index.ts)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Extend the typed motion contract for curated template/rig versions, verified asset IDs/digests, allowlisted appearance/action/camera parameters, seed, timeline duration and output metadata.
2. Define draft versus full profiles with explicit resolution/fps/duration caps; preserve existing defaults and reject unsupported frame-rate/output combinations rather than silently changing timing.
3. Persist bounded CharacterRecipe provenance through M2 project/history migration. Keep machine paths, temporary frame directories and private renderer settings out of portable metadata.
4. Define render-artifact and commit records separately so long rendering can occur outside the session mutation lock while import/regeneration remains revision-bound.
5. Expose truthful supported-template/capability descriptors through the existing command registry; keep arbitrary Python, shell arguments, URLs and unverified blend-file paths out of agent-facing requests.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Existing motion requests and saved projects still round-trip; new recipes retain versioned parameters through save/reopen/undo history.
- Reject unknown rig/action IDs, nonfinite or out-of-range values, mismatched asset hashes, arbitrary scripts and unsupported future recipe versions.
- Same seed/parameters produce a stable recipe digest without promising cross-version pixel identity.
- Schema fixtures demonstrate separate staging and commit ownership, with explicit stale-revision and unavailable-renderer responses.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- If recipe persistence needs an incompatible M2 change, block writing new projects until migration/backup behavior is accepted.
- If the contract cannot express a requested action within bounds, report unsupported rather than passing free-form text into a script.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Recipe/profile schemas, compatibility fixtures and staged-artifact/commit contract.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S06.03](s06-03-character-process-limits.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

