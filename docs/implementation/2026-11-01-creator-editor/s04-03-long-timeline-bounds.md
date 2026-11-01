---
type: Spec
title: "S04.03: Bound long-project views and derived-media work"
description: "Plan and evidence gates: Bound long-project views and derived-media work."
tags: [implementation, creator-workflows, long-form]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S04.03
stage_id: S04
effort_days: [1, 2]
prerequisites: [S04.02, S00.04]
execution_state: not_started
---

# S04.03: Bound long-project views and derived-media work

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S04.02, S00.04**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [packages/server/src/media-pipeline.ts](../../../packages/server/src/media-pipeline.ts) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/editor/lib/media-cache.ts](../../../apps/desktop/src/editor/lib/media-cache.ts) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/editor/timeline/Filmstrip.tsx](../../../apps/desktop/src/editor/timeline/Filmstrip.tsx) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/editor/timeline/Waveform.tsx](../../../apps/desktop/src/editor/timeline/Waveform.tsx) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Measure the current long-timeline DOM, transcript rendering, cache and decode behavior first; SpeechPanel already pages 40 words and filmstrip work is already capped.
2. Add windowing/tiling only where measured pressure warrants it, preserving selection, keyboard navigation and playhead continuity across unloaded regions.
3. Bound derived-media requests, in-flight decode and cache bytes with explicit eviction/reuse behavior; prioritize visible scrub/playback rather than starting all thumbnails at once.
4. Avoid broadcasting/rendering entire large transcript/project structures unnecessarily; preserve authoritative state and existing protocol compatibility.
5. Instrument cold/warm seek, repeated scroll and long edit histories on the declared machine; retain fixture checksums and compare to S00 budgets.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Bounds: DOM/request/cache/process observations remain within documented limits as duration grows from 30 to 120 minutes; no unexplained linear live-memory growth.
- Interaction: scroll/zoom/seek across tile boundaries preserves correct waveform/frame mapping, keyboard selection and playhead.
- Regression: missing thumbnails/waveforms degrade gracefully, canceled/replaced media work cannot populate the wrong project and existing short projects stay responsive.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

If an optimization breaks time mapping or keyboard reachability, revert that optimization independently and retain measurements. Do not claim bounded whole-app RAM from bounded browser DOM alone.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Before/after long-project measurements, cache/request limits, tile-boundary interaction tests and process-tree observations.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s04-04-slides-educational-layouts.md). Planning-file creation itself does not satisfy this gate.
