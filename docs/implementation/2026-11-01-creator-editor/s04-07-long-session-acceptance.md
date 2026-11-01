---
type: Spec
title: "S04.07: Measure long-session synchronization and resources"
description: "Plan and evidence gates: Measure long-session synchronization and resources."
tags: [implementation, creator-workflows, long-form]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S04.07
stage_id: S04
effort_days: [1, 2]
prerequisites: [S04.06, S04.03, S04.05, S00.04]
execution_state: not_started
---

# S04.07: Measure long-session synchronization and resources

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S04.06, S04.03, S04.05, S00.04**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [scripts/verify-speech-longform.mjs](../../../scripts/verify-speech-longform.mjs) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/av-sync-render.test.ts](../../../packages/core/src/av-sync-render.test.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/server/src/media-pipeline.ts](../../../packages/server/src/media-pipeline.ts) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/editor/playback/engine.ts](../../../apps/desktop/src/editor/playback/engine.ts) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Run the specified real 30/60/120-minute podcast/educational scenarios, including VFR, separate audio, chapters, slide/PiP scenes and manual camera switches.
2. Measure seeking at beginning/middle/end and around edit/switch boundaries, then compare cached scrub and command acknowledgement p95 with S00 targets.
3. Perform the defined two-hour edit session while accounting for UI/engine/model/media child RAM, CPU/GPU, cache/disk bytes and owned-process cleanup.
4. Export representative full and edited long outputs, fully decode them and measure landmark/end A/V alignment against one project frame plus documented codec priming.
5. Repeat save/restart/reopen, canceled long work, missing media and recovery; report exact runtime/model/renderer versions and distinguish human from synthetic speech evidence.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Duration coverage: all three real duration classes and the separate two-hour interaction scenario have complete dated receipts, not extrapolated short-run estimates.
- Sync/output: full decode and landmark/end measurements pass the declared bound after many cuts/switches, with codec priming documented.
- Resources: no unexplained unbounded growth, orphaned child or cache overrun; p95 and peak data include raw samples/environment and any failing budget remains open.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

A required recording, measurement or long native execution unavailable means BLOCKED. Stop owned work at the defined resource ceiling, preserve diagnostic logs and do not relax budgets or shorten fixtures simply to claim success.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: 30/60/120-minute matrix, two-hour process/resource samples, p95 calculations, full-decode/A-V measurements and restart/cancel recovery evidence.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s04-08-long-form-close.md). Planning-file creation itself does not satisfy this gate.

