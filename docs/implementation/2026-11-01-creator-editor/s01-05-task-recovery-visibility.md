---
type: Spec
title: "S01.05: Preserve task and recovery controls in the new layout"
description: "Plan and evidence gates: Preserve task and recovery controls in the new layout."
tags: [implementation, creator-workflows, workspace]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S01.05
stage_id: S01
effort_days: [0.5, 1]
prerequisites: [S01.04]
execution_state: not_started
---

# S01.05: Preserve task and recovery controls in the new layout

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S01.04**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [apps/desktop/src/app/chat/TaskQueue.tsx](../../../apps/desktop/src/app/chat/TaskQueue.tsx) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/app/chat/ChatPanel.tsx](../../../apps/desktop/src/app/chat/ChatPanel.tsx) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/app/store-jobs.test.ts](../../../apps/desktop/src/app/store-jobs.test.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/server/src/tasks.ts](../../../packages/server/src/tasks.ts) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Place active work, queued count and actionable failures in the agreed accessible locations without creating a second task store.
2. Keep non-cancelling steering and Stop as separate controls with truthful labels and task attribution; collapsing the assistant must not hide cancellation.
3. Retain save-error, missing-media, disconnected-engine and failed-export recovery entry points; show outcomes rather than only percentage progress.
4. Preserve terminal task/job ordering protections so a late running snapshot cannot resurrect a completed job or leave review stuck at 100%.
5. Add regression cases for queue transitions, restart interruption, stale events and narrow layout; do not introduce parent/child workflows before S07.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- State: running→done/failed/canceled and reconnect/restart display correctly without duplicate jobs or stale 100% state.
- Steering: adding guidance does not cancel the active run; Stop targets the intended task and queued work remains visible.
- Recovery: keyboard users can find a failed task, inspect its cause and perform the existing safe retry/relink action in both layout modes.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

A task state mismatch is a functional regression, not cosmetic polish. Preserve logs and block the step until the authoritative store/event path is corrected; never conceal a stuck job by hiding it.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Task-state regression results, narrow/wide captures and queue/steer/Stop/recovery interaction evidence.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s01-06-accessibility.md). Planning-file creation itself does not satisfy this gate.
