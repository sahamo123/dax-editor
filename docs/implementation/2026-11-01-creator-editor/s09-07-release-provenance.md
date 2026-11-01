---
type: Spec
title: "S09.07: Prepare verified package provenance and transfer"
description: Execute S09.07 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s09]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S09.07
stage_id: S09
effort_days: [0.5, 1]
prerequisites: [S09.06]
execution_state: not_started
---

# S09.07: Prepare verified package provenance and transfer

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **0.5-1 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S09.06](s09-06-release-performance.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [apps/desktop/scripts/prepare-sidecars.mjs](../../../apps/desktop/scripts/prepare-sidecars.mjs)
- [apps/desktop/scripts/prepare-offline-ai.mjs](../../../apps/desktop/scripts/prepare-offline-ai.mjs)
- [apps/desktop/scripts/prepare-offline-speech.mjs](../../../apps/desktop/scripts/prepare-offline-speech.mjs)
- [docs/research/open-source-radar.md](../../../docs/research/open-source-radar.md)
- [docs/engineering/laptop-continuation.md](../../../docs/engineering/laptop-continuation.md)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Assemble source tree, dependency/runtime/model/asset provenance, licence notices and hashes for the exact accepted candidate; inspect shipped FFmpeg configuration for the required LGPL-safe policy.
2. Create the release artifact manifest tying installer, binary, sidecars, offline assets and optional packs to source and acceptance receipts.
3. Transfer the current installer/package to its intended handoff location and verify full bytes/hash after transfer; remote artifact existence or a small receipt alone is not successful transfer.
4. Prepare reproducible source/history/setup handoff and separate private project/media transfer instructions, preserving credentials and private evidence outside Git.
5. Inspect package/archive contents for secrets, personal media, development artifacts and unexpected executables; publish nothing automatically as a side effect of preparing the handoff.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- All shipped artifacts have matching digest/provenance/licence records and required notices; no prohibited codec dependency is introduced.
- The actual current package is locally or otherwise verifiably available at the intended handoff destination with full hash/size verification.
- Fresh setup instructions reference the correct branch/SHA/toolchain and explain optional models/Blender/credentials without implying missing dependencies are included.
- Private media/secrets are absent from public/source bundles and checksums point to the accepted build rather than a historical installer.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- Failed or partial large transfer keeps delivery blocked; retain the exact verified artifact and resume a bounded transfer without claiming completion.
- If provenance/licensing cannot be established, exclude the artifact by reviewed scope decision or stop release; do not fabricate a notice.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Package/source manifests, verified transfer receipt and reproducible handoff instructions.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S09.08](s09-08-release-adjudication.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

