---
type: Spec
title: "S06.05: Preserve alpha through character composition"
description: Execute S06.05 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s06]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S06.05
stage_id: S06
effort_days: [1, 2]
prerequisites: [S06.04, S03.09]
execution_state: not_started
---

# S06.05: Preserve alpha through character composition

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-2 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S06.04](s06-04-character-draft-scenes.md), S03.09. Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [packages/engine/src/blender.ts](../../../packages/engine/src/blender.ts)
- [packages/core/src/render.ts](../../../packages/core/src/render.ts)
- [packages/core/src/image-render.test.ts](../../../packages/core/src/image-render.test.ts)
- [packages/core/src/overlay-render.test.ts](../../../packages/core/src/overlay-render.test.ts)
- [packages/server/src/render-preview.test.ts](../../../packages/server/src/render-preview.test.ts)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Specify the alpha-preserving intermediate and straight/premultiplied convention in the composition/character ADR; use only codecs/containers actually supported by the selected runtime.
2. Extend the controlled render/encode path without reusing opaque yuv420p MP4 as a transparent intermediate. Preserve alpha metadata through probing, asset persistence and relinking.
3. Integrate transparent character footage as an M3 layer through the same renderer used for exact review and final export.
4. Build synthetic edge samples and the curated hair/clothing/gesture cases over light, dark and colored backgrounds; include transformed, scaled and overlapping layers.
5. Declare interactive preview coverage separately; route unsupported exact alpha preview to rendered review without silently displaying an incorrect composite.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Decoded alpha has expected transparent/opaque values and edge tolerance; no black/white halo appears in reviewed light/dark composites.
- Fractional-fps composition, trim and layer timing remain synchronized within the M0 frame/priming budget.
- Shared review and final export match the agreed alpha treatment; save/reopen and undo retain the chosen convention.
- Missing intermediate codec, malformed alpha and oversized frames return explicit unavailable/errors without fallback to opaque success.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- If the selected runtime cannot preserve alpha, keep alpha capability blocked and opaque scenes separately labeled.
- Do not advance a release that selected alpha until both its M3 and M6 real rendered evidence pass.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Intermediate/alpha decision, decoded edge measurements and preview/export comparison artifacts.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S06.06](s06-06-character-regeneration.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

