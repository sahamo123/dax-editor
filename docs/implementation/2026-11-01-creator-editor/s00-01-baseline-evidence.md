---
type: Spec
title: "S00.01: Verify the continuation and preserve the workspace"
description: "Plan and evidence gates: Verify the continuation and preserve the workspace."
tags: [implementation, creator-workflows, baseline]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S00.01
stage_id: S00
effort_days: [0.25, 0.5]
prerequisites: []
execution_state: not_started
---

# S00.01: Verify the continuation and preserve the workspace

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Confirm explicit implementation authorization, then inspect the clean or safely preserved continuation baseline; no prior implementation receipt exists for this first step.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [AGENTS.md](../../../AGENTS.md) — existing baseline; inspect applicable package rules before editing.
- [docs/engineering/handoff.md](../../../docs/engineering/handoff.md) — existing baseline; inspect applicable package rules before editing.
- [docs/engineering/laptop-continuation.md](../../../docs/engineering/laptop-continuation.md) — existing baseline; inspect applicable package rules before editing.
- [docs/STATUS.md](../../../docs/STATUS.md) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Confirm that the current request authorizes implementation; this handbook's presence alone authorizes no application work. Record the selected execution route, target machines and provisional optional capability/client/provider choices now, before their acceptance stages including S07.07; S09.01 later revalidates/freezes this declaration and cannot invent scope after earlier steps closed.
2. Inspect `git status --short`, branch, HEAD and latest continuation documents. The planning baseline is `codex/creator-platform-plan` at `f05a57b99a2d184900ddd809a7480b30052ae5c1`; reconcile later commits instead of resetting to it.
3. Inventory private `.dax-data/`, ignored artifacts, media, model caches and local changes without copying credentials or personal data into Git. Record backup/recovery locations and verify a non-destructive read of a representative saved copy.
4. Start a dated evidence ledger separating source facts, historical runs, fresh runs, configured services and externally blocked acceptance. Link existing issues and create only the selected implementation issue when authorized.
5. Record toolchain versions and applicable package rules. Preserve the current branch until a clean, scoped issue branch can be created safely; do not merge the stacked PRs or write to main.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Baseline: repository/branch/SHA and dirty/ignored-file handling are explicit; an independent reader can identify the exact tree without chat history.
- Preservation: representative private project and associated history remain readable; no reset/clean, policy change, application startup or media mutation was needed for orientation.
- Authorization: execution route, target machine and allowed work are recorded; missing implementation authorization prevents this step from entering execution.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

If branch lineage, authorization or private-file ownership is ambiguous, stop before checkout or writes; preserve the current state and request the missing evidence. Never treat an older main checkout as the continuation.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Baseline SHA, preservation inventory, tool versions, route/target declaration and links to historical evidence with their original dates.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s00-02-source-capability-reconciliation.md). Planning-file creation itself does not satisfy this gate.
