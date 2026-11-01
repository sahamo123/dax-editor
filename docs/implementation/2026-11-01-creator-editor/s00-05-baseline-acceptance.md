---
type: Spec
title: "S00.05: Repeat the scoped source and offline editing baseline"
description: "Plan and evidence gates: Repeat the scoped source and offline editing baseline."
tags: [implementation, creator-workflows, baseline]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S00.05
stage_id: S00
effort_days: [0.5, 1]
prerequisites: [S00.04]
execution_state: not_started
---

# S00.05: Repeat the scoped source and offline editing baseline

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S00.04**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [package.json](../../../package.json) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/package.json](../../../apps/desktop/package.json) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/e2e/real-engine.spec.ts](../../../apps/desktop/e2e/real-engine.spec.ts) — existing baseline; inspect applicable package rules before editing.
- [docs/engineering/laptop-continuation.md](../../../docs/engineering/laptop-continuation.md) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Run the current repository's `pnpm check` on the preserved baseline and retain complete logs, exit code and skip reasons; diagnose environment failures without disabling assertions.
2. Run `pnpm --filter @dax/desktop test:e2e` using the documented engine setup; record browser and media-codec limitations separately from native playback.
3. Use a separate authorized fixture project for fresh empty/import/edit/error/review/export walkthroughs. Confirm manual edit, undo/redo, save/reopen and offline export without invoking a paid provider.
4. Fully decode exported audio/video and check duration/frame-size/audio presence against the fixture expectation; a successful command or existing file is insufficient.
5. Record current native evidence by exact source, installer hash, machine and scenario. A system-FFmpeg development run is not packaged-renderer or owner-machine acceptance.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Source/browser: full check and selected browser suite finish successfully; enumerate every skip and any environment-specific unavailable test.
- Manual offline: one grouped edit has one undo, the original survives reopening, review corresponds to the captured revision and a real export decodes completely.
- Evidence scope: fresh screenshot/receipt dates and hashes are recorded; old native results remain historical and owner-native policy blockage remains explicit.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

Any required baseline source/browser/manual case failure blocks this step until repaired and rerun. If the designated native target is unavailable, do not substitute a browser PASS; retain it as the explicitly external native gate defined by S00 scope.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Full check/browser logs, fresh walkthrough evidence, private sample project/export hashes, decode observations and native evidence boundary.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s00-06-baseline-close.md). Planning-file creation itself does not satisfy this gate.
