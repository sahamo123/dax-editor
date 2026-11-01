---
type: Spec
title: "S00.02: Reconcile source and capability claims"
description: "Plan and evidence gates: Reconcile source and capability claims."
tags: [implementation, creator-workflows, baseline]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S00.02
stage_id: S00
effort_days: [0.25, 0.5]
prerequisites: [S00.01]
execution_state: not_started
---

# S00.02: Reconcile source and capability claims

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S00.01**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [packages/core/AGENTS.md](../../../packages/core/AGENTS.md) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/templates.ts](../../../packages/core/src/templates.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/commands.ts](../../../packages/core/src/commands.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/session.ts](../../../packages/core/src/session.ts) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Compare package AGENTS maps and architecture/status statements with current implementation, recording each contradiction before editing documentation.
2. Separate implemented commands, installed runtime capability, required asset availability and template-applier coverage. Captions/transcription exist, while a recipe may still lack a caption step.
3. Inspect `ENGINE_FEATURES`, deferred template notes and `get_transcript` unavailable wording; correct factual messages with a small regression test if runtime wording changes.
4. Reconcile Session history documentation against the actual adjacent `.history.json` persistence, branch/checkpoint behavior and save-error handling; preserve the current behavioral contract.
5. Update only substantiated claims and link source/recorded acceptance. Reserve structural capability redesign and profile behavior for S02.04; split incidental refactors from factual corrections.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Traceability: each corrected claim names current source evidence; unchanged unknowns remain explicitly unverified.
- Capability: no template is relabeled fully supported merely because its low-level command exists; missing transcript/runtime/asset reasons remain distinct.
- Regression: run the relevant core test file for any message/metadata change after building dependencies; docs-only corrections require docs indexes/OKF and link review.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

If documentation and implementation disagree beyond a factual correction, record a scoped follow-up and preserve the implemented behavior. A newly discovered baseline regression must be resolved or the baseline route blocked.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Claim-to-source reconciliation table, corrected file list and targeted check results; unchanged external capability gates.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s00-03-authorized-fixtures.md). Planning-file creation itself does not satisfy this gate.

