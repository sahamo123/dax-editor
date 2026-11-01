---
type: Spec
title: "S02.08: Close the first-improvement development candidate"
description: "Plan and evidence gates: Close the first-improvement development candidate."
tags: [implementation, creator-workflows, profiles]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S02.08
stage_id: S02
effort_days: [0.5, 0.75]
prerequisites: [S02.07, S00.03, S00.04]
execution_state: not_started
---

# S02.08: Close the first-improvement development candidate

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S02.07, S00.03, S00.04**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [docs/specs/creator-platform-plan.md](../../../docs/specs/creator-platform-plan.md) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/export.test.ts](../../../packages/core/src/export.test.ts) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/e2e/history-export.spec.ts](../../../apps/desktop/e2e/history-export.spec.ts) — existing baseline; inspect applicable package rules before editing.
- [docs/engineering/knowledge-protocol.md](../../../docs/engineering/knowledge-protocol.md) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Create one authorized sample project/export for Short, Full-length, Podcast and Educational using the implemented supported operations only.
2. For each sample, inspect profile defaults, explicit overrides, skipped steps, one undo and save/reopen; fully decode the export and compare expected streams/timing.
3. Recheck final source/browser and required S01 native UI evidence against the candidate tree, rerunning affected acceptance after any intervening changes.
4. Compare measured acknowledgement/scrub/resource observations with S00 budgets and record regressions; first-improvement development candidacy cannot silently waive failed required checks.
5. Publish the scoped handoff and scribe evidence: M0–M2 totals remain 10–17 engineering days, with actual effort separate. Native distribution requires the applicable S09 gates; this step is not that certification.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Four samples: each actual encoded output decodes fully, matches accepted format/timing and exposes unsupported features honestly.
- Persistence/undo: profiles and overrides survive reopen; one undo restores the pre-apply project and original source files remain untouched.
- Candidate: every required prior receipt/check is current; optional credentials or owner-laptop limitations are explicitly separated from completed development scope.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

A missing sample, decode failure or stale mandatory native UI receipt blocks candidate closure. Preserve all four private projects and fix the narrow regression; do not broaden scope into release distribution or new creator features.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Four sample hashes/observations, candidate SHA, predecessor review, budget comparison and unambiguous development-candidate/release boundary.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
For `first-improvement`, STOP and report the development candidate, evidence and remaining release gates for review. Only `desktop-creator` or `full-hosted` proceeds, after a fresh evidence recheck, to [S03.01](s03-01-composition-contract.md). Planning-file creation itself does not satisfy this gate.

