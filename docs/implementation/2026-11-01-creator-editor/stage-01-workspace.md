---
type: Roadmap
title: "S01: Control-panel workflow and design contract"
description: "Documented incumbent design system and an accessible setup, assistant, preview, inspector and timeline workflow."
tags: [implementation, creator-workflows, workspace]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S01
effort_days: [4, 7]
prerequisites: [S00.06]
step_ids: [S01.01, S01.02, S01.03, S01.04, S01.05, S01.06, S01.07]
execution_state: not_started
---

# S01: Control-panel workflow and design contract

Implementation is **NOT_STARTED**; a completed planning review does not complete this stage.

## Entry and order

Read the [master](master-plan.md) and [execution contract](execution-contract.md). Verify predecessor receipts S00.06 and their commits/artifacts before entry. Every adjacent step requires an independent recheck of the prior receipt.

| Step | Execution document | Person-days |
|---|---|---:|
| S01.01 | [Audit the current rendered editing workflow](s01-01-workflow-audit.md) | 0.5–1 |
| S01.02 | [Record the product and design contract](s01-02-product-design-contract.md) | 0.5–0.75 |
| S01.03 | [Separate project setup from contextual inspection](s01-03-setup-inspector.md) | 0.75–1.25 |
| S01.04 | [Keep the preview usable across workspace sizes](s01-04-responsive-workspace.md) | 0.75–1.25 |
| S01.05 | [Preserve task and recovery controls in the new layout](s01-05-task-recovery-visibility.md) | 0.5–1 |
| S01.06 | [Complete keyboard and accessibility behavior](s01-06-accessibility.md) | 0.5–1 |
| S01.07 | [Verify browser and native workspace acceptance](s01-07-workspace-acceptance.md) | 0.5–0.75 |

## Deliverables and resources

Documented incumbent design system and an accessible setup, assistant, preview, inspector and timeline workflow.

UI engineer, designer and QA; browser matrix plus an authorized Windows native machine capable of real 100/125/150/200% display scaling.

## Exit and blocked handling

Browser screenshots do not satisfy native DPI acceptance. Missing required native evidence blocks S01.07; an authorized alternate Windows target may satisfy its defined machine scope.

Each required step must have a complete [receipt](receipt-template.md), current commit/artifact evidence and passing regression checks. Failed/missing evidence blocks advancement; record the recovery action and do not bypass it.

After independent stage review, continue to [the next stage's first step](s02-01-profile-compatibility-contract.md). Complete log/STATUS/concept/index updates in the implementation PR; preserve this plan's original estimates and record actual effort separately.

