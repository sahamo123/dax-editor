---
type: Spec
title: "S01.01: Audit the current rendered editing workflow"
description: "Plan and evidence gates: Audit the current rendered editing workflow."
tags: [implementation, creator-workflows, workspace]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S01.01
stage_id: S01
effort_days: [0.5, 1]
prerequisites: [S00.06]
execution_state: not_started
---

# S01.01: Audit the current rendered editing workflow

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S00.06**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [docs/engineering/impeccable-design.md](../../../docs/engineering/impeccable-design.md) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/app/layout/Shell.tsx](../../../apps/desktop/src/app/layout/Shell.tsx) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/app/layout/Drawer.tsx](../../../apps/desktop/src/app/layout/Drawer.tsx) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/editor/preview/PreviewPane.tsx](../../../apps/desktop/src/editor/preview/PreviewPane.tsx) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Load repository product/spec context and Impeccable manual-context audit guidance; do not run its launcher, engine, hooks or live injection.
2. Capture fresh empty/import/edit/error/review/export states on the verified development tree using authorized fixture projects; historical screenshots are context only.
3. Walk the choose/import/edit/review/export journey and rank observed obstruction, focus, hierarchy and error-recovery problems by user impact.
4. Inspect compact drawer behavior, chat/preview minimum sizes, timeline visibility, selection-triggered inspector changes and saved resizers at 1366x768, 1440x900 and 1920x1080.
5. Record incumbent dark/Inter tokens and existing keyboard/task behaviors worth preserving; propose one coherent workspace direction with links to concrete findings.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Evidence: each prioritized finding links a current screenshot, viewport and reproducible interaction; source inspection is not presented as a rendered audit.
- Behavior baseline: queue, non-cancelling steer, Stop, Planning, undo and manual export are represented in the audit checklist.
- Scope: proposed design addresses the editor's task flow and does not introduce a marketing layout, second design system or required paid service.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

If the editor cannot start, fix/reconcile that baseline before claiming visual findings. Preserve any partial audit as incomplete and keep native-only observations separate from browser evidence.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Dated audit, viewport captures, ranked findings, preserved behavior checklist and selected design scope.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s01-02-product-design-contract.md). Planning-file creation itself does not satisfy this gate.

