---
type: Spec
title: "S06.07: Expose bounded character configuration and review"
description: Execute S06.07 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s06]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S06.07
stage_id: S06
effort_days: [1, 2]
prerequisites: [S06.06, S01.07]
execution_state: not_started
---

# S06.07: Expose bounded character configuration and review

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-2 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S06.06](s06-06-character-regeneration.md), S01.07. Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [apps/desktop/src/app/layout/ProjectTools.tsx](../../../apps/desktop/src/app/layout/ProjectTools.tsx)
- [apps/desktop/src/app/controller.ts](../../../apps/desktop/src/app/controller.ts)
- [apps/desktop/src/app/chat/TaskQueue.tsx](../../../apps/desktop/src/app/chat/TaskQueue.tsx)
- [apps/desktop/src/editor/preview/RenderedReview.tsx](../../../apps/desktop/src/editor/preview/RenderedReview.tsx)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Add a curated character panel within the existing M1 workspace: pack selection, bounded appearance/action controls, draft/full mode and generation provenance.
2. Show actual renderer/pack/alpha availability and installation or policy error details; never label a pack ready merely because its template id is present.
3. Present draft review before import/full regeneration and keep current timeline visible; display resource wait, progress, cancellation and recoverable stale-artifact states.
4. Route typed requests through the existing controller/task/command path and preserve selection, keyboard/focus behavior and Planning immutability.
5. Provide separate controls to regenerate the selected generated asset and to add a new scene; clarify which action changes project history and keep user overrides.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Browser flow covers change appearance/action, draft, full, import, regenerate, undo and reopen for all three curated examples.
- Unavailable Blender, missing pack, alpha unsupported, failure, cancellation and stale project state each render an accurate recoverable message.
- Keyboard operation and readable controls pass at declared supported layout/DPI sizes; actual native results are recorded separately.
- Planning cannot mutate even if UI state is manipulated; manual edits, queue/steer and Stop still behave as before.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- A browser-only demonstration cannot close a required native configurator gate; retain surface-specific evidence.
- If a new option lacks a validated schema/pack mapping, hide or disable it with a reason instead of accepting free-form script input.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Configurator workflow evidence, capability state matrix and keyboard/native results.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to S06.08 (`s06-08-character-close.md`; later publication batch) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

