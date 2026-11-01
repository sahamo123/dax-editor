---
type: Roadmap
title: "S07: Bounded specialist workflows and recovery"
description: Ordered S07 execution steps with explicit dependencies, resource needs and acceptance gates.
tags: [implementation, creator-platform, roadmap]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S07
effort_days: [5, 8]
prerequisites: [S06.08, S02.08, S04.08, S05.07]
step_ids: [S07.01, S07.02, S07.03, S07.04, S07.05, S07.06, S07.07]
execution_state: not_started
---

# S07: Bounded specialist workflows and recovery

**Execution is NOT_STARTED.** These pages specify later work; writing/reviewing this plan implements none of the capabilities.
Engineering estimate: **5-8 person-days** including tests/review fixes, not elapsed agent runtime. Split each step into roughly 1-3-day PRs, normally under 400 changed lines.

## Dependencies and entry

Required stage dependencies: [S06.08](s06-08-character-close.md), S02.08, S04.08, [S05.07](s05-07-reference-close.md). Before each step, revalidate the predecessor receipt and source/artifact/regression evidence using the [execution contract](execution-contract.md).
Use the strict order below. Cross-stage capability dependencies do not permit skipping the immediately preceding required receipt.
Planning approval is not implementation authorization or evidence. Read current AGENTS, handoff/STATUS and the scoped issue before work; keep every required blocked gate incomplete.

## Ordered steps

| Step | Deliverable | Person-days |
|---|---|---:|
| [S07.01](s07-01-workflow-contract.md) | Define bounded workflow and journal semantics | 0.5-1 |
| [S07.02](s07-02-workflow-journal.md) | Persist journal and idempotent mutation receipts | 1-1.5 |
| S07.03 (`s07-03-workflow-coordinator.md`; later publication batch) | Execute dependencies and recover interrupted work | 1-1.5 |
| S07.04 (`s07-04-resource-admission.md`; later publication batch) | Admit all expensive work under one resource budget | 1-1.5 |
| S07.05 (`s07-05-specialist-adapters.md`; later publication batch) | Wire restricted specialist roles to existing capabilities | 0.5-1 |
| S07.06 (`s07-06-workflow-trace.md`; later publication batch) | Expose workflow trace and live-client controls | 0.5-0.75 |
| S07.07 (`s07-07-workflow-close.md`; later publication batch) | Accept workflow recovery and actual clients | 0.5-0.75 |

## Resources and boundaries

Server/AI engineer; fault-injection harness; declared Windows hardware; actual selected client sessions and authorized optional credentials.
Reuse the current session, provider adapters and command registry. One inference and one heavy job are starting admission limits; real whole-app measurements determine supported resource claims.

## Exit and handoff

Durable parent/child workflows survive duplicate delivery/restart without duplicate edits, preserve manual changes and Planning, and meet measured resource/client gates.
Use the [receipt template](receipt-template.md) and link stage/step receipts from their GitHub implementation issues and current STATUS/handoff. Keep the [master plan](master-plan.md) as static navigation; record SHAs, command exits, artifact hashes, hardware, scope, skips and blockers.
Complete log/concept/STATUS/index updates in the implementation PR. A source/mock/browser success cannot close a required native, provider, external-client or host gate; failed/blocked evidence stops advancement.

