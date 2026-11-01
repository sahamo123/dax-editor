---
type: Roadmap
title: "S05: Reference-style analysis and editable recipes"
description: Ordered S05 execution steps with explicit dependencies, resource needs and acceptance gates.
tags: [implementation, creator-platform, roadmap]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S05
effort_days: [7, 12]
prerequisites: [S04.08, S02.08, S03.09]
step_ids: [S05.01, S05.02, S05.03, S05.04, S05.05, S05.06, S05.07]
execution_state: not_started
---

# S05: Reference-style analysis and editable recipes

**Execution is NOT_STARTED.** These pages specify later work; writing/reviewing this plan implements none of the capabilities.
Engineering estimate: **7-12 person-days** including tests/review fixes, not elapsed agent runtime. Split each step into roughly 1-3-day PRs, normally under 400 changed lines.

## Dependencies and entry

Required stage dependencies: S04.08, S02.08, S03.09. Before each step, revalidate the predecessor receipt and source/artifact/regression evidence using the [execution contract](execution-contract.md).
Use the strict order below. Cross-stage capability dependencies do not permit skipping the immediately preceding required receipt.
Planning approval is not implementation authorization or evidence. Read current AGENTS, handoff/STATUS and the scoped issue before work; keep every required blocked gate incomplete.

## Ordered steps

| Step | Deliverable | Person-days |
|---|---|---:|
| [S05.01](s05-01-reference-feasibility.md) | Bound the reference-style feasibility decision | 2-2 |
| [S05.02](s05-02-reference-contracts.md) | Define evidence and recipe contracts | 0.5-1 |
| [S05.03](s05-03-reference-sampling.md) | Acquire and cache bounded local samples | 1-2 |
| [S05.04](s05-04-reference-measurements.md) | Extract deterministic style evidence | 1-2 |
| [S05.05](s05-05-reference-preview.md) | Compile recipes and render comparison previews | 0.5-1 |
| [S05.06](s05-06-reference-workflow.md) | Add editable reference review and apply controls | 1-2 |
| [S05.07](s05-07-reference-close.md) | Close reference-style quality and compatibility | 1-2 |

## Resources and boundaries

Authorized reference corpus and annotations; media/AI engineer; bounded local sampling tools. No hosted provider, URL downloader or vision model is required.
Use local authorized footage and generic editing parameters. No universal downloader, paid provider, OCR/vision installation or exact-clone promise is authorized by this plan.

## Exit and handoff

Authorized local reference yields evidence/confidence, editable recipe, shared-render preview and one undoable application; held-out quality and unsupported cases have explicit outcomes.
Use the [receipt template](receipt-template.md) and link stage/step receipts from their GitHub implementation issues and current STATUS/handoff. Keep the [master plan](master-plan.md) as static navigation; record SHAs, command exits, artifact hashes, hardware, scope, skips and blockers.
Complete log/concept/STATUS/index updates in the implementation PR. A source/mock/browser success cannot close a required native, provider, external-client or host gate; failed/blocked evidence stops advancement.

