---
type: Spec
title: "S05.01: Bound the reference-style feasibility decision"
description: Execute S05.01 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s05]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S05.01
stage_id: S05
effort_days: [2, 2]
prerequisites: [S04.08, S02.08]
execution_state: not_started
---

# S05.01: Bound the reference-style feasibility decision

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **2-2 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: S04.08, S02.08. Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [docs/specs/creator-platform-plan.md](../../../docs/specs/creator-platform-plan.md)
- [packages/engine/src/launch.ts](../../../packages/engine/src/launch.ts)
- [packages/core/src/media.ts](../../../packages/core/src/media.ts)
- [packages/core/AGENTS.md](../../../packages/core/AGENTS.md)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Create the reference feature spec before production code: local authorized video is the analysis input; an optional URL is attribution only. Separate rights to use footage from permission to acquire it from a platform.
2. Within the two-day spike, sample a bounded excerpt using existing media tooling; measure cut timing, framing/aspect, palette and audio energy on the M0 corpus. Record maximum duration, pixels, frames, wall time and memory before evaluating quality.
3. Compare measured features with human annotations; classify typography, text layout, gestures and visual semantics as unknown unless the spike actually supports them. The text-only local model must not be described as viewing footage.
4. Propose the smallest deterministic baseline and an explicit proceed, narrow or stop decision. Dropping a selected required capability needs an explicit user-reviewed scope decision; the implementer cannot waive acceptance. Any OCR/vision candidate needs its own licence, weight, resource and security intake before a later dependency PR.
5. Define the held-out reference set and quality rubric before implementation. Reserve examples unseen during tuning and keep private media outside Git; do not install a downloader or embed copied source assets.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- A reproducible spike receipt includes source digests, sample timestamps, measured versus inferred fields and per-feature error examples.
- An unavailable URL, audio-only source, silent clip and unsupported visual treatment produce useful unknown/unavailable results without a project mutation.
- The local route completes without a hosted key or external network request; record the exact toolchain and resource ceiling used.
- The decision allocates the remaining 5-10 engineering days within M5; infeasible features become explicit later scope rather than silent scope growth.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- If corpus rights are uncertain, keep that item excluded and record which authorized fixture can replace it.
- If the spike cannot meet the declared budget or yield useful features, stop dependent M5 implementation and propose a narrowed decision in the issue/spec for explicit user review before changing required scope.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Feasibility report, feature coverage table, held-out corpus manifest and a proceed/narrow/stop decision.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S05.02](s05-02-reference-contracts.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.
