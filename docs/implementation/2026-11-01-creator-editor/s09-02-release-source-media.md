---
type: Spec
title: "S09.02: Validate source compatibility and decoded media"
description: Execute S09.02 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s09]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S09.02
stage_id: S09
effort_days: [1, 1.5]
prerequisites: [S09.01]
execution_state: not_started
---

# S09.02: Validate source compatibility and decoded media

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-1.5 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S09.01](s09-01-release-scope.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [package.json](../../../package.json)
- [packages/core/src/schema.ts](../../../packages/core/src/schema.ts)
- [packages/core/src/session.test.ts](../../../packages/core/src/session.test.ts)
- [packages/core/src/av-sync-render.test.ts](../../../packages/core/src/av-sync-render.test.ts)
- [packages/core/src/render.ts](../../../packages/core/src/render.ts)
- [apps/desktop/package.json](../../../apps/desktop/package.json)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Run the candidate's full required source checks and browser workflows, capturing exact revision, toolchain, exits and all explicit skips.
2. Exercise old/current/future project version handling and persisted history/checkpoint migration; unknown versions reject safely and originals remain backed up.
3. Run selected profile/layer/long-form/reference/character renderer fixtures and fully decode each supported export/codec path using the shipped/runtime-selected encoders.
4. Measure A/V timing against the M0 frame-plus-documented-priming tolerance, including fractional fps, VFR, separate audio, transitions and long timelines.
5. Inspect visual/audio output and missing/corrupt media recovery; do not treat a command success or filter-string assertion as rendered acceptance.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- `pnpm check` and `pnpm --filter @dax/desktop test:e2e` pass for the candidate, with relevant skips individually resolved or declared blockers.
- Migration/undo/reopen and legacy compatibility cases preserve expected project content; no silent stripping of layers or provenance occurs.
- Supported outputs decode through the end with measured duration, stream geometry/audio and no unexplained drift beyond the agreed budget.
- Unsupported codec, missing media and corrupted project fail with safe recovery; existing valid project/history is preserved.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- A platform/runtime skip cannot count as a pass for a required capability; arrange the target test or leave it blocked.
- If code changes to fix a failure, rebind candidate/evidence to the new tree and rerun affected gates rather than mixing revisions.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Source/browser result logs, migration matrix and full-decode/timing output manifest.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S09.03](s09-03-release-ai-clients.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

