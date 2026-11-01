---
type: Spec
title: "S05.05: Compile recipes and render comparison previews"
description: Execute S05.05 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s05]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S05.05
stage_id: S05
effort_days: [0.5, 1]
prerequisites: [S05.04, S03.09]
execution_state: not_started
---

# S05.05: Compile recipes and render comparison previews

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **0.5-1 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S05.04](s05-04-reference-measurements.md), S03.09. Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [packages/core/src/template-commands.ts](../../../packages/core/src/template-commands.ts)
- [packages/core/src/commands.ts](../../../packages/core/src/commands.ts)
- [packages/core/src/render.ts](../../../packages/core/src/render.ts)
- [packages/server/src/render-preview.test.ts](../../../packages/server/src/render-preview.test.ts)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Compile evidence plus user overrides into bounded typed operations using M2 capabilities and M3 composition; enumerate unsupported treatments rather than partially applying them silently.
2. Produce an EditPlan tied to the current project identity/revision, source digests and recipe version. Keep reference footage outside the output project's media selection.
3. Create a preview snapshot of the user's own footage and send it through the existing shared export/review renderer, preserving project and history state.
4. Expose the before/after sample range, intended changes, unknowns and required capabilities so the user can review what will be applied.
5. Reject stale plans/previews after relevant project, asset or recipe changes; keep a recoverable recipe so the user can regenerate a current preview.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Identical inputs/overrides compile to identical bounded operations; missing capabilities produce an explicit unavailable list and no hidden fallback.
- Preview output is fully decoded and compared with the intended effects; its creation does not change project revision/history.
- Manual editing while a preview runs invalidates its commit eligibility without discarding the manual edit.
- Reference clips/music/text are never copied into the output; a generated fixture proves only the user's media and supported generic parameters are rendered.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- If M3 parity or capability receipt is missing, stop advanced preview/application; do not claim an opaque baseline can implement alpha or layered styles.
- If review fails, retain the recipe and error details while removing partial render output.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Deterministic plan examples, before/after decoded samples and stale-preview regression results.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S05.06](s05-06-reference-workflow.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

