---
type: Spec
title: "S05.07: Close reference-style quality and compatibility"
description: Execute S05.07 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s05]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S05.07
stage_id: S05
effort_days: [1, 2]
prerequisites: [S05.06]
execution_state: not_started
---

# S05.07: Close reference-style quality and compatibility

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-2 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S05.06](s05-06-reference-workflow.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [packages/evals/AGENTS.md](../../../packages/evals/AGENTS.md)
- [packages/core/src/render.ts](../../../packages/core/src/render.ts)
- [packages/server/src/render-preview.test.ts](../../../packages/server/src/render-preview.test.ts)
- [docs/specs/creator-platform-plan.md](../../../docs/specs/creator-platform-plan.md)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Run the predeclared held-out corpus with fixed analyzer/recipe versions; do not tune on the hold-out while reporting its original score.
2. Compare measurements against annotations and human review of supported style similarity on the user's own footage, reporting per-feature accuracy and unsupported coverage.
3. Exercise local/no-key operation, invalid/unavailable URL, corrupt media, prompt-injection text, stale plan and all documented excerpt/resource limits.
4. Verify profile/layer migration, recipe override preservation and complete apply/undo/save/reopen across desktop, CLI and MCP capabilities actually exposed.
5. Write the M5 exit receipt with accepted limitations, exact revisions and selected release capability. Keep OCR/vision and downloader work outside this milestone unless separately specified and qualified.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- All declared deterministic tolerances pass and the human comparison rubric records reviewer/date/sample IDs; successful JSON alone is not visual acceptance.
- Fully decoded preview/export samples match supported recipe effects, including required M3 advanced styles.
- No source asset rights, licence or provenance item remains unresolved for distributed fixtures; private corpus evidence remains private.
- Run required source/browser checks and record native eligibility independently; any required gate lacking evidence leaves M5 incomplete.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- A failed held-out feature must be fixed and evaluated on an untainted set. Removing a required capability needs an explicit user-reviewed scope change and relevant revalidation; never hide the failure in a total score.
- An absent credential or native authorization cannot be converted to a mocked success; retain a blocked receipt and continue only independent authorized work.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record M5 acceptance matrix, quality report, capability/limitations statement and stage receipt.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S06.01](s06-01-character-intake.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.
