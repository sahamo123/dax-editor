---
type: Roadmap
title: "S06: Curated Blender characters and scene packs"
description: Ordered S06 execution steps with explicit dependencies, resource needs and acceptance gates.
tags: [implementation, creator-platform, roadmap]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S06
effort_days: [10, 18]
prerequisites: [S05.07, S02.08, S03.09]
step_ids: [S06.01, S06.02, S06.03, S06.04, S06.05, S06.06, S06.07, S06.08]
execution_state: not_started
---

# S06: Curated Blender characters and scene packs

**Execution is NOT_STARTED.** These pages specify later work; writing/reviewing this plan implements none of the capabilities.
Engineering estimate: **10-18 person-days** including tests/review fixes, not elapsed agent runtime. Split each step into roughly 1-3-day PRs, normally under 400 changed lines.

## Dependencies and entry

Required stage dependencies: [S05.07](s05-07-reference-close.md), S02.08, S03.09. Before each step, revalidate the predecessor receipt and source/artifact/regression evidence using the [execution contract](execution-contract.md).
Use the strict order below. Cross-stage capability dependencies do not permit skipping the immediately preceding required receipt.
Planning approval is not implementation authorization or evidence. Read current AGENTS, handoff/STATUS and the scoped issue before work; keep every required blocked gate incomplete.

## Ordered steps

| Step | Deliverable | Person-days |
|---|---|---:|
| [S06.01](s06-01-character-intake.md) | Qualify three curated character and scene packs | 1-2 |
| [S06.02](s06-02-character-contracts.md) | Version bounded character recipes and provenance | 1-2 |
| [S06.03](s06-03-character-process-limits.md) | Harden owned Blender process execution | 2-3 |
| [S06.04](s06-04-character-draft-scenes.md) | Render curated opaque draft and full scenes | 1-2 |
| [S06.05](s06-05-character-alpha.md) | Preserve alpha through character composition | 1-2 |
| [S06.06](s06-06-character-regeneration.md) | Commit and regenerate character assets atomically | 1-2 |
| [S06.07](s06-07-character-configurator.md) | Expose bounded character configuration and review | 1-2 |
| [S06.08](s06-08-character-close.md) | Accept curated character rendering across targets | 2-3 |

## Resources and boundaries

Graphics engineer plus 5-10 separately budgeted technical-artist days; three qualified rigs/scene packs; optional user-installed Blender and policy-authorized test targets.
The technical-artist 5-10-day allowance is additional to the engineering total. Curated parameterized characters do not include arbitrary text-to-3D, rigging, lip-sync or likeness generation.

## Exit and handoff

Three curated examples pass appearance/action, draft/full, alpha, import/regenerate/undo, failure/cancellation and provenance checks on selected targets.
Use the [receipt template](receipt-template.md) and link stage/step receipts from their GitHub implementation issues and current STATUS/handoff. Keep the [master plan](master-plan.md) as static navigation; record SHAs, command exits, artifact hashes, hardware, scope, skips and blockers.
Complete log/concept/STATUS/index updates in the implementation PR. A source/mock/browser success cannot close a required native, provider, external-client or host gate; failed/blocked evidence stops advancement.
