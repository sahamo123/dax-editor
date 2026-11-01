---
type: Spec
title: "S06.01: Qualify three curated character and scene packs"
description: Execute S06.01 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s06]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S06.01
stage_id: S06
effort_days: [1, 2]
prerequisites: [S05.07, S02.08]
execution_state: not_started
---

# S06.01: Qualify three curated character and scene packs

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-2 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S05.07](s05-07-reference-close.md), S02.08. Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [docs/research/open-source-radar.md](../../../docs/research/open-source-radar.md)
- [docs/adr/0009-autonomous-open-source-intake.md](../../../docs/adr/0009-autonomous-open-source-intake.md)
- [packages/core/assets/blender/template.py](../../../packages/core/assets/blender/template.py)
- [packages/core/src/motion.ts](../../../packages/core/src/motion.ts)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Write a character feature spec and technical-art brief for three bounded character/scene examples, including appearance controls, approved gestures, camera/lighting choices and draft/full outputs.
2. Inventory rig, mesh, texture, font and animation rights individually. Pin versions and SHA-256 digests, retain licence/NOTICE/attribution, and reject incompatible or unknown redistribution terms.
3. Review each asset for embedded scripts, drivers, external references and unexpected dependencies; define a safe owned loading path and a finite parameter/animation allowlist.
4. Budget the separate 5-10 technical-artist days across preparation and review without hiding them inside the 10-18 engineering-day M6 estimate. Record missing art as a dependency with an owner.
5. Keep Blender as the existing optional separate user-installed program; asset permission does not authorize bundling Blender, arbitrary downloaded scripts, a marketplace or likeness generation.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Each of three proposed examples has a complete asset/rights manifest and reproducible pinned source; no sample is labeled qualified based only on Blender's licence.
- Malformed pack, missing notice, digest mismatch and embedded unreviewed code are rejected before rendering.
- A reviewer can map every configurable option to a prepared rig/material/action and documented resource budget.
- Existing title-card/logo-intro/text-3d examples remain available; character packs are unavailable until their actual dependencies are qualified.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- Unlicensed or noncommercial assets stop that pack; substitute an owned/permitted asset or leave it excluded rather than inventing permission.
- If artist preparation exceeds the budget, record a scope decision before committing to a broader configurator.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Three-pack art/intake manifest, scope decision and separate artist allocation.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S06.02](s06-02-character-contracts.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

