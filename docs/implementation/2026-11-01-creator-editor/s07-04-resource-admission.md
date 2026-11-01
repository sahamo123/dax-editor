---
type: Spec
title: "S07.04: Admit all expensive work under one resource budget"
description: Execute S07.04 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s07]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S07.04
stage_id: S07
effort_days: [1, 1.5]
prerequisites: [S07.03]
execution_state: not_started
---

# S07.04: Admit all expensive work under one resource budget

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-1.5 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S07.03](s07-03-workflow-coordinator.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [packages/server/src/media-pipeline.ts](../../../packages/server/src/media-pipeline.ts)
- [packages/server/src/ffmpeg-run.ts](../../../packages/server/src/ffmpeg-run.ts)
- [packages/server/src/engine.ts](../../../packages/server/src/engine.ts)
- [packages/engine/src/local-model.ts](../../../packages/engine/src/local-model.ts)
- [packages/server/src/jobs.ts](../../../packages/server/src/jobs.ts)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Introduce the proposed shared admission seam for inference, render, speech, analysis, Blender, proxy, waveform, filmstrip and thumbnail jobs; inventory every bypass before enabling it.
2. Start with at most one inference request and one heavy media job, plus measured bounded preview work. Existing per-pipeline limiters are inputs to, not proof of, a whole-app RAM ceiling.
3. Use declared job/resource estimates and measured peak telemetry to queue work; expose resource-wait separately from execution and prefer responsive playback/preview.
4. Pause or defer background work only at safe boundaries and unload idle local models where supported; avoid killing an active writer as a scheduling shortcut.
5. Release reservations only after owned children and cleanup finish, including failures/cancellation; instrument whole-app plus child CPU/RAM/disk/cache peaks.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Concurrent proxy/analysis/speech/render requests respect admissions and remain cancellable without deadlock or leaked reservations.
- Low-resource and disk-limit tests produce queued/blocked states, preserve manual edit responsiveness and never silently exceed declared limits.
- Cancellation/timeout/shutdown release resources after child close; repeated jobs reach a stable resource baseline.
- Measure command acknowledgement, cached proxy scrub and whole-app peaks on declared hardware against M0 budgets; simulations alone do not establish a supported minimum.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- If a worker bypasses admission, keep concurrent workflows disabled until it is integrated or explicitly excluded.
- Do not relax the memory/latency budget silently after measurement; record a scope/hardware decision and rerun acceptance.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Job-class inventory, admission regressions and measured whole-app resource/latency report.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S07.05](s07-05-specialist-adapters.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

