---
type: Spec
title: "S05.04: Extract deterministic style evidence"
description: Execute S05.04 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s05]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S05.04
stage_id: S05
effort_days: [1, 2]
prerequisites: [S05.03]
execution_state: not_started
---

# S05.04: Extract deterministic style evidence

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-2 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S05.03](s05-03-reference-sampling.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [packages/core/src/media.ts](../../../packages/core/src/media.ts)
- [packages/core/src/test-utils.ts](../../../packages/core/src/test-utils.ts)
- [packages/engine/src/launch.ts](../../../packages/engine/src/launch.ts)
- [packages/evals/AGENTS.md](../../../packages/evals/AGENTS.md)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Implement only features accepted by S05.01 using the bounded samples: shot/cut timing, aspect/framing indicators, palette and audio energy where supported.
2. Keep parsers and feature reducers pure, separate from sampling/native execution; document source-time units, thresholds, frame-rate normalization and confidence meaning.
3. Attach evidence timestamps and method/version to each observation. Preserve unknown typography, semantic layout or transition fields when no qualified detector exists.
4. Combine transcript-derived structural hints only when a transcript exists, labeling them as inferred and treating transcript text as untrusted content.
5. Build deterministic generated fixtures with known cuts/colors/tones and a separate held-out evaluation adapter; retain raw measurements so a reviewer can reproduce a recipe decision.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Known-cut fixtures measure boundary error within the spike's declared tolerance, including fractional fps, fades and hard-cut negatives.
- Palette/audio tests compare decoded measurements, with silent/no-audio/rotated/VFR cases and explicit unsupported results.
- Injected instructions in transcripts and filenames cannot add tools, alter the project or bypass analysis bounds.
- Repeat runs on the same digests produce stable measured fields; uncertain features remain unknown and confidence is calibrated against the annotation rubric.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- If a feature exceeds its error/resource limit, mark it unsupported and preserve the evidence; do not fill the gap with an unverified model guess.
- Cache/version changes invalidate prior results explicitly so old measurements are not treated as current.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Feature coverage/errors report, generated-fixture measurements and held-out analysis records.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S05.05](s05-05-reference-preview.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

