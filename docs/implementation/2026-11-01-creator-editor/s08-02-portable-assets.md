---
type: Spec
title: "S08.02: Resolve portable assets and collect projects"
description: Execute S08.02 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s08]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S08.02
stage_id: S08
effort_days: [1, 2]
prerequisites: [S08.01, S02.08]
execution_state: not_started
---

# S08.02: Resolve portable assets and collect projects

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-2 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S08.01](s08-01-host-threat-model.md), S02.08. Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [packages/core/src/schema.ts](../../../packages/core/src/schema.ts)
- [packages/core/src/session.ts](../../../packages/core/src/session.ts)
- [packages/core/src/connector.ts](../../../packages/core/src/connector.ts)
- [packages/server/src/paths.ts](../../../packages/server/src/paths.ts)
- [packages/server/src/project-manager.ts](../../../packages/server/src/project-manager.ts)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Implement the proposed resolver behind M2 validated asset references, mapping stable IDs/digests to private local/host paths outside portable project content.
2. Add a bounded Collect project operation that inventories chosen originals/generated assets, displays required space and copies into a private owned folder with checksum manifest.
3. Preserve .dax.json as the source of project truth and migrate/relink all persisted history/checkpoint references; do not introduce a parallel project.yaml or leak machine paths.
4. Validate digest/size, containment, symlinks and missing assets before opening or rendering; browser-origin references resolve only within the authenticated workspace.
5. Define interrupted collection/relink behavior with temporary output and atomic completion, leaving original projects/media untouched.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- A collected project opens on a different root/machine with history, profiles, layers, reference/character provenance and decoded export preserved.
- Missing/tampered asset, duplicate display name, path traversal, symlink escape and foreign handle fail safely with a specific relink/error state.
- Collection cancellation/disk-full leaves originals valid and no partially complete manifest advertised as portable.
- Serialized project/manifest contains no absolute machine paths, tokens, API keys or temporary caches; relative mapping and digests remain reproducible.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- If any active history state still requires a nonportable path, stop portability claims and repair its migration before host import.
- Do not delete source media after collection or silently replace missing assets with similarly named files.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Portable bundle/relink manifest, cross-root results and resolver security regressions.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S08.03](s08-03-owner-gateway.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

