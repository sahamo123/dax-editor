---
type: Spec
title: "S07.06: Expose workflow trace and live-client controls"
description: Execute S07.06 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s07]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S07.06
stage_id: S07
effort_days: [0.5, 0.75]
prerequisites: [S07.05]
execution_state: not_started
---

# S07.06: Expose workflow trace and live-client controls

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **0.5-0.75 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S07.05](s07-05-specialist-adapters.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [apps/desktop/src/app/chat/TaskQueue.tsx](../../../apps/desktop/src/app/chat/TaskQueue.tsx)
- [apps/desktop/src/app/controller.ts](../../../apps/desktop/src/app/controller.ts)
- [packages/protocol/src/index.ts](../../../packages/protocol/src/index.ts)
- [packages/server/src/live-mcp.ts](../../../packages/server/src/live-mcp.ts)
- [packages/mcp/src/server.ts](../../../packages/mcp/src/server.ts)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Extend shared task protocol summaries with parent/child/dependency/artifact links and honest queued/resource-wait/blocked/interrupted states.
2. Show compact workflow trace in the existing task UI, preserving non-cancelling steering and a separate Stop action; avoid duplicating the entire project snapshot in each event.
3. Expose typed status/cancellation through the existing live command registry and transport; keep one live project owner and existing token/Host/Origin boundaries.
4. Handle reconnect and out-of-order state/job events without replacing terminal outcomes with stale running snapshots.
5. Redact private filesystem paths, credentials and unnecessary transcript content from traces; provide a bounded safe artifact summary and explicit retry eligibility.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Browser tests exercise parent/child progress, failure, resource wait, Stop, steering and restart interruption with keyboard access.
- Real-server protocol tests cover unauthorized reads/cancels, wrong project/task ownership and Planning refusal.
- Out-of-order events and reconnect never show a completed job stuck at 100 percent or revive cancelled work.
- An MCP SDK transport test proves the shared visible session changes, while its receipt explicitly does not claim natural-language assistant inference.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- If trace metadata leaks secrets or paths, fix serialization before enabling external clients.
- If a terminal state cannot be reconciled, display interrupted/unknown with recovery instructions rather than fabricate completion.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Trace UI/protocol evidence, reconnect regressions and transport-only boundary receipt.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S07.07](s07-07-workflow-close.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

