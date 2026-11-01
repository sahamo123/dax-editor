---
type: Spec
title: "S08.06: Recover browser sessions and task controls remotely"
description: Execute S08.06 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s08]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S08.06
stage_id: S08
effort_days: [1, 1.5]
prerequisites: [S08.05]
execution_state: not_started
---

# S08.06: Recover browser sessions and task controls remotely

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-1.5 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S08.05](s08-05-private-deployment.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [apps/desktop/src/api/client.ts](../../../apps/desktop/src/api/client.ts)
- [apps/desktop/src/api/socket.ts](../../../apps/desktop/src/api/socket.ts)
- [apps/desktop/src/app/controller.ts](../../../apps/desktop/src/app/controller.ts)
- [packages/server/src/hub.ts](../../../packages/server/src/hub.ts)
- [packages/server/src/tasks.ts](../../../packages/server/src/tasks.ts)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Adapt the shared client bootstrap to the approved gateway session and scoped handles; keep local desktop connection behavior intact.
2. Resynchronize authoritative project/revision and task/journal state after reconnect rather than resubmitting prior mutation requests blindly.
3. Show upload/resource wait, interrupted connection, expired session and server-restart states with explicit retry eligibility.
4. Preserve queue, steering, Stop and revision guards across transport loss; cancellation is authorized to the workspace and cannot target arbitrary host jobs.
5. Bound event/backpressure buffers and avoid rebroadcasting giant snapshots unnecessarily; ensure long media UI does not load all remote thumbnails at once.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Disconnect during upload, render and commit then reconnect: no duplicate edit/export appears and current manual changes remain intact.
- Revocation/expiry closes access and subscriptions; reauthentication cannot reuse stale unauthorized handles.
- Stop/steer/retry operate on the intended live task after reconnect and preserve Planning immutability.
- Throttled/latent transport and stale/out-of-order events keep terminal task states correct without unbounded client/server memory.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- If commit outcome is unknown, query the durable operation receipt; do not replay a request based on a lost HTTP response.
- Do not retain credentials in reconnect URLs or browser-exported diagnostics.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Disconnect/reconnect scenario traces, authorization checks and bounded-buffer measurements.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S08.07](s08-07-host-recovery.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

