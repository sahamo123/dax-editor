---
type: Spec
title: "S02.01: Specify profiles and project compatibility"
description: "Plan and evidence gates: Specify profiles and project compatibility."
tags: [implementation, creator-workflows, profiles]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S02.01
stage_id: S02
effort_days: [0.5, 0.75]
prerequisites: [S01.07, S00.06]
execution_state: not_started
---

# S02.01: Specify profiles and project compatibility

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S01.07, S00.06**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [packages/core/src/schema.ts](../../../packages/core/src/schema.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/session.ts](../../../packages/core/src/session.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/templates.ts](../../../packages/core/src/templates.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/protocol/src/index.ts](../../../packages/protocol/src/index.ts) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Write the profile/override spec and migration ADR before changing persisted data; retain `.dax.json` as the project source of truth.
2. Define versioned profile/style references, explicit item→project→pinned-default precedence, reset behavior and proposed-change preview for existing projects.
3. Specify v1 reader and v2 writer behavior, supported version rejection, backup strategy and migration of every history branch/checkpoint state.
4. Document project/history pair consistency: separate atomic renames do not make a two-file transaction. Define crash recovery and identity/equality checks across migrated states.
5. Bound portable-asset groundwork without inventing remote hosting: machine paths/credentials cannot become portable payload fields; any intermediate representation and later S08 transition must be explicit.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Schema contract: fields, units, precedence, absence/default behavior and old/new/future-version outcomes have concrete examples.
- Safety: existing manual styles/format are preserved unless the reviewed change set explicitly replaces them; profile target length never silently trims.
- Decision: ADR covers pair-write recovery and compatibility rollback before the first v2 save; source/protocol consumers are inventoried.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

An unresolved persistence or backward-compatibility decision blocks schema implementation. Do not add fields to v1 and rely on Zod stripping unknown data or older builds ignoring new composition fields.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Profile spec, migration ADR, compatibility matrix and enumerated reader/writer/history entry points.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s02-02-project-history-migration.md). Planning-file creation itself does not satisfy this gate.
