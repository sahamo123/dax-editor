---
type: Roadmap
title: "S03: Bounded layered composition"
description: "Versioned video/still layers, bounded transforms/transitions, supplied-matte alpha composition, manual controls and measured review/export coverage."
tags: [implementation, creator-workflows, composition]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S03
effort_days: [10, 16]
prerequisites: [S02.08, S02.02]
step_ids: [S03.01, S03.02, S03.03, S03.04, S03.05, S03.06, S03.07, S03.08, S03.09]
execution_state: not_started
---

# S03: Bounded layered composition

Implementation is **NOT_STARTED**; a completed planning review does not complete this stage.

## Entry and order

Read the [master](master-plan.md) and [execution contract](execution-contract.md). Verify predecessor receipts S02.08, S02.02 and their commits/artifacts before entry. Every adjacent step requires an independent recheck of the prior receipt.

| Step | Execution document | Person-days |
|---|---|---:|
| S03.01 | [Decide the bounded composition and time-map contract](s03-01-composition-contract.md) | 1–1.5 |
| S03.02 | [Add versioned layers and preserve saved history](s03-02-layer-schema-persistence.md) | 1–1.5 |
| S03.03 | Implement pure layer operations and anchoring (`s03-03-layer-commands-anchoring.md`; later publication batch) | 1–2 |
| S03.04 | Render video and still layers through the shared engine (`s03-04-layer-renderer.md`; later publication batch) | 1–2 |
| S03.05 | Add bounded keyframes and transitions (`s03-05-keyframes-transitions.md`; later publication batch) | 1–2 |
| S03.06 | Compose alpha assets and supplied foreground mattes (`s03-06-alpha-supplied-mattes.md`; later publication batch) | 1–1.5 |
| S03.07 | Expose layer lanes and contextual controls (`s03-07-layer-workspace.md`; later publication batch) | 1–1.5 |
| S03.08 | Declare and verify interactive and rendered coverage (`s03-08-preview-review-coverage.md`; later publication batch) | 1.5–2 |
| S03.09 | Close layered composition with measured output (`s03-09-composition-acceptance.md`; later publication batch) | 1.5–2 |

## Deliverables and resources

Versioned video/still layers, bounded transforms/transitions, supplied-matte alpha composition, manual controls and measured review/export coverage.

Media engineer, UI engineer and QA; generated color/alpha/audio fixtures, fractional-fps and VFR inputs, authorized native playback target.

## Exit and blocked handling

The authoritative render must pass frame/audio measurements and full decode. Interactive approximation is disclosed; arbitrary graphs, automatic segmentation and speed ramps are outside this stage.

Each required step must have a complete [receipt](receipt-template.md), current commit/artifact evidence and passing regression checks. Failed/missing evidence blocks advancement; record the recovery action and do not bypass it.

After independent stage review, continue to the next stage's first step (`s04-01-long-form-contract-fixtures.md`; later publication batch). Complete log/STATUS/concept/index updates in the implementation PR; preserve this plan's original estimates and record actual effort separately.

