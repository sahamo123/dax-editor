---
type: Roadmap
title: Master implementation index - stages and step gates
description: Canonical entry point for ten stages, seventy-six executable step specifications, selected routes and evidence-based advancement.
tags: [implementation, roadmap, index, goal]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
---

# Master implementation index

**Planning package for owner review; all application implementation is NOT_STARTED.** This handbook expands the [architecture review](../../specs/creator-platform-plan.md), source baseline `f05a57b99a2d184900ddd809a7480b30052ae5c1`, without implementing its features. Tracking: [planning issue #72](https://github.com/sahamo123/dax-editor/issues/72). Start from the latest published handbook continuation identified in [handoff](../../engineering/handoff.md); do not assume default main includes it.

## Inventory and how to use it

There are **100 Markdown files** here: **10 stage overviews +76 individual sub-stage/step specifications +5 navigation/control/review guides +8 operating records +1 generated index**. A sub-stage is one implementation step in this hierarchy; it has its own stable ID and file. The five guides are this master, execution contract, future goal, receipt template and review report. The eight operating records keep multi-day context, progress, handoff, decisions, pitfalls, errors, evidence and daily checkpoints together in this dated folder. [Generated index](index.md) is a catalogue maintained by docs:index; this master is the execution order. No extra runtime dependency, application code or model is installed by the plan.

1. Read [context](context.md), [current handoff](handoff.md) and [progress](progress.md), then review [the audit report](review-report.md), then [execution contract](execution-contract.md).
2. Declare the provisional capability/provider/client/machine matrix at launch/S00.01; S09 freezes and revalidates it. Choose a route and explicitly start the [future execution goal](execution-goal.md) only after review. Merely opening the goal file does not start implementation.
3. Read the current stage page and first eligible step. Recheck the predecessor's actual receipt and current source before proceeding; no failed/blocked required check may be bypassed.
4. Track actual work in scoped GitHub issues/PRs using the [receipt template](receipt-template.md). Page status records the publication baseline; it is not a live progress database.
5. After a checkpoint, refresh [handoff](handoff.md) and [progress](progress.md) from issue receipts; append [daily log](daily-log.md) and [evidence](evidence-log.md), record [errors/recovery](errors-and-recovery.md), [decisions](decisions.md) and [gotchas](gotchas.md). Keep raw logs in ignored `_local/`; do not commit media, keys or personal data.
6. At a stage boundary, verify every child receipt and stage acceptance before entering the next selected stage. At a route endpoint, report its exact evidence scope and stop.

## Route selection and effort

| Route | Stages / steps | Outcome | Engineering person-days |
|---|---|---|---|
| first-improvement | S00-S02 /21 | Workspace and profile development candidate; stop at S02.08 | 10-17 |
| desktop-creator | S00-S07 then S09 /68 | Full bounded desktop creator candidate and release adjudication; hosting excluded | 56-95 |
| full-hosted | S00-S09 /76 | Desktop plus personal single-user hosting | 64-109 |

These estimates include engineering tests/review fixes, not elapsed agent time. Reserve 30% uncertainty allowance and 5-10 additional technical-artist days for character assets; external gates can extend the schedule. The earlier 10-17-day estimate applies only to the first route, not all 76 steps. Required native validation blocks advancement when unavailable; no expectation that this laptop's Windows policy will be changed. Scope and external-machine authorization remain explicit.

## Stage overview

| Stage | Deliverable | Step files | Person-days |
|---|---|---:|---:|
| [S00](stage-00-baseline.md) | Baseline reconciliation and acceptance | 6 | 2-4 |
| [S01](stage-01-workspace.md) | Control-panel workflow and design contract | 7 | 4-7 |
| [S02](stage-02-profiles.md) | Content profiles and compatibility foundation | 8 | 4-6 |
| [S03](stage-03-composition.md) | Bounded layered composition | 9 | 10-16 |
| [S04](stage-04-long-form.md) | Long-form podcast and educational workflows | 8 | 8-14 |
| [S05](stage-05-reference-style.md) | Reference-style analysis and editable recipes | 7 | 7-12 |
| [S06](stage-06-characters.md) | Curated Blender characters and scene packs | 8 | 10-18 |
| [S07](stage-07-workflows.md) | Bounded specialist workflows and recovery | 7 | 5-8 |
| [S08](stage-08-hosting.md) | Optional private personal hosting | 8 | 8-14 |
| [S09](stage-09-release.md) | Compatibility performance and distribution gates | 8 | 6-10 |

Strict default execution is the ordered selected route. Explicit data prerequisites are in each page's frontmatter; the route predecessor also applies. Independent research may inform later plans, but it must not implement dependent features before gates pass. S09 entry is S07.07 for desktop and S08.08 when hosting was selected. Do not add S08 to desktop prerequisites by accident.

## S00: Baseline reconciliation and acceptance

Stage overview: [S00](stage-00-baseline.md). Read it before its first step.

- [S00.01: Verify the continuation and preserve the workspace](s00-01-baseline-evidence.md) - 0.25-0.5 engineer-days.
- [S00.02: Reconcile source and capability claims](s00-02-source-capability-reconciliation.md) - 0.25-0.5 engineer-days.
- [S00.03: Build the authorized acceptance fixture inventory](s00-03-authorized-fixtures.md) - 0.25-0.5 engineer-days.
- [S00.04: Establish measurable timing and resource budgets](s00-04-performance-budgets.md) - 0.5-1 engineer-days.
- [S00.05: Repeat the scoped source and offline editing baseline](s00-05-baseline-acceptance.md) - 0.5-1 engineer-days.
- [S00.06: Close the reconciled baseline and route its blockers](s00-06-baseline-close.md) - 0.25-0.5 engineer-days.

## S01: Control-panel workflow and design contract

Stage overview: [S01](stage-01-workspace.md). Read it before its first step.

- [S01.01: Audit the current rendered editing workflow](s01-01-workflow-audit.md) - 0.5-1 engineer-days.
- [S01.02: Record the product and design contract](s01-02-product-design-contract.md) - 0.5-0.75 engineer-days.
- [S01.03: Separate project setup from contextual inspection](s01-03-setup-inspector.md) - 0.75-1.25 engineer-days.
- [S01.04: Keep the preview usable across workspace sizes](s01-04-responsive-workspace.md) - 0.75-1.25 engineer-days.
- [S01.05: Preserve task and recovery controls in the new layout](s01-05-task-recovery-visibility.md) - 0.5-1 engineer-days.
- [S01.06: Complete keyboard and accessibility behavior](s01-06-accessibility.md) - 0.5-1 engineer-days.
- [S01.07: Verify browser and native workspace acceptance](s01-07-workspace-acceptance.md) - 0.5-0.75 engineer-days.

## S02: Content profiles and compatibility foundation

Stage overview: [S02](stage-02-profiles.md). Read it before its first step.

- [S02.01: Specify profiles and project compatibility](s02-01-profile-compatibility-contract.md) - 0.5-0.75 engineer-days.
- [S02.02: Implement safe project and history migration](s02-02-project-history-migration.md) - 0.5-0.75 engineer-days.
- [S02.03: Define the four deterministic content profiles](s02-03-content-profiles.md) - 0.5-0.75 engineer-days.
- [S02.04: Make template capability reporting truthful](s02-04-capability-metadata.md) - 0.5-0.75 engineer-days.
- [S02.05: Preview and commit a profile as one edit](s02-05-atomic-profile-application.md) - 0.5-0.75 engineer-days.
- [S02.06: Integrate the profile chooser and template gallery](s02-06-profile-gallery-ui.md) - 0.5-0.75 engineer-days.
- [S02.07: Verify profile contracts across all entry points](s02-07-profile-contract-acceptance.md) - 0.5-0.75 engineer-days.
- [S02.08: Close the first-improvement development candidate](s02-08-first-improvement-candidate.md) - 0.5-0.75 engineer-days.

## S03: Bounded layered composition

Stage overview: [S03](stage-03-composition.md). Read it before its first step.

- [S03.01: Decide the bounded composition and time-map contract](s03-01-composition-contract.md) - 1-1.5 engineer-days.
- [S03.02: Add versioned layers and preserve saved history](s03-02-layer-schema-persistence.md) - 1-1.5 engineer-days.
- [S03.03: Implement pure layer operations and anchoring](s03-03-layer-commands-anchoring.md) - 1-2 engineer-days.
- [S03.04: Render video and still layers through the shared engine](s03-04-layer-renderer.md) - 1-2 engineer-days.
- [S03.05: Add bounded keyframes and transitions](s03-05-keyframes-transitions.md) - 1-2 engineer-days.
- [S03.06: Compose alpha assets and supplied foreground mattes](s03-06-alpha-supplied-mattes.md) - 1-1.5 engineer-days.
- [S03.07: Expose layer lanes and contextual controls](s03-07-layer-workspace.md) - 1-1.5 engineer-days.
- [S03.08: Declare and verify interactive and rendered coverage](s03-08-preview-review-coverage.md) - 1.5-2 engineer-days.
- [S03.09: Close layered composition with measured output](s03-09-composition-acceptance.md) - 1.5-2 engineer-days.

## S04: Long-form podcast and educational workflows

Stage overview: [S04](stage-04-long-form.md). Read it before its first step.

- [S04.01: Specify long-form workflows and expand fixtures](s04-01-long-form-contract-fixtures.md) - 1-1.5 engineer-days.
- [S04.02: Add chapters, markers and transcript navigation](s04-02-chapters-markers-navigation.md) - 1-1.5 engineer-days.
- [S04.03: Bound long-project views and derived-media work](s04-03-long-timeline-bounds.md) - 1-2 engineer-days.
- [S04.04: Build slide scenes and educational layouts](s04-04-slides-educational-layouts.md) - 1-1.5 engineer-days.
- [S04.05: Add manual camera alignment and switching](s04-05-manual-camera-sync.md) - 1-2 engineer-days.
- [S04.06: Add speaker labels and reviewed highlight proposals](s04-06-speakers-reviewed-highlights.md) - 1-1.5 engineer-days.
- [S04.07: Measure long-session synchronization and resources](s04-07-long-session-acceptance.md) - 1-2 engineer-days.
- [S04.08: Close podcast and educational workflow acceptance](s04-08-long-form-close.md) - 1-2 engineer-days.

## S05: Reference-style analysis and editable recipes

Stage overview: [S05](stage-05-reference-style.md). Read it before its first step.

- [S05.01: Bound the reference-style feasibility decision](s05-01-reference-feasibility.md) - 2-2 engineer-days.
- [S05.02: Define evidence and recipe contracts](s05-02-reference-contracts.md) - 0.5-1 engineer-days.
- [S05.03: Acquire and cache bounded local samples](s05-03-reference-sampling.md) - 1-2 engineer-days.
- [S05.04: Extract deterministic style evidence](s05-04-reference-measurements.md) - 1-2 engineer-days.
- [S05.05: Compile recipes and render comparison previews](s05-05-reference-preview.md) - 0.5-1 engineer-days.
- [S05.06: Add editable reference review and apply controls](s05-06-reference-workflow.md) - 1-2 engineer-days.
- [S05.07: Close reference-style quality and compatibility](s05-07-reference-close.md) - 1-2 engineer-days.

## S06: Curated Blender characters and scene packs

Stage overview: [S06](stage-06-characters.md). Read it before its first step.

- [S06.01: Qualify three curated character and scene packs](s06-01-character-intake.md) - 1-2 engineer-days.
- [S06.02: Version bounded character recipes and provenance](s06-02-character-contracts.md) - 1-2 engineer-days.
- [S06.03: Harden owned Blender process execution](s06-03-character-process-limits.md) - 2-3 engineer-days.
- [S06.04: Render curated opaque draft and full scenes](s06-04-character-draft-scenes.md) - 1-2 engineer-days.
- [S06.05: Preserve alpha through character composition](s06-05-character-alpha.md) - 1-2 engineer-days.
- [S06.06: Commit and regenerate character assets atomically](s06-06-character-regeneration.md) - 1-2 engineer-days.
- [S06.07: Expose bounded character configuration and review](s06-07-character-configurator.md) - 1-2 engineer-days.
- [S06.08: Accept curated character rendering across targets](s06-08-character-close.md) - 2-3 engineer-days.

## S07: Bounded specialist workflows and recovery

Stage overview: [S07](stage-07-workflows.md). Read it before its first step.

- [S07.01: Define bounded workflow and journal semantics](s07-01-workflow-contract.md) - 0.5-1 engineer-days.
- [S07.02: Persist journal and idempotent mutation receipts](s07-02-workflow-journal.md) - 1-1.5 engineer-days.
- [S07.03: Execute dependencies and recover interrupted work](s07-03-workflow-coordinator.md) - 1-1.5 engineer-days.
- [S07.04: Admit all expensive work under one resource budget](s07-04-resource-admission.md) - 1-1.5 engineer-days.
- [S07.05: Wire restricted specialist roles to existing capabilities](s07-05-specialist-adapters.md) - 0.5-1 engineer-days.
- [S07.06: Expose workflow trace and live-client controls](s07-06-workflow-trace.md) - 0.5-0.75 engineer-days.
- [S07.07: Accept workflow recovery and actual clients](s07-07-workflow-close.md) - 0.5-0.75 engineer-days.

## S08: Optional private personal hosting

Stage overview: [S08](stage-08-hosting.md). Read it before its first step.

- [S08.01: Define the optional personal-host trust boundary](s08-01-host-threat-model.md) - 1-2 engineer-days.
- [S08.02: Resolve portable assets and collect projects](s08-02-portable-assets.md) - 1-2 engineer-days.
- [S08.03: Implement single-owner authenticated gateway sessions](s08-03-owner-gateway.md) - 1-2 engineer-days.
- [S08.04: Scope remote media and isolate native workers](s08-04-host-media-boundaries.md) - 1-2 engineer-days.
- [S08.05: Package a pinned private single-owner deployment](s08-05-private-deployment.md) - 1-1.5 engineer-days.
- [S08.06: Recover browser sessions and task controls remotely](s08-06-host-reconnect.md) - 1-1.5 engineer-days.
- [S08.07: Verify quotas backup restore and workspace recovery](s08-07-host-recovery.md) - 1-1.5 engineer-days.
- [S08.08: Accept personal hosting and desktop parity](s08-08-host-close.md) - 1-1.5 engineer-days.

## S09: Compatibility performance and distribution gates

Stage overview: [S09](stage-09-release.md). Read it before its first step.

- [S09.01: Freeze selected release scope and evidence requirements](s09-01-release-scope.md) - 0.5-1 engineer-days.
- [S09.02: Validate source compatibility and decoded media](s09-02-release-source-media.md) - 1-1.5 engineer-days.
- [S09.03: Verify offline AI and selected providers and clients](s09-03-release-ai-clients.md) - 0.5-1 engineer-days.
- [S09.04: Validate the exact packaged native candidate](s09-04-release-native-install.md) - 1-1.5 engineer-days.
- [S09.05: Verify cross-version upgrades and data preservation](s09-05-release-upgrade.md) - 1-1.5 engineer-days.
- [S09.06: Verify native accessibility and whole-app endurance](s09-06-release-performance.md) - 1-1.5 engineer-days.
- [S09.07: Prepare verified package provenance and transfer](s09-07-release-provenance.md) - 0.5-1 engineer-days.
- [S09.08: Adjudicate readiness and hand off exact release scope](s09-08-release-adjudication.md) - 0.5-1 engineer-days.

## Boundaries and completion

Optional hosted model connections remain optional; configured, mock-tested, tool-probed and actual-edit evidence are different. Original media, model/runtime caches and credential state do not travel through Git. New architectural work needs its stage spec/ADR and current source inspection. No unrestricted Blender scripts, automatic likeness/voice generation, professional editor parity, public multi-tenancy or remote publishing is implied.

See [current STATUS](../../STATUS.md) for application evidence and [laptop continuation](../../engineering/laptop-continuation.md) for setup. The [review report](review-report.md) certifies the completeness/checking of this planning pack only. Execution readiness still begins with S00.01, current authorization and the predecessor-evidence contract.
