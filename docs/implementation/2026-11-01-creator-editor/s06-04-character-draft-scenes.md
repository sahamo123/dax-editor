---
type: Spec
title: "S06.04: Render curated opaque draft and full scenes"
description: Execute S06.04 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s06]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S06.04
stage_id: S06
effort_days: [1, 2]
prerequisites: [S06.03]
execution_state: not_started
---

# S06.04: Render curated opaque draft and full scenes

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-2 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S06.03](s06-03-character-process-limits.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [packages/core/assets/blender/template.py](../../../packages/core/assets/blender/template.py)
- [packages/engine/src/blender.ts](../../../packages/engine/src/blender.ts)
- [packages/core/src/motion.ts](../../../packages/core/src/motion.ts)
- [scripts/verify-blender.mjs](../../../scripts/verify-blender.mjs)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Implement reviewed owned scene construction/loading for the qualified packs, mapping only validated appearance, action, camera and lighting parameters.
2. Produce an opaque low-resolution draft before requesting the full profile; present expected duration/resource cost and retain recipe/version information alongside staged output.
3. Keep scene timing in timeline seconds and normalize frame count/duration explicitly; preserve pose/action range limits and avoid silently stretching an unsupported animation.
4. Use existing optional Blender discovery and permitted FFmpeg encoder fallback; output an ordinary video artifact before adding any alpha path.
5. Release Blender resources after each job and retain only bounded useful staged output; draft/full artifacts do not enter timeline history until a separate commit.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Three curated examples render nonblank decoded scenes; changing an allowed appearance or gesture produces the intended visible change.
- Draft/full profiles preserve duration and framing within declared tolerances; decoded stream geometry/fps and audio absence/presence match metadata.
- Missing pack, digest mismatch, unsupported action and unavailable Blender fail before project mutation.
- Repeated draft attempts, cancel/retry and full-render failure preserve the existing timeline and the last valid recipe.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- If a pack renders blank or violates bounds, mark it unavailable and keep its failed sample for diagnosis rather than shipping an empty success.
- Do not infer transparency from PNG generation or call an opaque MP4 alpha-capable.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Three decoded opaque examples, parameter comparison frames and draft/full timing/resource table.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S06.05](s06-05-character-alpha.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.
