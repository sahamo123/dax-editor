---
type: Spec
title: "S06.03: Harden owned Blender process execution"
description: Execute S06.03 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s06]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S06.03
stage_id: S06
effort_days: [2, 3]
prerequisites: [S06.02]
execution_state: not_started
---

# S06.03: Harden owned Blender process execution

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **2-3 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S06.02](s06-02-character-contracts.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [packages/engine/src/blender.ts](../../../packages/engine/src/blender.ts)
- [packages/core/assets/blender/template.py](../../../packages/core/assets/blender/template.py)
- [packages/server/src/ffmpeg-run.ts](../../../packages/server/src/ffmpeg-run.ts)
- [packages/server/src/jobs.ts](../../../packages/server/src/jobs.ts)
- [scripts/verify-blender.mjs](../../../scripts/verify-blender.mjs)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Audit the existing adapter: it already sets two threads and a 30-minute Blender timer plus a 120-second encoding timeout. Refine stage-specific timeout classification and cleanup instead of adding a duplicate timer blindly.
2. Retain factory startup, disabled autoexec and owned scripts; add reliable explicit Python failure signaling for supported Blender versions and validate arguments against the pinned runtime.
3. Bound frame count, per-frame dimensions, temporary output bytes and total job disk use. Refuse insufficient-space or oversized jobs before dispatch and stop growth at the declared limit.
4. Register and await owned child-process termination across cancellation, timeout, spawn failure and shutdown; confirm descendants and file handles are released on each supported OS.
5. Validate output inventory and paths before encoding/import, encode with the existing permitted codec selection, and remove only canonical task-owned directories after failure.
6. Keep reviewed scripts trusted application code: disabled autoexec is not a Python sandbox. Defer hosted OS/container isolation to S08 and never accept arbitrary user code.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Tests distinguish spawn failure, Python failure, timeout, cancellation, disk exhaustion and encoding error without reporting success from partial frames.
- Cancellation and shutdown wait for child close; actual process inspection shows no orphan child or locked temporary output.
- Path/symlink escape and unexpected extra output are rejected; original inputs and earlier valid render assets remain intact.
- Real supported Blender version smoke tests demonstrate a bounded owned script and full decoded output; mocks alone cannot prove process cleanup.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- A policy-blocked Windows executable remains BLOCKED; continue independent source/Linux checks without modifying machine policy.
- If process-tree cleanup is not reliable on a declared target, keep character rendering unavailable there until corrected.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Runtime compatibility table, failure/cleanup regressions and measured process/disk bounds.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to S06.04 (`s06-04-character-draft-scenes.md`; later publication batch) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

