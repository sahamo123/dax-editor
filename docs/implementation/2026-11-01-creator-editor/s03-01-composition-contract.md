---
type: Spec
title: "S03.01: Decide the bounded composition and time-map contract"
description: "Plan and evidence gates: Decide the bounded composition and time-map contract."
tags: [implementation, creator-workflows, composition]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S03.01
stage_id: S03
effort_days: [1, 1.5]
prerequisites: [S02.08, S02.02]
execution_state: not_started
---

# S03.01: Decide the bounded composition and time-map contract

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S02.08, S02.02**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [packages/core/src/schema.ts](../../../packages/core/src/schema.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/timeline.ts](../../../packages/core/src/timeline.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/render.ts](../../../packages/core/src/render.ts) — existing baseline; inspect applicable package rules before editing.
- [docs/specs/effects-layers.md](../../../docs/specs/effects-layers.md) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Write the composition spec/ADR with examples before schema/render edits; keep the existing gapless main `v1` track and introduce bounded free-positioned upper video/still layers.
2. Define stable layer/item IDs, order, source/timeline ranges, visibility/mute, transform/crop/opacity, alpha convention and explicit ripple-versus-fixed anchoring.
3. Centralize source↔timeline mapping and project frame-grid rules, including 30000/1001 and 60000/1001 rates; define transitions' overlap/handles and audio behavior without adding speed ramps.
4. Specify finite supported transforms/keyframe interpolation and a small named transition set with exact parameter bounds; arbitrary filters, masks and graph plugins are excluded.
5. Define compatibility of existing images/text/captions/zooms/audio with ordered layers, legacy visual preservation, migration and authoritative rendered-review behavior.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Contract examples: layer overlap, fixed/ripple delete, trim/reorder, short transition handles and still duration have unambiguous expected timelines.
- Compatibility: pre-layer projects preserve their existing render order and timing; the version policy refuses unsupported future composition rather than dropping it.
- Scope: manual supplied matte is defined as original+text+foreground; automatic segmentation, arbitrary speed control and unrestricted compositing remain outside the milestone.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

Ambiguous anchoring, overlap or alpha ownership blocks implementation. Resolve the specific architectural choice in the ADR and acceptance fixtures before creating parallel renderer logic.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Composition ADR/spec, supported-feature bounds, source/timeline examples and compatibility/preview coverage contract.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s03-02-layer-schema-persistence.md). Planning-file creation itself does not satisfy this gate.
