---
type: Guide
title: Decision register and open scope choices
description: Records planning choices, unresolved implementation decisions and their required ADR or owner-review evidence.
tags: [implementation, decisions, scope]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
---

# Decision register

This register distinguishes settled repository rules, handbook organization and **proposed** implementation choices. It does not turn a planning suggestion into an approved architecture or implemented feature. Link actual ADRs when created; never invent their numbers or approval state.

| ID | Decision / question | State | Owner / resolution point |
|---|---|---|---|
| D01 | Keep a single typed command/session/history engine | Existing repository constraint | Every step; root AGENTS and architecture docs |
| D02 | Store this program's plan and operational handoff in one dated folder | Requested by owner during planning | This handbook; [master](master-plan.md) |
| D03 | Give each stage and sub-stage its own Markdown file; verify predecessor before next | Requested by owner during planning | [Execution contract](execution-contract.md) |
| D04 | First-improvement route ends at S02.08 development candidate | Proposed default launch scope | Owner selects route before [execution goal](execution-goal.md) |
| D05 | Preserve existing UI identity while improving operability | Existing brief plus proposed M1 refinement | S01.01/S01.02 evidence; no invented redesign approval |
| D06 | Profile precedence and project/history migration protocol | Proposed design, not approved implementation | S02.01 spec/ADR, verified by S02.02/S02.07 |
| D07 | Bounded layers, anchoring, time maps, alpha and transitions | Proposed design | S03.01 spec/ADR before renderer/schema changes |
| D08 | Local authorized reference media; optional URL as attribution | Proposed bounded feature | S05.01 feasibility and source acquisition checks |
| D09 | Curated character rigs/scenes rather than arbitrary scene code | Proposed bounded feature under existing safety rules | S06.01 rights/art brief and S06.02 contract |
| D10 | Durable workflow journal/storage and idempotent commit | Undecided storage mechanism | S07.01 ADR based on crash/volume requirements; no dependency assumed |
| D11 | Private personal hosting; multi-user/public service separate | Proposed route boundary | Owner route/host authorization, S08.01 threat model |
| D12 | Required clients/providers and acceptance target hardware | Not selected for execution yet | Provisional launch/S00.01 declaration; freeze/revalidate S09.01 |

## Add or change a decision

Record date, affected IDs, concrete options, chosen option, rationale, evidence and who had authority to decide. Routine choices within authorized scope can be made by the executor and recorded. A change dropping an already required criterion, expanding scope, deploying externally or changing security controls needs the corresponding explicit authorization; do not infer it from this register.

For architecture, link the ADR and its state. For an experiment, record the measured result and whether it supports proceed/narrow/stop. A stop can be a valid experiment result but cannot automatically unlock a feature that depended on success. Update dependent plan/issue receipts when assumptions change, preserving the original decision and superseding it visibly.

## Open inputs that do not block planning

Execution agent/client choice, target hardware, licensed reference corpus, final character art/rigs, optional hosted credentials and intended private host are not supplied by the plan. Their named implementation steps must resolve them. Do not ask for all of them merely to read or review the handbook.
