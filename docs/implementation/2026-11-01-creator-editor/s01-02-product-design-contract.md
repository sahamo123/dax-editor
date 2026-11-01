---
type: Spec
title: "S01.02: Record the product and design contract"
description: "Plan and evidence gates: Record the product and design contract."
tags: [implementation, creator-workflows, workspace]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S01.02
stage_id: S01
effort_days: [0.5, 0.75]
prerequisites: [S01.01]
execution_state: not_started
---

# S01.02: Record the product and design contract

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S01.01**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [docs/specs/creator-platform-plan.md](../../../docs/specs/creator-platform-plan.md) — existing baseline; inspect applicable package rules before editing.
- [docs/engineering/impeccable-design.md](../../../docs/engineering/impeccable-design.md) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/app/styles/tokens.css](../../../apps/desktop/src/app/styles/tokens.css) — existing baseline; inspect applicable package rules before editing.
- [docs/specs/product-v1.md](../../../docs/specs/product-v1.md) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Create PRODUCT.md and DESIGN.md only after checking whether later work already added them; document observed product facts and explicitly chosen direction, never invented approval.
2. Write the focused workspace spec covering skippable setup, existing-project direct entry, contextual inspection, persistent timeline and task visibility.
3. Define ownership between Shell/controller/store and the editor public surface; project edits remain typed commands via `api.run`, with UI-only selection/layout state.
4. Specify narrow Edit/Assistant switching and bottom/context inspector behavior, minimum preview/timeline sizing, focus restoration and Escape handling.
5. Record accessibility and screenshot acceptance matrices plus explicit non-goals. New architectural boundaries need an ADR before implementation; visual rearrangement does not justify new packages.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Contract: every new surface has entry/exit/loading/error states, keyboard behavior and a regression reference from the audit.
- Design provenance: token/font decisions match the incumbent or documented selection; no external font/image request or new dependency is required.
- Documentation: local links and OKF indexes pass; product/design text distinguishes proposed UI from currently implemented behavior.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

Unresolved incompatible workflow choices block affected implementation. Record the narrow question in the issue/spec; do not guess a new architecture or broad rebrand.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Product/design documents, focused spec, decision record where needed and audit-to-acceptance mapping.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s01-03-setup-inspector.md). Planning-file creation itself does not satisfy this gate.

