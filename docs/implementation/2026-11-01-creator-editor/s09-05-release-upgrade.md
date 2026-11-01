---
type: Spec
title: "S09.05: Verify cross-version upgrades and data preservation"
description: Execute S09.05 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s09]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S09.05
stage_id: S09
effort_days: [1, 1.5]
prerequisites: [S09.04]
execution_state: not_started
---

# S09.05: Verify cross-version upgrades and data preservation

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-1.5 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S09.04](s09-04-release-native-install.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [apps/desktop/scripts/verify-native-windows.ps1](../../../apps/desktop/scripts/verify-native-windows.ps1)
- [apps/desktop/scripts/verify-native-windows.mjs](../../../apps/desktop/scripts/verify-native-windows.mjs)
- [apps/desktop/src-tauri/tauri.conf.json](../../../apps/desktop/src-tauri/tauri.conf.json)
- [packages/core/src/session.ts](../../../packages/core/src/session.ts)
- [packages/server/src/project-manager.ts](../../../packages/server/src/project-manager.ts)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Define the supported upgrade source version(s), exact installer hashes and migration expectations; same-version reinstall is a separate scenario.
2. Create isolated prior-version projects with media, history, profiles/settings and representative generated assets, back them up, then upgrade with the new candidate.
3. Verify reopen/edit/undo/export across migrated project/history states and ensure unknown newer formats cannot be silently corrupted by an older executable.
4. Test same-version reinstall and uninstall preservation of user projects/media/private settings according to the documented policy.
5. Exercise interrupted upgrade/migration and a documented recovery path using backups; do not promise binary downgrade compatibility for unsupported project features.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- A genuine older-to-newer install upgrades preserved projects/settings and full-decodes selected exports; receipt names both versions and hashes.
- Same-version reinstall passes independently and is not labeled cross-version coverage.
- Uninstall preserves user data at declared locations and removes only owned application resources; reinstall can reopen preserved work.
- Failed migration/install leaves a recoverable original/backup with clear instructions; rollback does not silently strip v2 features.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- If no real prior-version artifact is available, the cross-version gate remains blocked; mocking an old version number is insufficient.
- Never run preservation tests against the owner's only working project/data copy; use isolated backed-up fixtures.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Cross-version/reinstall/uninstall matrix, preserved-data hashes and recovery evidence.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to S09.06 (`s09-06-release-performance.md`; later publication batch) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

