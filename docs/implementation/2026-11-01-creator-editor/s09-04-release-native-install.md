---
type: Spec
title: "S09.04: Validate the exact packaged native candidate"
description: Execute S09.04 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s09]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S09.04
stage_id: S09
effort_days: [1, 1.5]
prerequisites: [S09.03]
execution_state: not_started
---

# S09.04: Validate the exact packaged native candidate

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-1.5 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S09.03](s09-03-release-ai-clients.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [.github/workflows/functional-windows-build.yml](../../../.github/workflows/functional-windows-build.yml)
- [.github/workflows/native-windows-acceptance.yml](../../../.github/workflows/native-windows-acceptance.yml)
- [apps/desktop/scripts/verify-native-windows.ps1](../../../apps/desktop/scripts/verify-native-windows.ps1)
- [apps/desktop/scripts/verify-native-windows.mjs](../../../apps/desktop/scripts/verify-native-windows.mjs)
- [apps/desktop/src-tauri/AGENTS.md](../../../apps/desktop/src-tauri/AGENTS.md)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Revalidate and install the identical packaged candidate acquired in S09.01 and exercised in S09.03; verify its source SHA and archive/installer/application/sidecar hashes. A rebuilt or replaced candidate invalidates affected prior checks and must return through them before native acceptance.
2. Inspect the native workflow's artifact selection: the planning baseline pins historical run 40528351026. Update candidate-selection plumbing only through authorized reviewed CI work; a green rerun of that old artifact is not new acceptance.
3. Install on a clean policy-authorized Windows target and run actual native Open/Save dialogs, import/playback, manual edit/undo, exact effects review, audio/video export, restart and graceful shutdown.
4. Validate packaged local/offline assets and renderer execution separately from development/system-FFmpeg paths; do not weaken Windows Application Control.
5. Capture child exit status and independently require the acceptance result artifact to say PASS, preserving failure evidence and screenshots even after cleanup.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Verified candidate source and installer/application hashes match the release declaration; old build artifacts cannot satisfy the gate.
- Actual native dialogs, WebView2 playback/review and full-decoded export pass using packaged tools on the declared target.
- Clean-install manual/offline use, restart and process shutdown pass; no hidden dependence on development caches or configured hosted keys exists.
- Runner-native and owner-laptop native rows remain separate. If owner-laptop is selected, its own policy-authorized execution must pass.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- Application-control rejection is a target blocker; obtain legitimate authorization or retain NOT READY, never disable policy or substitute system FFmpeg as package proof.
- If wrapper exit status and result JSON disagree, treat acceptance as failed and repair the harness before rerun.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Source-matched installer/native result, hashes, screenshots and per-machine readiness rows.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S09.05](s09-05-release-upgrade.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

