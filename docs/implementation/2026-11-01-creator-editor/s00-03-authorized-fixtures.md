---
type: Spec
title: "S00.03: Build the authorized acceptance fixture inventory"
description: "Plan and evidence gates: Build the authorized acceptance fixture inventory."
tags: [implementation, creator-workflows, baseline]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S00.03
stage_id: S00
effort_days: [0.25, 0.5]
prerequisites: [S00.02]
execution_state: not_started
---

# S00.03: Build the authorized acceptance fixture inventory

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S00.02**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [packages/core/src/test-utils.ts](../../../packages/core/src/test-utils.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/av-sync-render.test.ts](../../../packages/core/src/av-sync-render.test.ts) — existing baseline; inspect applicable package rules before editing.
- [scripts/New-SpeechFixture.ps1](../../../scripts/New-SpeechFixture.ps1) — existing baseline; inspect applicable package rules before editing.
- [scripts/verify-speech-longform.mjs](../../../scripts/verify-speech-longform.mjs) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Inventory reusable generated fixtures and existing private acceptance receipts before producing duplicates; distinguish synthetic correctness tests from human-media usability acceptance.
2. Define short, full-length, podcast and educational fixture cases with expected duration, frame rate, dimensions, audio layout and planned operations.
3. For every real recording, record owner permission or redistribution-safe license, provenance and private storage policy; keep sensitive names/transcripts out of committed receipts.
4. Generate deterministic color/box/tone/frame-counter media through existing test helpers for source tests. Add malformed/missing-media and fractional-rate cases without network-dependent tests.
5. Create a checksum manifest and expected observations; store media and private paths in ignored artifacts. Reserve the 30/60/120-minute corpus expansion for S04.01 rather than claiming it exists now.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Reproducibility: another agent can regenerate synthetic cases offline with the documented seed/tool version and expected streams.
- Rights: every real fixture has a specific provenance/permission record; unknown rights means excluded, not assumed licensed.
- Coverage: all four profile use cases, VFR/fractional fps, audio absence and missing-media recovery have named fixtures and expected outcomes.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

An unavailable authorized recording is a blocked acceptance input, never a reason to download arbitrary platform footage. Continue only fixture work independent of that recording; do not mark its required case passed.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Sanitized fixture manifest, private checksum inventory, generation instructions and exact gaps in authorized coverage.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s00-04-performance-budgets.md). Planning-file creation itself does not satisfy this gate.

