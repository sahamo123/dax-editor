---
type: Spec
title: "S04.01: Specify long-form workflows and expand fixtures"
description: "Plan and evidence gates: Specify long-form workflows and expand fixtures."
tags: [implementation, creator-workflows, long-form]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S04.01
stage_id: S04
effort_days: [1, 1.5]
prerequisites: [S03.09, S00.03]
execution_state: not_started
---

# S04.01: Specify long-form workflows and expand fixtures

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S03.09, S00.03**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [apps/desktop/src/app/layout/SpeechPanel.tsx](../../../apps/desktop/src/app/layout/SpeechPanel.tsx) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/cuts.ts](../../../packages/core/src/cuts.ts) — existing baseline; inspect applicable package rules before editing.
- [scripts/verify-speech-longform.mjs](../../../scripts/verify-speech-longform.mjs) — existing baseline; inspect applicable package rules before editing.
- [docs/specs/creator-platform-plan.md](../../../docs/specs/creator-platform-plan.md) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Write the long-form spec around existing transcription, correction, reviewed cuts and layered composition; do not describe those established features as missing.
2. Define chapters/markers, source-timed transcript navigation, manual camera offsets/switching, slide scenes and reviewed highlight operations with persistence/undo behavior.
3. Expand the authorized corpus to real 30/60/120-minute podcast/educational recordings, including separate audio, VFR, meaningful pauses and difficult speech; record rights/digests privately.
4. Define expected synchronization landmarks, seeking/edit scenarios and acceptable output/UX measurements before implementation.
5. Keep automated tests generated/offline and separate from private long-media acceptance. Automatic diarization, sync and semantic ranking remain unqualified optional research.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Corpus: each required duration class has a permitted real recording, known stream metadata and landmark/expected-output manifest.
- Specification: source versus timeline time and manual versus automatic behavior are explicit; no ambiguous speaker or camera ownership.
- Acceptance: named long-session, output and resource cases map to S00 budgets and the final S04.07 procedure.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

Missing authorized long recordings blocks corpus acceptance; short synthetic speech cannot satisfy it. Preserve independent spec work and request the specific rights/media input rather than fabricating human-media results.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Long-form spec, private 30/60/120-minute corpus manifest, source/timing landmarks and manual/optional capability scope.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s04-02-chapters-markers-navigation.md). Planning-file creation itself does not satisfy this gate.
