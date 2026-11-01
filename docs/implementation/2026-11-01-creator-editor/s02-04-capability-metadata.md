---
type: Spec
title: "S02.04: Make template capability reporting truthful"
description: "Plan and evidence gates: Make template capability reporting truthful."
tags: [implementation, creator-workflows, profiles]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S02.04
stage_id: S02
effort_days: [0.5, 0.75]
prerequisites: [S02.03, S00.02]
execution_state: not_started
---

# S02.04: Make template capability reporting truthful

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S02.03, S00.02**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [packages/core/src/templates.ts](../../../packages/core/src/templates.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/template-commands.ts](../../../packages/core/src/template-commands.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/server/src/interfaces.ts](../../../packages/server/src/interfaces.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/protocol/src/index.ts](../../../packages/protocol/src/index.ts) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Replace stale blanket unavailable claims with a validated capability description that distinguishes implemented command, usable runtime, supported template step and required assets.
2. Connect live runtime facts through existing server/protocol seams; avoid importing Node/core runtime code into the browser.
3. For every recipe step, produce applied/proposed/skipped/unavailable outcomes with reasons and required inputs; reserve applied until the commit succeeds.
4. Reconcile caption-related recipes carefully: existing transcription/caption commands do not automatically implement every deferred template effect.
5. Refresh gallery metadata on relevant runtime/asset changes and include revision/version inputs so stale capability previews cannot silently apply.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Capability matrix: captions with/without transcript and speech runtime, optional Blender absent, missing music/logo and unsupported layer step all report distinct truthful states.
- Contract tests: core command listings, server summaries and browser-consumable protocol agree; unknown capability IDs fail validation.
- No overclaim: a partially applied recipe never reports fully complete and unavailable optional features do not prevent supported manual editing.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

Unavailable runtime discovery must fail closed to an explanatory unknown/unavailable state, not falsely advertise support. Preserve manual operations independent of the missing capability.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Capability contract, per-step outcome examples, core/server/protocol tests and corrected template inventory.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s02-05-atomic-profile-application.md). Planning-file creation itself does not satisfy this gate.

