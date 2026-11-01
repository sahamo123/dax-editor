---
type: Spec
title: "S08.05: Package a pinned private single-owner deployment"
description: Execute S08.05 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s08]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S08.05
stage_id: S08
effort_days: [1, 1.5]
prerequisites: [S08.04]
execution_state: not_started
---

# S08.05: Package a pinned private single-owner deployment

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-1.5 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S08.04](s08-04-host-media-boundaries.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [packages/engine/src/cli.ts](../../../packages/engine/src/cli.ts)
- [packages/engine/src/launch.ts](../../../packages/engine/src/launch.ts)
- [apps/desktop/package.json](../../../apps/desktop/package.json)
- [apps/desktop/scripts/prepare-sidecars.mjs](../../../apps/desktop/scripts/prepare-sidecars.mjs)
- [docs/adr/0009-autonomous-open-source-intake.md](../../../docs/adr/0009-autonomous-open-source-intake.md)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Add proposed deploy configuration/runbooks with pinned image/runtime dependencies, a persistent workspace volume and a private engine interface.
2. Reuse the editor web build and engine launcher; declare host OS/architecture, codec/runtime availability and startup health checks without claiming end-to-end acceptance from health alone.
3. Keep secrets outside images/projects/logs and document owner provisioning, rotation and backup exclusions; default to least privileges and resource limits from S08.04.
4. Document local/offline model handling and optional features; no paid service is mandatory and no model should download implicitly at application startup.
5. Keep Blender optional and user-supplied unless separate distribution intake permits the exact packaging. A character asset licence does not authorize silently bundling a GPL executable.
6. Rehearse build/install/start/stop on a clean private test host with reproducible pins; changes to CI/security settings require the stated review and authorization.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- A fresh private host boots the shared UI/engine with only declared persistent data and no exposed engine port.
- Image/package scan and runtime logs contain no credentials; dependency/binary provenance and licence notices match pins.
- Resource limits, nonprivileged worker identity and volume permissions are enforced on the actual host.
- Stopping/restarting preserves project/journal state and leaves native workers closed; health success is labeled service health only.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- If a required runtime cannot be packaged within intake rules, keep it optional/unavailable rather than changing licensing policy.
- Do not relax host isolation or publish ports to make the clean-host rehearsal pass.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Pinned deployment manifest, clean-host rehearsal receipt and private operations runbook.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S08.06](s08-06-host-reconnect.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.
