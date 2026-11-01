---
type: Spec
title: "S04.02: Add chapters, markers and transcript navigation"
description: "Plan and evidence gates: Add chapters, markers and transcript navigation."
tags: [implementation, creator-workflows, long-form]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S04.02
stage_id: S04
effort_days: [1, 1.5]
prerequisites: [S04.01, S03.03]
execution_state: not_started
---

# S04.02: Add chapters, markers and transcript navigation

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S04.01, S03.03**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [packages/core/src/schema.ts](../../../packages/core/src/schema.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/commands.ts](../../../packages/core/src/commands.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/captions.ts](../../../packages/core/src/captions.ts) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/app/layout/SpeechPanel.tsx](../../../apps/desktop/src/app/layout/SpeechPanel.tsx) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Extend the versioned model with bounded chapter/marker IDs, labels, ranges/anchors and explicit source/timeline semantics through the accepted migration path.
2. Add pure registry operations for creation, update, removal and navigation summaries; project changes remain undoable and Planning remains read-only.
3. Map transcript words to retained timeline occurrences after cuts/reorders; handle repeated source usage and deleted words without jumping to the wrong occurrence.
4. Integrate searchable navigation and keyboard seeking while preserving existing source-word correction identity and caption timing.
5. Define export/persistence of chapter data explicitly; do not imply a container or upload destination supports chapter metadata until verified.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Mapping: cut/deleted/reused source ranges resolve deterministically to the correct timeline occurrence or an explanatory unavailable state.
- Editing: chapters/markers follow declared anchoring through trim/ripple/undo and survive save/reopen/history migration.
- UI: keyboard search/seek works without modifying project data; word correction still preserves source timing and captions update correctly.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

Ambiguous repeated-source navigation must prompt/select the declared occurrence rather than guess. A migration or anchor regression blocks the step and preserves original chapter/transcript data.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Chapter/marker contract, source↔timeline mapping cases, persistence/undo results and keyboard navigation evidence.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before the next step (`s04-03-long-timeline-bounds.md`; later publication batch). Planning-file creation itself does not satisfy this gate.

