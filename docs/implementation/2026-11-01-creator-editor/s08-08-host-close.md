---
type: Spec
title: "S08.08: Accept personal hosting and desktop parity"
description: Execute S08.08 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s08]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S08.08
stage_id: S08
effort_days: [1, 1.5]
prerequisites: [S08.07]
execution_state: not_started
---

# S08.08: Accept personal hosting and desktop parity

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-1.5 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S08.07](s08-07-host-recovery.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [packages/server/src/security.test.ts](../../../packages/server/src/security.test.ts)
- [packages/server/src/media.test.ts](../../../packages/server/src/media.test.ts)
- [packages/server/src/live-mcp.test.ts](../../../packages/server/src/live-mcp.test.ts)
- [apps/desktop/src/api/socket.test.ts](../../../apps/desktop/src/api/socket.test.ts)
- [docs/specs/creator-platform-plan.md](../../../docs/specs/creator-platform-plan.md)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Run the complete private single-owner journey: authenticated upload, project open/edit/review/export, cancellation, reconnect, restart and restore.
2. Compare the same portable project on desktop and host for profile/layer/reference/character features selected in the release, with renderer/version differences documented.
3. Exercise all negative authorization/media/worker/SSRF cases from the threat model and inspect logs/downloaded artifacts for server paths and secrets.
4. Measure actual upload time, whole-app/worker resources, cache/storage growth and long-session responsiveness on the declared network/hardware.
5. Write an explicit personal-host capability/limitations statement. Do not label this gate multi-user, public-endpoint or collaboration readiness.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Every scoped API, websocket, upload, range and download operation passes positive/negative authorization checks on the actual deployment.
- Desktop and host exports fully decode and match declared visual/audio/timing tolerances; compatible portable history round-trips.
- Restart/reconnect/backup restore preserve data and avoid duplicate mutation; resource limits and worker isolation are observed, not merely configured.
- All full-hosted required capabilities have current evidence; desktop-only results or a health endpoint cannot close the host gate.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- A failed auth/isolation/recovery case blocks host release and dependent S09 closure; preserve the private test deployment for diagnosis without exposing it.
- Continue to S09.01 only with the host receipt and all selected native/provider/client prerequisites intact.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record M8 personal-host security/parity/operations receipt and explicit excluded public/multi-user scope.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S09.01](s09-01-release-scope.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

