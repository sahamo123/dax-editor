---
type: Spec
title: "S09.03: Verify offline AI and selected providers and clients"
description: Execute S09.03 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s09]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S09.03
stage_id: S09
effort_days: [0.5, 1]
prerequisites: [S09.02]
execution_state: not_started
---

# S09.03: Verify offline AI and selected providers and clients

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **0.5-1 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S09.02](s09-02-release-source-media.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [scripts/verify-offline-bundle.mjs](../../../scripts/verify-offline-bundle.mjs)
- [packages/engine/src/provider-diagnostics.ts](../../../packages/engine/src/provider-diagnostics.ts)
- [packages/server/src/live-mcp.test.ts](../../../packages/server/src/live-mcp.test.ts)
- [packages/bridges/AGENTS.md](../../../packages/bridges/AGENTS.md)
- [packages/agent/src/providers/openai.ts](../../../packages/agent/src/providers/openai.ts)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Revalidate S09.01's packaging receipt and candidate hashes before running actual packaged local/offline inference and manual-only operation with outbound access denied under the declared method; verify edit correctness, unsupported request behavior, restart and cleanup. Use the identical candidate later tested natively in S09.04.
2. For each selected hosted provider, separate saved configuration, connection diagnostic and a real request that performs a validated visible edit/undo/export. Keep keys outside projects/logs.
3. For each selected external assistant client, perform its actual natural-language session through the supported connection; distinguish its inference from a scripted MCP SDK transport test.
4. Exercise queue/steering/Stop, Planning refusal, revision conflicts and task ownership through each selected relevant front door.
5. Record optional integrations not selected as not live-verified. Core offline operation remains mandatory and must work without any paid provider.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Offline tests use the actual packaged model/runtime and sidecars, with decoded output and evidence of process cleanup/restart.
- Selected provider rows include real response/tool/edit evidence, exact model/provider configuration minus secrets and correct resulting project history.
- Selected client rows include request, actual tool calls, visible shared-project change, undo and export; configuration snippets or a running process do not qualify.
- No credentials, private source content or bearer tokens leak into committed receipts, downloadable logs or screenshots.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- Missing selected credentials/client authorization blocks this step; continue independent evidence collection without marking the step complete.
- If policy blocks packaged inference/native tools, label system-runtime diagnostics separately and retain the packaged gate as blocked.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Offline/provider/client matrix with distinct configured, diagnostic, transport and actual-session outcomes.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S09.04](s09-04-release-native-install.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.
