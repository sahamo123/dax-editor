---
type: Spec
title: "S00.04: Establish measurable timing and resource budgets"
description: "Plan and evidence gates: Establish measurable timing and resource budgets."
tags: [implementation, creator-workflows, baseline]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S00.04
stage_id: S00
effort_days: [0.5, 1]
prerequisites: [S00.03]
execution_state: not_started
---

# S00.04: Establish measurable timing and resource budgets

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S00.03**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [packages/server/src/media-pipeline.ts](../../../packages/server/src/media-pipeline.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/server/src/jobs.ts](../../../packages/server/src/jobs.ts) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/editor/playback/engine.ts](../../../apps/desktop/src/editor/playback/engine.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/session.ts](../../../packages/core/src/session.ts) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Declare machine, OS, CPU/RAM, storage, display scale, renderer and model versions; 16 GB baseline/32 GB preferred are planning targets until measured.
2. Specify repeatable command-acknowledgement and cached-720p scrub scenarios, sampling count, warm-up, p95 calculation and which UI-to-engine interval each measures.
3. Adopt provisional targets of p95 acknowledgement under 250 ms and cached scrub under 200 ms; record baseline misses and proposed remedies instead of silently raising thresholds.
4. Define whole-app plus child-process peak RAM, CPU/GPU, cache/disk bytes, render real-time factor and cold/warm AI latency collection; distinguish UI, model and media workloads.
5. Define the two-hour growth/leak scenario and A/V drift bound of one project frame plus documented codec priming. Set resource and duration stop conditions to protect the machine; schedule full long-form acceptance in S04.07.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Measurement: recorded short baseline samples include raw timestamps, sample count, environment and percentile method; a displayed average cannot stand in for p95.
- Resources: process-tree accounting includes inference, FFmpeg and optional Blender; existing per-pipeline concurrency is not mislabeled a whole-app bound.
- Budgets: every proposed threshold is labeled proposed or measured, with unresolved baseline misses tracked; no two-hour success is inferred from a short sample.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

If instrumentation cannot observe child processes or native policy prevents the selected target, record the missing dimension and block that measurement. Use an authorized target without weakening policy; preserve raw observations.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Budget table, measurement procedure, short baseline samples, machine declaration and explicit future long-session acceptance requirements.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s00-05-baseline-acceptance.md). Planning-file creation itself does not satisfy this gate.
