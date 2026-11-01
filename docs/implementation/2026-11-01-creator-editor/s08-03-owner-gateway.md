---
type: Spec
title: "S08.03: Implement single-owner authenticated gateway sessions"
description: Execute S08.03 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s08]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S08.03
stage_id: S08
effort_days: [1, 2]
prerequisites: [S08.02]
execution_state: not_started
---

# S08.03: Implement single-owner authenticated gateway sessions

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-2 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S08.02](s08-02-portable-assets.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [packages/server/src/security.ts](../../../packages/server/src/security.ts)
- [packages/server/src/server.ts](../../../packages/server/src/server.ts)
- [packages/server/src/routes.ts](../../../packages/server/src/routes.ts)
- [packages/server/src/hub.ts](../../../packages/server/src/hub.ts)
- [packages/protocol/src/index.ts](../../../packages/protocol/src/index.ts)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Implement proposed apps/host gateway/bootstrap around the shared editor web build and existing engine; avoid a second editor state owner.
2. Authenticate one owner using the approved threat-model mechanism, with revocable sessions and secure transport/session handling; keep engine credentials server-side.
3. Authorize each proxied API and websocket action before forwarding; scope project/task/media/export handles to the authenticated workspace.
4. Apply explicit remote Host/Origin/CSRF policy and request limits while preserving desktop trust policies as a separate tested mode.
5. Redact secrets/query strings from errors, logs and client configuration; rotate/revoke gateway sessions without leaking or unnecessarily changing the private engine token.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Unauthenticated, expired/revoked, wrong-origin and cross-site mutation requests fail before engine dispatch.
- Websocket upgrades and reconnects enforce the same owner/workspace authorization as HTTP; a forged session cannot subscribe to state.
- Browser bundles/network responses reveal neither engine bearer token nor provider keys/server paths.
- Desktop loopback tests remain green; the gateway does not require wildcard CORS, public engine binding or disabled origin checks.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- If auth fails closed and blocks legitimate access, retain private isolation and fix configuration; never disable the gate to continue testing.
- Do not deploy a public endpoint as a workaround for private-network setup problems.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Gateway/session tests, redaction inspection and desktop-versus-host trust policy results.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S08.04](s08-04-host-media-boundaries.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

