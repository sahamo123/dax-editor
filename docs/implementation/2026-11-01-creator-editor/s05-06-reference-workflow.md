---
type: Spec
title: "S05.06: Add editable reference review and apply controls"
description: Execute S05.06 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s05]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S05.06
stage_id: S05
effort_days: [1, 2]
prerequisites: [S05.05, S01.07]
execution_state: not_started
---

# S05.06: Add editable reference review and apply controls

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-2 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S05.05](s05-05-reference-preview.md), S01.07. Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [apps/desktop/src/app/layout/ProjectTools.tsx](../../../apps/desktop/src/app/layout/ProjectTools.tsx)
- [apps/desktop/src/app/controller.ts](../../../apps/desktop/src/app/controller.ts)
- [apps/desktop/src/editor/preview/RenderedReview.tsx](../../../apps/desktop/src/editor/preview/RenderedReview.tsx)
- [packages/server/src/engine.ts](../../../packages/server/src/engine.ts)
- [packages/core/src/session.ts](../../../packages/core/src/session.ts)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Add Reference style controls using the M1 design tokens and workflow layout; show source attribution, excerpt limits, progress, evidence/confidence and unknown treatments.
2. Allow user correction of recipe values before preview and application; preserve overridden values when analysis refreshes and clearly separate corrected from detected fields.
3. Wire analyze, preview and apply through the existing command/controller/session path. Apply a validated current EditPlan as one undo entry; keep expensive analysis/rendering outside the short mutation lock.
4. Provide explicit source/capability/error states, cancellation, retry and keyboard navigation. A link without an authorized local file must explain what is available without pretending it was analyzed.
5. Enforce Planning as read-only at the engine boundary and use expected project/revision for commit; preserve task steering/Stop behavior rather than creating a parallel task UI.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Browser tests cover select/excerpt/analyze/correct/preview/apply/undo/redo/save/reopen and show unsupported capabilities accurately.
- Cancel, stale revision, deleted reference, failed render and unavailable analyzer retain the user's edits and offer a specific recovery action.
- One apply creates one history entry; one undo restores all changed fields, and repeated delivery cannot duplicate the edit.
- Keyboard/focus and readable evidence/error states pass in the browser; native behavior is separately recorded on a policy-authorized target.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- If UI renders correctly but native execution is blocked, record browser PASS and native BLOCKED without completing a required native gate.
- If a recipe changes during application, reject and regenerate instead of applying a mixed-version edit.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Workflow recordings/screenshots, history diff and source/browser/native evidence separated by surface.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S05.07](s05-07-reference-close.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

