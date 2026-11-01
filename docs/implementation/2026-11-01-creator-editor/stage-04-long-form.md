---
type: Roadmap
title: "S04: Long-form podcast and educational workflows"
description: "Chapters/markers, bounded long-project views, slide scenes, manual camera alignment, speaker labels and reviewed highlights validated on long sessions."
tags: [implementation, creator-workflows, long-form]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S04
effort_days: [8, 14]
prerequisites: [S03.09]
step_ids: [S04.01, S04.02, S04.03, S04.04, S04.05, S04.06, S04.07, S04.08]
execution_state: not_started
---

# S04: Long-form podcast and educational workflows

Implementation is **NOT_STARTED**; a completed planning review does not complete this stage.

## Entry and order

Read the [master](master-plan.md) and [execution contract](execution-contract.md). Verify predecessor receipts S03.09 and their commits/artifacts before entry. Every adjacent step requires an independent recheck of the prior receipt.

| Step | Execution document | Person-days |
|---|---|---:|
| S04.01 | [Specify long-form workflows and expand fixtures](s04-01-long-form-contract-fixtures.md) | 1–1.5 |
| S04.02 | [Add chapters, markers and transcript navigation](s04-02-chapters-markers-navigation.md) | 1–1.5 |
| S04.03 | [Bound long-project views and derived-media work](s04-03-long-timeline-bounds.md) | 1–2 |
| S04.04 | [Build slide scenes and educational layouts](s04-04-slides-educational-layouts.md) | 1–1.5 |
| S04.05 | [Add manual camera alignment and switching](s04-05-manual-camera-sync.md) | 1–2 |
| S04.06 | [Add speaker labels and reviewed highlight proposals](s04-06-speakers-reviewed-highlights.md) | 1–1.5 |
| S04.07 | [Measure long-session synchronization and resources](s04-07-long-session-acceptance.md) | 1–2 |
| S04.08 | [Close podcast and educational workflow acceptance](s04-08-long-form-close.md) | 1–2 |

## Deliverables and resources

Chapters/markers, bounded long-project views, slide scenes, manual camera alignment, speaker labels and reviewed highlights validated on long sessions.

Media/UI engineer and QA; authorized 30/60/120-minute human recordings, separate audio and VFR fixtures, declared whole-process resource instrumentation.

## Exit and blocked handling

Short synthetic fixtures cannot substitute for required long human recordings. Automatic diarization/sync/highlight ranking are separate research gates; absent required media or native checks blocks closure.

Each required step must have a complete [receipt](receipt-template.md), current commit/artifact evidence and passing regression checks. Failed/missing evidence blocks advancement; record the recovery action and do not bypass it.

After independent stage review, continue to [the next stage's first step](s05-01-reference-feasibility.md). Complete log/STATUS/concept/index updates in the implementation PR; preserve this plan's original estimates and record actual effort separately.
