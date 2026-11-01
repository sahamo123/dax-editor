---
type: Spec
title: "S02.03: Define the four deterministic content profiles"
description: "Plan and evidence gates: Define the four deterministic content profiles."
tags: [implementation, creator-workflows, profiles]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S02.03
stage_id: S02
effort_days: [0.5, 0.75]
prerequisites: [S02.02]
execution_state: not_started
---

# S02.03: Define the four deterministic content profiles

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S02.02**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [packages/core/src/templates.ts](../../../packages/core/src/templates.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/timeline.ts](../../../packages/core/src/timeline.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/schema.ts](../../../packages/core/src/schema.ts) — existing baseline; inspect applicable package rules before editing.
- [templates/README.md](../../../templates/README.md) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Add proposed `content-profiles.ts` and data under `templates/profiles/` in the existing package; define strict IDs/versions, defaults, capability requirements and override validation.
2. Create Short, Full-length, Podcast and Educational profiles with the roadmap's editable output/caption/audio/cut defaults; preserve source frame rate where supported.
3. Separate recommended duration and structure from operations: targets cannot cut footage automatically, and meaningful educational pauses are preserved.
4. Resolve precedence deterministically as explicit item override→project override→pinned profile/template default; make reset targeted and reversible.
5. Validate profile data as untrusted input, with no executable code, filesystem paths, FFmpeg arguments or implicit asset downloads; retain licenses/provenance for supplied data.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Pure tests: each profile resolves stable output from identical inputs, override/reset behavior preserves unrelated fields and invalid versions/values fail clearly.
- No-LLM: applying defaults requires neither inference nor paid keys; absent transcript/music/logo produces requirements, not fabricated completed steps.
- Frame/format: fractional source rates and explicit project format overrides survive profile selection without silent normalization.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

If a profile requires an unavailable operation, retain the declared requirement and defer that step; do not implement an unrelated engine feature to make the gallery appear complete.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Four versioned profile definitions, schema/precedence tests and supported/default/deferred behavior table.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s02-04-capability-metadata.md). Planning-file creation itself does not satisfy this gate.

