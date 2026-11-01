---
type: Spec
title: "S09.06: Verify native accessibility and whole-app endurance"
description: Execute S09.06 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s09]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S09.06
stage_id: S09
effort_days: [1, 1.5]
prerequisites: [S09.05]
execution_state: not_started
---

# S09.06: Verify native accessibility and whole-app endurance

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-1.5 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S09.05](s09-05-release-upgrade.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [apps/desktop/src/app/layout/Shell.tsx](../../../apps/desktop/src/app/layout/Shell.tsx)
- [apps/desktop/src/app/styles/workspace.css](../../../apps/desktop/src/app/styles/workspace.css)
- [apps/desktop/src/editor/lib/media-cache.ts](../../../apps/desktop/src/editor/lib/media-cache.ts)
- [packages/server/src/media-pipeline.ts](../../../packages/server/src/media-pipeline.ts)
- [docs/specs/creator-platform-plan.md](../../../docs/specs/creator-platform-plan.md)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Run keyboard/focus/accessibility and actual Windows display-scaling checks at the supported window/DPI combinations from M1; record hardware/screen settings.
2. Execute a two-hour editing/endurance scenario with the selected 30/60/120-minute media, layers, transcript and background jobs, using whole-app plus child-process measurements.
3. Measure p95 command acknowledgement, cached proxy scrub latency, cold/warm AI timing, render factor, peak RAM/CPU/GPU, cache/disk bytes and process counts against M0 budgets.
4. Verify long timeline/transcript virtualization, bounded decode/background queues and history/cache growth under repeated seek/edit/undo/export.
5. Exercise resource wait, cancellation, model unload and shutdown at the end; record any declared hardware requirement change as a reviewed decision.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Native layout at actual DPI keeps chat/preview/inspector usable, focus visible and core controls reachable without clipping.
- Two-hour memory/cache/process trends remain within declared bounds rather than merely ending below an arbitrary peak.
- p95 acknowledgement under 250 ms and cached 720p scrub under 200 ms are evaluated on the declared machine unless M0 documented a reviewed replacement budget.
- No extra A/V drift exceeds one project frame plus documented codec priming; final exports fully decode after the endurance session.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- Do not substitute viewport emulation for actual DPI evidence or a short synthetic clip for required long/human-recorded media.
- On resource/latency failure, identify the offending worker/cache and fix or explicitly revise supported scope; do not silently relabel the budget as advisory.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Native DPI/accessibility walkthrough and measured endurance/resource/latency report.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S09.07](s09-07-release-provenance.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.
