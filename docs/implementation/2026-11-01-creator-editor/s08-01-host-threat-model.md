---
type: Spec
title: "S08.01: Define the optional personal-host trust boundary"
description: Execute S08.01 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s08]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S08.01
stage_id: S08
effort_days: [1, 2]
prerequisites: [S07.07, S02.08]
execution_state: not_started
---

# S08.01: Define the optional personal-host trust boundary

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-2 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S07.07](s07-07-workflow-close.md), S02.08. Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [packages/server/src/server.ts](../../../packages/server/src/server.ts)
- [packages/server/src/security.ts](../../../packages/server/src/security.ts)
- [packages/server/src/paths.ts](../../../packages/server/src/paths.ts)
- [packages/engine/src/launch.ts](../../../packages/engine/src/launch.ts)
- [docs/specs/creator-platform-plan.md](../../../docs/specs/creator-platform-plan.md)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Confirm full-hosted is explicitly selected; the desktop-creator route skips S08 entirely. Write a personal single-owner/private-network hosting spec and threat-model ADR.
2. Define the gateway as the remote identity/session boundary with a private engine credential never exposed to browser code; keep engine binding and desktop Host/Origin/token checks intact.
3. Inventory assets, provider secrets, project/task metadata, range requests, uploads/downloads, websocket events and native workers; map owner authorization and abuse limits to every entry point.
4. Define scoped workspace handles in place of browser-supplied server paths, revocable sessions, origin/CSRF protections, private TLS transport and bounded upload/job/storage quotas.
5. Choose the private-network deployment and recovery model using existing engine/web UI; explicitly exclude public multi-user service, tenant collaboration and unrestricted URL ingestion from this release.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Threat model has a route/action authorization matrix and negative tests for unauthenticated access, CSRF/origin, session revocation and engine bypass.
- No design requires binding the current loopback engine publicly, wildcard CORS or placing its bearer token in browser-visible configuration.
- Media range/export/task operations are scoped to the authenticated workspace even with only one owner; guessed handles cannot authorize access.
- Network/credential/security choices and any CI/dependency change follow the repository's explicit review/authorization rules before implementation.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- If requirements become public or multi-user, stop S08 and create a separate spec/estimate; this personal-host plan cannot certify tenant isolation.
- If private identity/TLS prerequisites are unavailable, leave hosting blocked while preserving the completed desktop route.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Personal-host threat model, architecture decision, route matrix and explicit deployment scope.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S08.02](s08-02-portable-assets.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.
