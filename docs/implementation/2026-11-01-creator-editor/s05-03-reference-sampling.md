---
type: Spec
title: "S05.03: Acquire and cache bounded local samples"
description: Execute S05.03 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s05]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S05.03
stage_id: S05
effort_days: [1, 2]
prerequisites: [S05.02]
execution_state: not_started
---

# S05.03: Acquire and cache bounded local samples

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-2 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S05.02](s05-02-reference-contracts.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [packages/core/src/connector.ts](../../../packages/core/src/connector.ts)
- [packages/core/src/media.ts](../../../packages/core/src/media.ts)
- [packages/server/src/paths.ts](../../../packages/server/src/paths.ts)
- [packages/server/src/media-pipeline.ts](../../../packages/server/src/media-pipeline.ts)
- [packages/engine/src/launch.ts](../../../packages/engine/src/launch.ts)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Implement the injected engine reference sampler as a proposed new module. Resolve only an authorized local asset through existing root/symlink validation; do not translate arbitrary URLs into FFmpeg inputs.
2. Probe and digest the source before sampling; validate supported media kind, duration, resolution and the explicit excerpt limits from the spike.
3. Extract bounded frame/audio samples using array arguments and owned temporary directories; carry source timestamps through every result and expose cancellation/progress.
4. Key the analysis cache by source content digest, sample policy and analyzer version. Define invalidation on changed/deleted source and cap cache bytes; do not reuse the proxy cache's path/mtime key as content provenance.
5. Keep analysis artifacts separate from the editable timeline and portable project. Clean partial work on failure while preserving a valid earlier cache entry; never send frames/transcripts to a service implicitly.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Generated fixtures verify timestamp/sample limits, missing audio and repeated digest-stable cache hits; changing source bytes or analyzer policy causes a miss.
- Root escape, symlink escape, deceptive extension, oversized probe and unsupported URL are rejected before native processing.
- Cancellation during extraction stops owned child work and removes partial output; repeated execution neither duplicates project assets nor changes history.
- A missing source invalidates analysis availability with a recoverable message; the cache stays within its declared byte budget.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- Retain the original media and project on corrupt or missing input; report the exact recoverable source condition.
- If process cancellation cannot be verified on a target OS, leave that target blocked rather than marking sampling ready.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Sampler/cache tests, bounds table and private sample manifest with timestamps and hashes.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S05.04](s05-04-reference-measurements.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.
