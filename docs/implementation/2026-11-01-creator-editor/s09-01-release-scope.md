---
type: Spec
title: "S09.01: Freeze selected release scope and evidence requirements"
description: Execute S09.01 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s09]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S09.01
stage_id: S09
effort_days: [0.5, 1]
prerequisites: [S07.07]
route_prerequisites:
  full-hosted: [S08.08]
execution_state: not_started
---

# S09.01: Freeze selected release scope and evidence requirements

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **0.5-1 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S07.07](s07-07-workflow-close.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [docs/STATUS.md](../../../docs/STATUS.md)
- [docs/engineering/laptop-continuation.md](../../../docs/engineering/laptop-continuation.md)
- [docs/specs/creator-platform-plan.md](../../../docs/specs/creator-platform-plan.md)
- [.github/workflows/functional-windows-build.yml](../../../.github/workflows/functional-windows-build.yml)
- [.github/workflows/native-windows-acceptance.yml](../../../.github/workflows/native-windows-acceptance.yml)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Select the release route and freeze its capability/target matrix before testing: desktop-creator requires S00-S07; full-hosted also requires S08.08; first-improvement stops as a development candidate and cannot claim final release.
2. Validate all selected-stage receipts and current source ancestry. Acquire/build the source-matched packaged candidate now, with archive/application/sidecar hashes and a packaging receipt before S09.03 uses it; S09.03 and S09.04 must reuse that identical verified candidate. Inspect fixed historical CI inputs and obtain any required reviewed CI authorization before changing them.
3. Require core manual/offline editing, packaged-native install/playback/export and data preservation. Freeze and revalidate the provisional capability/client/target selection from execution launch/S00.01; optional Blender, hosting, hosted providers and external clients must remain explicitly selected or not selected.
4. For each selected provider/client require actual live authorized evidence; configuration, diagnostics, SDK transport and mock tests are separate levels. Missing required credentials or native authorization block release rather than silently narrowing scope.
5. Build a release matrix mapping each requirement to source/browser/native/offline/provider/client/host evidence and stale-evidence rules; inspect candidate-selection workflows before relying on them.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Desktop-creator entry validates S07.07 without requiring S08; full-hosted also validates S08.08 and its actual private deployment artifacts.
- Every selected capability has a mandatory named verification row and target; excluded optional integrations are labeled not selected/not live-verified, never PASS.
- Historical runner-native evidence is mapped to its original SHA/binary; no owner-laptop or cross-version claim is inherited.
- Scope/evidence review identifies fixed historical candidate inputs and requires source-matched packaging before S09.04.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- If scope or source changes, invalidate affected evidence and reapprove the matrix in the issue/spec before continuing.
- Do not remove a selected criterion merely to evade a failed test or missing credential; record a deliberate reviewed scope change separately.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Frozen route/capability/evidence matrix and exact candidate source declaration.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to S09.02 (`s09-02-release-source-media.md`; later publication batch) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

