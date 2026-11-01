---
type: Roadmap
title: "S02: Content profiles and compatibility foundation"
description: "Four deterministic content profiles with truthful capability reporting, explicit override precedence, migration and one-undo application."
tags: [implementation, creator-workflows, profiles]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S02
effort_days: [4, 6]
prerequisites: [S01.07, S00.06]
step_ids: [S02.01, S02.02, S02.03, S02.04, S02.05, S02.06, S02.07, S02.08]
execution_state: not_started
---

# S02: Content profiles and compatibility foundation

Implementation is **NOT_STARTED**; a completed planning review does not complete this stage.

## Entry and order

Read the [master](master-plan.md) and [execution contract](execution-contract.md). Verify predecessor receipts S01.07, S00.06 and their commits/artifacts before entry. Every adjacent step requires an independent recheck of the prior receipt.

| Step | Execution document | Person-days |
|---|---|---:|
| S02.01 | [Specify profiles and project compatibility](s02-01-profile-compatibility-contract.md) | 0.5–0.75 |
| S02.02 | [Implement safe project and history migration](s02-02-project-history-migration.md) | 0.5–0.75 |
| S02.03 | [Define the four deterministic content profiles](s02-03-content-profiles.md) | 0.5–0.75 |
| S02.04 | [Make template capability reporting truthful](s02-04-capability-metadata.md) | 0.5–0.75 |
| S02.05 | [Preview and commit a profile as one edit](s02-05-atomic-profile-application.md) | 0.5–0.75 |
| S02.06 | [Integrate the profile chooser and template gallery](s02-06-profile-gallery-ui.md) | 0.5–0.75 |
| S02.07 | [Verify profile contracts across all entry points](s02-07-profile-contract-acceptance.md) | 0.5–0.75 |
| S02.08 | [Close the first-improvement development candidate](s02-08-first-improvement-candidate.md) | 0.5–0.75 |

## Deliverables and resources

Four deterministic content profiles with truthful capability reporting, explicit override precedence, migration and one-undo application.

Core/UI engineer and QA; fixture copies covering plain projects, branched history/checkpoints, missing assets and all four content types.

## Exit and blocked handling

S02.08 is a first-improvement development candidate, not native distribution certification. Migration, supported steps and four decoded sample exports are required.

Each required step must have a complete [receipt](receipt-template.md), current commit/artifact evidence and passing regression checks. Failed/missing evidence blocks advancement; record the recovery action and do not bypass it.

After stage review, `first-improvement` STOPS with a development-candidate evidence report and remaining release gates for owner review. Only `desktop-creator` or `full-hosted` continues to [S03.01](s03-01-composition-contract.md). Complete log/STATUS/concept/index updates in the implementation PR; preserve this plan's original estimates and record actual effort separately.

