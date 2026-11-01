---
type: Spec
title: "S03.08: Declare and verify interactive and rendered coverage"
description: "Plan and evidence gates: Declare and verify interactive and rendered coverage."
tags: [implementation, creator-workflows, composition]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S03.08
stage_id: S03
effort_days: [1.5, 2]
prerequisites: [S03.07, S03.04, S03.05, S03.06]
execution_state: not_started
---

# S03.08: Declare and verify interactive and rendered coverage

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S03.07, S03.04, S03.05, S03.06**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [apps/desktop/src/editor/preview/PreviewPane.tsx](../../../apps/desktop/src/editor/preview/PreviewPane.tsx) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/editor/preview/RenderedReview.tsx](../../../apps/desktop/src/editor/preview/RenderedReview.tsx) — existing baseline; inspect applicable package rules before editing.
- [apps/desktop/src/editor/playback/engine.ts](../../../apps/desktop/src/editor/playback/engine.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/server/src/render-preview.test.ts](../../../packages/server/src/render-preview.test.ts) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Define coverage per composition feature: exact interactive, approximate interactive or rendered-review-only; show actionable coverage rather than silently omitting effects.
2. Implement the agreed bounded interactive subset using the existing playback/controller seam, keeping playhead, audio master and source mapping consistent.
3. Render authoritative review through the same composition compiler as export and preserve authenticated Range serving, private output ownership and revision invalidation.
4. Test stale renders, late completion after cancellation, project switches, failed decode and retry without changing project history.
5. Compare interactive/review/export sample frames and audio at named timeline timestamps, documenting tolerances and browser/native codec differences.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Coverage: every new layer/keyframe/transition/alpha case has an explicit observed status; exact parity is claimed only for measured cases.
- Review: stale revision/project results cannot play as current; cancel/retry and cleanup remain correct and review adds no history entry.
- Output: review/export use matching composition semantics and measured frames/audio agree within declared encoding tolerance.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

A feature with unverified interactive parity must remain visibly approximate or review-only, but a required authoritative review failure blocks completion. Never substitute a successful export command for playable reviewed output.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Feature coverage matrix, matched frame/audio comparisons, revision/cancellation/security tests and codec/platform boundaries.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s03-09-composition-acceptance.md). Planning-file creation itself does not satisfy this gate.
