---
type: Spec
title: "S09.08: Adjudicate readiness and hand off exact release scope"
description: Execute S09.08 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s09]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S09.08
stage_id: S09
effort_days: [0.5, 1]
prerequisites: [S09.07]
execution_state: not_started
---

# S09.08: Adjudicate readiness and hand off exact release scope

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **0.5-1 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S09.07](s09-07-release-provenance.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [docs/STATUS.md](../../../docs/STATUS.md)
- [docs/engineering/handoff.md](../../../docs/engineering/handoff.md)
- [docs/engineering/laptop-continuation.md](../../../docs/engineering/laptop-continuation.md)
- [docs/log.md](../../../docs/log.md)
- [docs/specs/creator-platform-plan.md](../../../docs/specs/creator-platform-plan.md)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Independently audit every selected route/stage receipt against the final candidate SHA and artifact hashes, including regressions after the last code/package change.
2. Resolve each required source/browser/native/offline/provider/client/host/migration/performance/provenance row as PASS or BLOCKED/FAIL with evidence; skipped/not selected is not PASS.
3. State READY only for the exact selected capabilities and tested targets when all their mandatory gates pass. Otherwise state NOT READY with concrete blockers and independent work that remains possible.
4. Update durable status/handoff/setup/limitations and issue/PR verification descriptions, separating implementation completion from this handbook's planning completion.
5. Prepare any release/merge/publication proposal as a reviewable result and follow repository/user authorization; this acceptance step does not authorize auto-merge, push to main or public publication.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Independent reviewer can reproduce receipt assertions from source, commands and artifacts without chat history or private memory.
- Core packaged native/offline/upgrade/data-preservation gates are mandatory; selected provider/client/host gates cannot be replaced by mocks or lower-level diagnostics.
- Owner-laptop readiness, runner-native acceptance, optional Linux Blender and personal hosting retain their exact machine/scope labels.
- Final docs indexes/OKF and links pass; handoff gives done/next/blocked items and source/package hashes without exposing secrets.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- Any missing, stale or contradictory required evidence leaves release NOT READY and the execution goal incomplete.
- A later approved scope change requires a new explicit capability declaration and relevant revalidation; never erase a failed gate from history.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Independent final readiness decision, evidence matrix and exact-scope handoff; no automatic publication.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to the next separately authorized release or follow-up issue only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

