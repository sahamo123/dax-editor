---
type: Spec
title: "S08.04: Scope remote media and isolate native workers"
description: Execute S08.04 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s08]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S08.04
stage_id: S08
effort_days: [1, 2]
prerequisites: [S08.03]
execution_state: not_started
---

# S08.04: Scope remote media and isolate native workers

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **1-2 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S08.03](s08-03-owner-gateway.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [packages/server/src/routes.ts](../../../packages/server/src/routes.ts)
- [packages/server/src/range.ts](../../../packages/server/src/range.ts)
- [packages/server/src/paths.ts](../../../packages/server/src/paths.ts)
- [packages/server/src/upload.test.ts](../../../packages/server/src/upload.test.ts)
- [packages/server/src/ffmpeg-run.ts](../../../packages/server/src/ffmpeg-run.ts)
- [packages/engine/src/blender.ts](../../../packages/engine/src/blender.ts)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Implement authenticated bounded upload IDs and download handles; reauthorize range/HEAD requests and exports against the owner workspace instead of accepting host filesystem paths.
2. Validate media type/size/duration after bounded staging, enforce quotas before costly decode, and atomically promote complete uploads.
3. Use the S08 threat-model worker isolation for native decoders and optional Blender: scoped writable directories, bounded CPU/RAM/disk/time and no unnecessary network.
4. Keep URL ingestion disabled unless a separate approved bounded resolver exists; if selected, cover protocols, redirect chains, private addresses and DNS changes with SSRF defenses.
5. Validate all generated/output paths and prevent serving partial, cancelled or unowned artifacts; delete only exact task-owned temporary directories.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Range/HEAD/upload/download tests reject unauthorized or guessed handles, traversal/symlink escape and requests after revocation.
- Oversized, malformed, decompression-expanding and interrupted uploads are rejected within resource limits without corrupting prior assets.
- A controlled worker cannot read/write outside its workspace or open unnecessary network access; validate actual isolation on the selected host.
- Full valid media round trip supports seeking and decoded export; failed/cancelled workers leave no partial file reachable through a download handle.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- If isolation cannot be demonstrated, keep native remote processing blocked; a private network alone does not sandbox malicious media.
- If URL safety cannot be proved, preserve local/upload-only acquisition instead of forwarding URLs directly to FFmpeg.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Media authorization/Range tests, upload boundary results and real worker-isolation evidence.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S08.05](s08-05-private-deployment.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.
