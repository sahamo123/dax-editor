---
type: Spec
title: "S01.07: Verify browser and native workspace acceptance"
description: "Plan and evidence gates: Verify browser and native workspace acceptance."
tags: [implementation, creator-workflows, workspace]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S01.07
stage_id: S01
effort_days: [0.5, 0.75]
prerequisites: [S01.06]
execution_state: not_started
---

# S01.07: Verify browser and native workspace acceptance

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S01.06**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [apps/desktop/e2e/functional-release.spec.ts](../../../apps/desktop/e2e/functional-release.spec.ts) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/e2e/chat.spec.ts](../../../apps/desktop/e2e/chat.spec.ts) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/package.json](../../../apps/desktop/package.json) — existing baseline; inspect applicable package rules before editing.
- [docs/engineering/laptop-continuation.md](../../../docs/engineering/laptop-continuation.md) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Recheck all S01 receipts against the final UI tree and run the desktop component/browser suites plus repository full check.
2. Repeat before/after empty/import/edit/error/review/export evidence at the three specified browser viewports; preserve command, undo, queue and Planning behavior.
3. On a policy-authorized Windows native target, test actual 100/125/150/200% display scaling with dialogs, keyboard, playback, inspector, progress and export.
4. Record native machine, display settings, binary/source hashes and observations; an authorized alternate target can satisfy that defined scope, while owner-laptop execution remains separate.
5. Close the design findings with evidence, record residual nonblocking limitations and complete the scribe/handoff. Required native DPI checks cannot be silently deferred to advance.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Browser/source: `pnpm check` and `pnpm --filter @dax/desktop test:e2e` pass with explicit skips; before/after workflow evidence matches final commit.
- Native: all four actual Windows scale settings keep required actions visible/reachable and playback/export usable; browser zoom/device-scale emulation is insufficient.
- Regression: selecting/resizing/editing does not reset history or conceal tasks; manual offline workflow remains complete.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

Missing policy-authorized native DPI evidence or a required browser/native failure marks S01.07 BLOCKED and prevents this route advancing. Preserve the browser-complete work and request the specific missing target/evidence without changing security policy.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Final browser/native matrices, source/binary hashes, real display-scale evidence, design finding closure and separate owner-laptop status.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s02-01-profile-compatibility-contract.md). Planning-file creation itself does not satisfy this gate.

