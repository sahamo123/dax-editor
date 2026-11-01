---
type: Spec
title: "S06.08: Accept curated character rendering across targets"
description: Execute S06.08 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s06]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S06.08
stage_id: S06
effort_days: [2, 3]
prerequisites: [S06.07]
execution_state: not_started
---

# S06.08: Accept curated character rendering across targets

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **2-3 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S06.07](s06-07-character-configurator.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [scripts/verify-blender.mjs](../../../scripts/verify-blender.mjs)
- [.github/workflows/blender-acceptance.yml](../../../.github/workflows/blender-acceptance.yml)
- [packages/engine/src/blender.ts](../../../packages/engine/src/blender.ts)
- [docs/STATUS.md](../../../docs/STATUS.md)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Extend opt-in real Blender acceptance for the three qualified packs: appearance/action change, opaque draft/full, alpha review, import, regeneration and undo.
2. Run failure/timeout/cancel/shutdown tests with actual child-process observation and disk cleanup on supported target runtimes; distinguish Linux results from Windows policy readiness.
3. Review alpha edges, animation continuity, timing and final decoded exports using the predeclared rubric and source-matched artifacts.
4. Verify pack pins/licences/notices and runtime/template provenance in distributed metadata; keep private art and generated videos outside Git.
5. Close M6 only for selected capabilities with complete evidence; publish explicit availability/limitations for optional Blender and transfer unresolved target blockers to release tracking.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Three curated examples complete the full user flow and full-decode checks with source SHA, Blender version, renderer hash and pack digest recorded.
- No stray process, locked workspace or unbounded temporary output remains after success/failure/cancel; measurements satisfy declared limits.
- Alpha edge and regeneration history assertions pass, including manual revision conflicts and cancelled late output.
- Every required target has real evidence; historical Linux templates or mocks do not substitute for new character/native acceptance.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- If a required target is policy-blocked, stop the stage/route at this gate; independent source work is allowed but completion is not.
- If optional Blender was not selected at launch, retain that explicit boundary and do not advertise character availability. Removing already selected character/native acceptance needs an explicit user-reviewed scope change; the implementer cannot exclude it to evade a blocker.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record M6 acceptance matrix, pack provenance, process/resource evidence and selected-capability limitations.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S07.01](s07-01-workflow-contract.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

