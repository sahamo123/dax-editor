---
type: Spec
title: "S04.08: Close podcast and educational workflow acceptance"
description: "Plan and evidence gates: Close podcast and educational workflow acceptance."
tags: [implementation, creator-workflows, long-form]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S04.08
stage_id: S04
effort_days: [1, 2]
prerequisites: [S04.07]
execution_state: not_started
---

# S04.08: Close podcast and educational workflow acceptance

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S04.07**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [docs/specs/creator-platform-plan.md](../../../docs/specs/creator-platform-plan.md) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/e2e/functional-release.spec.ts](../../../apps/desktop/e2e/functional-release.spec.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/server/src/speech-workflow.test.ts](../../../packages/server/src/speech-workflow.test.ts) — existing baseline; inspect applicable package rules before editing.
- [docs/engineering/knowledge-protocol.md](../../../docs/engineering/knowledge-protocol.md) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Independently review all S04 receipts against the final tree, checking real long-media identities and that required source/browser/native evidence was actually executed.
2. Complete end-to-end podcast and educational projects using chapters/navigation, slides/PiP, manual sync and reviewed highlights; inspect saved project, review and decoded export.
3. Verify manual/offline behavior and Planning immutability, including empty/unavailable optional speech features; preserve clear labels for manual speaker/highlight work.
4. Repeat affected native playback/dialog/export/scaling acceptance on the declared authorized Windows target after final UI/media changes; keep owner-machine scope distinct.
5. Close required findings, publish safe summaries and complete log/STATUS/spec/index handoff; retain private media and future diarization/sync/ranking research gates.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Workflow: both real use cases finish edit→review→export→save/restart with correct chapters, labels, timing and recoverable history.
- Evidence: S04.07 resource/sync bounds and all required native/browser checks are current for the final candidate, with hashes and no unexplained skips.
- Scope: no hours-long, diarization, automatic sync or release-readiness claim extends beyond the recorded cases; next-stage inputs are explicit.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

A missing required receipt, long-session failure or native regression keeps S04 BLOCKED/NEEDS_REWORK. Fix and supersede the affected receipt before S05.01; planning completion or a shorter demo cannot unlock it.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: S04 closure matrix, podcast/educational sample hashes, current native/browser/source evidence, remaining research scope and next-stage handoff.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s05-01-reference-feasibility.md). Planning-file creation itself does not satisfy this gate.
