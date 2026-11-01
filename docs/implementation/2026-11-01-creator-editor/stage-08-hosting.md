---
type: Roadmap
title: "S08: Optional private personal hosting"
description: Ordered S08 execution steps with explicit dependencies, resource needs and acceptance gates.
tags: [implementation, creator-platform, roadmap]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S08
effort_days: [8, 14]
prerequisites: [S07.07, S02.08]
step_ids: [S08.01, S08.02, S08.03, S08.04, S08.05, S08.06, S08.07, S08.08]
execution_state: not_started
---

# S08: Optional private personal hosting

**Execution is NOT_STARTED.** These pages specify later work; writing/reviewing this plan implements none of the capabilities.
Engineering estimate: **8-14 person-days** including tests/review fixes, not elapsed agent runtime. Split each step into roughly 1-3-day PRs, normally under 400 changed lines.

## Dependencies and entry

Required stage dependencies: [S07.07](s07-07-workflow-close.md), S02.08. Before each step, revalidate the predecessor receipt and source/artifact/regression evidence using the [execution contract](execution-contract.md).
This stage is optional. Only full-hosted enters it; desktop-creator goes from S07.07 directly to S09.01. Its scope is a private single-owner host, with public multi-user service explicitly excluded.
Planning approval is not implementation authorization or evidence. Read current AGENTS, handoff/STATUS and the scoped issue before work; keep every required blocked gate incomplete.

## Ordered steps

| Step | Deliverable | Person-days |
|---|---|---:|
| [S08.01](s08-01-host-threat-model.md) | Define the optional personal-host trust boundary | 1-2 |
| [S08.02](s08-02-portable-assets.md) | Resolve portable assets and collect projects | 1-2 |
| [S08.03](s08-03-owner-gateway.md) | Implement single-owner authenticated gateway sessions | 1-2 |
| [S08.04](s08-04-host-media-boundaries.md) | Scope remote media and isolate native workers | 1-2 |
| [S08.05](s08-05-private-deployment.md) | Package a pinned private single-owner deployment | 1-1.5 |
| [S08.06](s08-06-host-reconnect.md) | Recover browser sessions and task controls remotely | 1-1.5 |
| [S08.07](s08-07-host-recovery.md) | Verify quotas backup restore and workspace recovery | 1-1.5 |
| [S08.08](s08-08-host-close.md) | Accept personal hosting and desktop parity | 1-1.5 |

## Resources and boundaries

DevOps/security engineer; private Linux test host/network, authorized owner identity/TLS setup, storage for originals and restore rehearsal; no paid platform required.
Remote computation requires media transfer and a separate trust boundary. Optional Blender stays user-supplied unless distribution intake permits exact packaging; no public engine binding or wildcard CORS.

## Exit and handoff

One-owner private host passes scoped auth/media/range/worker isolation, reconnect, quotas, restart, restore and desktop export parity; no public/multi-user claim.
Use the [receipt template](receipt-template.md) and link stage/step receipts from their GitHub implementation issues and current STATUS/handoff. Keep the [master plan](master-plan.md) as static navigation; record SHAs, command exits, artifact hashes, hardware, scope, skips and blockers.
Complete log/concept/STATUS/index updates in the implementation PR. A source/mock/browser success cannot close a required native, provider, external-client or host gate; failed/blocked evidence stops advancement.
