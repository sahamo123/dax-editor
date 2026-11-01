---
type: Spec
title: "S07.07: Accept workflow recovery and actual clients"
description: Execute S07.07 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s07]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S07.07
stage_id: S07
effort_days: [0.5, 0.75]
prerequisites: [S07.06]
execution_state: not_started
---

# S07.07: Accept workflow recovery and actual clients

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **0.5-0.75 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S07.06](s07-06-workflow-trace.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [packages/server/src/task-queue.test.ts](../../../packages/server/src/task-queue.test.ts)
- [packages/server/src/live-mcp.test.ts](../../../packages/server/src/live-mcp.test.ts)
- [packages/agent/src/steering.test.ts](../../../packages/agent/src/steering.test.ts)
- [scripts/verify-offline-bundle.mjs](../../../scripts/verify-offline-bundle.mjs)
- [docs/STATUS.md](../../../docs/STATUS.md)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Run the fault matrix across duplicate dispatch, crash around artifact/commit, late cancellation, stale project revision, missing media and resource exhaustion.
2. Measure a complete local workflow under the shared admission budget, including proxy/background jobs, and prove no duplicate mutation after explicit retry/restart.
3. Perform actual assistant-driven sessions for each external client in the provisional capability/client/target selection recorded at execution launch/S00.01, separately from SDK/tool transport and configuration diagnostics. S09.01 later freezes and revalidates this selection; it is not the first time requirements are chosen.
4. Confirm Planning immutability, grouped undo, manual edits during analysis, queue, steering and Stop in the real visible editor.
5. Close M7 with a traceable result per role/client/resource class; record optional excluded clients as not selected and required unavailable clients as blocked.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Fault cases produce at-most-once mutation outcomes with inspectable journal/project evidence; no uncertain edit is replayed.
- Measured app/child resources and latency satisfy the established budgets and leave no stray native process.
- Selected real clients demonstrate natural-language request, tool execution, visible edit, undo and decoded export; credentials/session authorization must actually be available.
- Local/no-key workflow remains fully functional, and every required source/browser/native/client gate is current for the same tree.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- Missing authorization or credentials for a selected real client blocks this gate; configuration text or a mock is not a substitute.
- On desktop-creator route proceed directly to S09.01 after PASS. Enter optional S08 only for the explicit full-hosted route; do not make hosting a desktop prerequisite.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record M7 fault/client/resource matrix, journal traces and route-specific stage closure.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S09.01](s09-01-release-scope.md) for desktop-creator, or [S08.01](s08-01-host-threat-model.md) for full-hosted, only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.
