---
type: Spec
title: "S03.06: Compose alpha assets and supplied foreground mattes"
description: "Plan and evidence gates: Compose alpha assets and supplied foreground mattes."
tags: [implementation, creator-workflows, composition]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S03.06
stage_id: S03
effort_days: [1, 1.5]
prerequisites: [S03.05, S03.04]
execution_state: not_started
---

# S03.06: Compose alpha assets and supplied foreground mattes

Planning is drafted; implementation is **NOT_STARTED**. Effort is engineering person-days, including verification.

## Entry gate

Read the [execution contract](execution-contract.md) and [master](master-plan.md). Required predecessor/dependency receipts: **S03.05, S03.04**. Reopen each receipt, inspect its commit and artifacts, and rerun focused regressions when changed or stale evidence warrants it before editing; a checked box is insufficient.

Any missing, failed or stale required evidence blocks entry; do not advance the selected route while blocked.

## Source anchors

- [packages/core/src/render.ts](../../../packages/core/src/render.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/media.ts](../../../packages/core/src/media.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/core/src/image-render.test.ts](../../../packages/core/src/image-render.test.ts) — existing baseline; inspect applicable package rules before editing.
- [packages/server/src/media-pipeline.ts](../../../packages/server/src/media-pipeline.ts) — existing baseline; inspect applicable package rules before editing.

## Implementation actions

1. Implement the agreed straight/premultiplied alpha conversion and verified alpha-preserving intermediate path; ordinary opaque MP4 is not an alpha source.
2. Probe and validate supplied cutouts/mattes for dimensions, duration, frame/time alignment and declared interpretation before composition.
3. Build the explicit original-footage→text→synchronized foreground example using existing layer commands; moving text under opaque video alone cannot produce behind-person text.
4. Preserve alpha in derived/review paths where required or flatten only at the declared final composition boundary; document any browser-proxy limitation.
5. Use deterministic gradient-edge and moving-matte fixtures over light/dark backgrounds; retain user assets and show actionable unsupported-codec/misalignment errors.

Keep issue/PR slices near 1–3 engineering days and normally below 400 changed lines; split further without changing this gate.

## Verification

- Edges: sampled alpha ramps and light/dark composites meet declared tolerance without black/white halos or accidental opaque backgrounds.
- Synchronization: moving foreground remains aligned after trim/ripple and fractional-fps rendering; behind-person text occludes only at the supplied matte.
- Safety: malformed/unavailable alpha formats fail clearly, source media is unchanged and no automatic segmentation/model claim is made.
- Apply the root definition of done for changed code; reuse valid unchanged evidence only per the execution contract. Run focused/new mandatory checks, explain reused evidence and record actual results/skips; S00.05 owns the fresh full baseline.

## Failure and recovery

An alpha channel dropped by proxy/codec or a mismatched matte blocks the affected feature. Keep originals and provide an explicit supported input conversion/review path without pretending automatic matting exists.

Preserve original projects/history and captured failure logs. Stop only owned jobs safely; never change machine security, discard user edits or relabel an unrun check as passed.

## Completion and next step

Complete the [receipt](receipt-template.md) with: Alpha format/convention matrix, light/dark edge measurements, synchronized matte example and unsupported-input results.

Include implementation commit, issue/PR, recorded predecessor evidence recheck, commands/exit codes, artifact hashes, remaining risks and rollback/recovery instructions. Mark complete only when every required check passes.
Then perform a fresh evidence recheck of this receipt before [the next step](s03-07-layer-workspace.md). Planning-file creation itself does not satisfy this gate.

