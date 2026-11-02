# 2026-11-01-creator-editor

## Documents

* [Dated project context and scope](context.md) - Stable project facts, scope choices, evidence boundaries and reading order for the multi-day creator-editor work.
* [Daily work and handoff journal](daily-log.md) - Append-only session journal for completed work, pending actions, source revisions and next-step handoffs across multiple days.
* [Decision register and open scope choices](decisions.md) - Records planning choices, unresolved implementation decisions and their required ADR or owner-review evidence.
* [Error ledger and recovery actions](errors-and-recovery.md) - Known historical risks, new incident recording fields and safe recovery rules without fabricated runtime failures or hidden retries.
* [Evidence and verification log](evidence-log.md) - Public index of planning and future implementation verification, linked to private raw logs with precise source and environment scope.
* [Execution contract - verify before advancing](execution-contract.md) - Required predecessor checks, evidence states, safe recovery and completion rules for executing the staged implementation plan.
* [Future execution goal - launch only after review](execution-goal.md) - Copyable agent-neutral goal prompt, route selection and stopping rules for executing the handbook after owner review.
* [Gotchas and prevention checklist](gotchas.md) - Source-grounded pitfalls, symptoms, prevention and verification links for multi-day implementation work.
* [Current dated handoff and exact next action](handoff.md) - Current planning versus implementation state, resumable next action, blockers and files to read before continuing.
* [Master implementation index - stages and step gates](master-plan.md) - Canonical entry point for ten stages, seventy-six executable step specifications, selected routes and evidence-based advancement.
* [Implementation progress snapshot](progress.md) - Dated mirror of implementation step status with issue and evidence references, initially zero completed steps.
* [Implementation receipt and predecessor double-check](receipt-template.md) - Evidence fields and two-pass review checklist required to verify one implementation step and unlock its successor.
* [Planning review report - completeness and execution boundaries](review-report.md) - Inventory, independent review findings and deterministic verification for the staged implementation handbook, distinct from application acceptance.
* [S00.01: Verify the continuation and preserve the workspace](s00-01-baseline-evidence.md) - Plan and evidence gates: Verify the continuation and preserve the workspace.
* [S00.01 execution baseline receipt](s00-01-receipt.md) - Evidence and scope for the first-improvement execution baseline, including private project preservation and remaining acceptance boundaries.
* [S00.02 capability reconciliation receipt](s00-02-receipt.md) - Source-backed reconciliation of transcript, template and history behavior and the associated checks and limitations.
* [S00.02: Reconcile source and capability claims](s00-02-source-capability-reconciliation.md) - Plan and evidence gates: Reconcile source and capability claims.
* [S00.03: Build the authorized acceptance fixture inventory](s00-03-authorized-fixtures.md) - Plan and evidence gates: Build the authorized acceptance fixture inventory.
* [S00.03 acceptance fixture inventory and receipt](s00-03-fixtures.md) - Regeneration instructions, coverage and rights boundaries for synthetic and private real-media acceptance fixtures.
* [S00.04: Establish measurable timing and resource budgets](s00-04-performance-budgets.md) - Plan and evidence gates: Establish measurable timing and resource budgets.
* [S00.04 performance budgets and baseline receipt](s00-04-performance.md) - Reproducible short browser measurements, proposed targets and resource-monitoring procedures with native and long-session limitations.
* [S00.05: Repeat the scoped source and offline editing baseline](s00-05-baseline-acceptance.md) - Plan and evidence gates: Repeat the scoped source and offline editing baseline.
* [S00.05 fresh offline editing baseline receipt](s00-05-offline-baseline.md) - Fresh browser and isolated manual editing evidence, export decoding, errors and native acceptance boundaries.
* [S00.06: Close the reconciled baseline and route its blockers](s00-06-baseline-close.md) - Plan and evidence gates: Close the reconciled baseline and route its blockers.
* [S00.06 baseline-stage review and external gates](s00-06-stage-review.md) - Consolidated first-stage evidence, independent review status and remaining release or environment gates.
* [S01.01 rendered workspace audit receipt](s01-01-audit-receipt.md) - Browser-observed editing workflow, prioritized usability findings and design direction for the first-improvement route.
* [Reproduce the S01.01 synthetic workspace audit](s01-01-reproduce-audit.md) - Portable procedure and test harness for recapturing the browser audit without uploading private screenshots.
* [S01.01: Audit the current rendered editing workflow](s01-01-workflow-audit.md) - Plan and evidence gates: Audit the current rendered editing workflow.
* [S01.02 product and workspace contract receipt](s01-02-contract-receipt.md) - Entry checks, design decisions, verification and handoff for the proposed first-improvement workspace contract.
* [S01.02: Record the product and design contract](s01-02-product-design-contract.md) - Plan and evidence gates: Record the product and design contract.
* [S01.03: Separate project setup from contextual inspection](s01-03-setup-inspector.md) - Plan and evidence gates: Separate project setup from contextual inspection.
* [S01.03 setup and contextual inspector receipt](s01-03-setup-receipt.md) - Evidence and outstanding checks for the skippable setup and contextual-inspector workspace slice.
* [S01.04 preview and panel sizing child receipt](s01-04-preview-child-receipt.md) - Evidence for the first reviewable responsive workspace slice.
* [S01.04 responsive workspace receipt](s01-04-responsive-receipt.md) - Implementation and evidence for the resizable desktop workspace.
* [S01.04: Keep the preview usable across workspace sizes](s01-04-responsive-workspace.md) - Plan and evidence gates: Keep the preview usable across workspace sizes.
* [S01.05 narrow composer and recovery child receipt](s01-05-composer-receipt.md) - Browser evidence and verification status for the first task-visibility slice.
* [S01.05 task failure and autosave recovery child receipt](s01-05-failure-receipt.md) - Findings, synthetic recovery evidence and pending verification for task status visibility.
* [S01.05 recovery acceptance child receipt](s01-05-recovery-acceptance-receipt.md) - Synthetic export, missing media and hidden assistant recovery acceptance evidence.
* [S01.05 chat shutdown recovery child receipt](s01-05-shutdown-receipt.md) - Reproduction and validation of task persistence when a chat runner outlives shutdown.
* [S01.05 state refresh ordering child receipt](s01-05-state-ordering-receipt.md) - Reproduction and verification of stale desktop state handling.
* [S01.05 task and recovery completion receipt](s01-05-task-recovery-receipt.md) - Reconciled implementation, synthetic verification, private evidence identities and remaining boundaries for S01.05.
* [S01.05: Preserve task and recovery controls in the new layout](s01-05-task-recovery-visibility.md) - Plan and evidence gates: Preserve task and recovery controls in the new layout.
* [S01.06 accessibility audit and implementation receipt](s01-06-accessibility-audit-receipt.md) - Entry check, work log and evidence for keyboard, contrast, motion and assistive-technology acceptance.
* [S01.06: Complete keyboard and accessibility behavior](s01-06-accessibility.md) - Plan and evidence gates: Complete keyboard and accessibility behavior.
* [S01.06 chat attachment preflight](s01-06-attachment-preflight.md) - Prevent locally detectable invalid chat selections from staging earlier files.
* [S01.06 audit reconciliation receipt](s01-06-audit-reconciliation-receipt.md) - Published accessibility child fixes, limited contrast audit and remaining acceptance gates.
* [S01.06 batched notice announcements](s01-06-batched-announcements-receipt.md) - Reproduction, scoped live-region batching fix and current verification boundaries.
* [S01.06 bridge probe error classification](s01-06-bridge-probe-errors.md) - Distinguish unsuccessful CLI capability probes from verified missing options without relaxing restrictions.
* [S01.06 typed cancellation foundation](s01-06-cancellation-foundation-receipt.md) - Evidence and compatibility boundary for core, protocol and local-model cancellation identity.
* [S01.06 chat attachment recovery](s01-06-chat-attachment-recovery.md) - Preserve unsent drafts after attachment staging fails without replaying an uncertain edit.
* [S01.06 chat submission context guard](s01-06-chat-context-guard.md) - Evidence for rejecting stale project and provider contexts during attachment staging.
* [S01.06 intermittent chat submission investigation](s01-06-chat-submission-investigation.md) - Evidence separating an unsent synthetic chat prompt from a test-teardown disconnect and the remaining diagnosis.
* [S01.06 dialog notice placement](s01-06-dialog-notices-receipt.md) - Reproduction, in-dialog notification placement, validation and native accessibility boundaries.
* [S01.06 modal shortcut isolation receipt](s01-06-dialog-shortcuts-receipt.md) - Reproduction and verification for keeping project shortcuts outside active modal dialogs.
* [Engine test fixture typecheck repair](s01-06-engine-test-fixtures-receipt.md) - Evidence for correcting invalid project session fixtures without changing production code or compiler settings.
* [S01.06 export focus child receipt](s01-06-export-focus-receipt.md) - Reproduction and verification of stable keyboard focus while an export runs.
* [S01.06 history contrast child receipt](s01-06-history-contrast-receipt.md) - Rendered history contrast measurements, branch labels and verification.
* [S01.06 cancellation outcome investigation](s01-06-job-cancellation-investigation.md) - Reproduction of task cancellation as an urgent job error and the remaining typed-contract work.
* [S01.06 recovered job outcome notices](s01-06-job-snapshot-notices-receipt.md) - Reproduction and verification of job completion and failure notices recovered from snapshots.
* [S01.06 live accessibility and export announcements](s01-06-live-announcement-receipt.md) - Partial keyboard and Narrator observations, export announcement changes, and remaining acceptance evidence.
* [S01.06 locally initiated job outcomes](s01-06-local-job-outcomes-receipt.md) - Reproduction, bounded reconciliation and verification of locally initiated jobs first observed terminal.
* [S01.06 media card action layout](s01-06-media-actions-receipt.md) - Regression evidence for readable and usable media-card controls at two viewport widths.
* [S01.06 modal shortcut protection after focus loss](s01-06-modal-focus-loss-receipt.md) - Reproduced background project edits while a modal is open, scoped guard and focus-containment follow-up.
* [S01.06 modal focus recovery](s01-06-modal-focus-recovery-receipt.md) - Reproduction, scoped recovery, verification and remaining native acceptance for active dialogs.
* [Modal task announcement accessibility-tree audit](s01-06-modal-live-region-receipt.md) - Synthetic Edge accessibility-tree evidence and remaining real assistive-technology acceptance.
* [S01.06 native accessibility acceptance handoff](s01-06-native-acceptance-receipt.md) - Exact computer-use access blocker, safe restart and remaining keyboard and Narrator evidence.
* [S01.06 non-export job outcome notices](s01-06-non-export-outcomes-receipt.md) - Reproduction, reconciliation and verification for speech, motion and local-model job outcomes.
* [Bounded task notification bursts](s01-06-notice-burst-receipt.md) - Reproduction, bounded queue candidate, verification and rendered-preview follow-up.
* [Notification keyboard focus and contrast samples](s01-06-notice-focus-receipt.md) - Rendered keyboard focus, text contrast, geometry and overflow samples in synthetic Settings dialogs.
* [Task notice reading time](s01-06-notice-reading-time-receipt.md) - Reproduction, scoped timer pause, browser evidence and remaining notice-eviction and accessibility gates.
* [S01.06 timeline overlay label contrast](s01-06-overlay-label-contrast-receipt.md) - Reproduced timeline label contrast gaps, scoped fix and verification limits.
* [S01.06 contextual panel contrast](s01-06-panel-contrast-receipt.md) - Measured media, settings and assistant tool text against rendered backgrounds, with scope and remaining issues.
* [Rendered-preview browser lifecycle investigation](s01-06-preview-lifecycle-receipt.md) - Scoped timeout reproduction, teardown ordering, full-size render timings and browser test correction.
* [S01.06 primary-button contrast child receipt](s01-06-primary-contrast-receipt.md) - Rendered primary-button contrast measurements and verification.
* [S01.06 reduced-motion child receipt](s01-06-reduced-motion-receipt.md) - Reproduction and verification for reduced-motion editor controls and working feedback.
* [S01.06 review progress announcement child receipt](s01-06-review-announcement-receipt.md) - Reproduction and verification for accessible rendered-review progress.
* [S01.06 setup and task-error contrast receipt](s01-06-setup-error-contrast-receipt.md) - Rendered large and normal text contrast measurements on composed surfaces.
* [S01.06 side-panel keyboard access](s01-06-side-panel-accessibility-receipt.md) - Reproduced tab-panel navigation gaps, scoped fix and browser and source verification.
* [S01.06 staged attachment investigation](s01-06-staged-attachment-investigation.md) - Generated-media evidence of retained staged files and conservative cleanup design boundaries.
* [S01.06 suggestion draft preservation](s01-06-suggestion-draft-receipt.md) - Reproduction, scoped composer change and validation for preserving an unrelated draft.
* [S01.06 disclosure keyboard activation](s01-06-summary-keyboard.md) - Preserve native Project and Work status disclosure keys without triggering playback.
* [S01.06 task cancellation names receipt](s01-06-task-cancel-receipt.md) - Reproduction and verification for distinguishable task cancellation controls.
* [S01.06 task-state labels receipt](s01-06-task-state-receipt.md) - Synthetic browser evidence that task states have text labels independent of color.
* [S01.06 timeline keyboard interaction](s01-06-timeline-keyboard-receipt.md) - Scoped listbox navigation, focus recovery, shortcut changes and verification evidence.
* [S01.06 timeline keyboard semantics investigation](s01-06-timeline-semantics-investigation.md) - Rendered evidence of conflicting timeline listbox semantics and editing shortcuts, with unresolved design constraints.
* [S01.06 typed cancellation candidate](s01-06-typed-cancellation-receipt.md) - Current evidence, compatibility limits and pending checks for typed cancellation outcomes.
* [S01.07: Verify browser and native workspace acceptance](s01-07-workspace-acceptance.md) - Plan and evidence gates: Verify browser and native workspace acceptance.
* [S02.01: Specify profiles and project compatibility](s02-01-profile-compatibility-contract.md) - Plan and evidence gates: Specify profiles and project compatibility.
* [S02.02: Implement safe project and history migration](s02-02-project-history-migration.md) - Plan and evidence gates: Implement safe project and history migration.
* [S02.03: Define the four deterministic content profiles](s02-03-content-profiles.md) - Plan and evidence gates: Define the four deterministic content profiles.
* [S02.04: Make template capability reporting truthful](s02-04-capability-metadata.md) - Plan and evidence gates: Make template capability reporting truthful.
* [S02.05: Preview and commit a profile as one edit](s02-05-atomic-profile-application.md) - Plan and evidence gates: Preview and commit a profile as one edit.
* [S02.06: Integrate the profile chooser and template gallery](s02-06-profile-gallery-ui.md) - Plan and evidence gates: Integrate the profile chooser and template gallery.
* [S02.07: Verify profile contracts across all entry points](s02-07-profile-contract-acceptance.md) - Plan and evidence gates: Verify profile contracts across all entry points.
* [S02.08: Close the first-improvement development candidate](s02-08-first-improvement-candidate.md) - Plan and evidence gates: Close the first-improvement development candidate.
* [S03.01: Decide the bounded composition and time-map contract](s03-01-composition-contract.md) - Plan and evidence gates: Decide the bounded composition and time-map contract.
* [S03.02: Add versioned layers and preserve saved history](s03-02-layer-schema-persistence.md) - Plan and evidence gates: Add versioned layers and preserve saved history.
* [S03.03: Implement pure layer operations and anchoring](s03-03-layer-commands-anchoring.md) - Plan and evidence gates: Implement pure layer operations and anchoring.
* [S03.04: Render video and still layers through the shared engine](s03-04-layer-renderer.md) - Plan and evidence gates: Render video and still layers through the shared engine.
* [S03.05: Add bounded keyframes and transitions](s03-05-keyframes-transitions.md) - Plan and evidence gates: Add bounded keyframes and transitions.
* [S03.06: Compose alpha assets and supplied foreground mattes](s03-06-alpha-supplied-mattes.md) - Plan and evidence gates: Compose alpha assets and supplied foreground mattes.
* [S03.07: Expose layer lanes and contextual controls](s03-07-layer-workspace.md) - Plan and evidence gates: Expose layer lanes and contextual controls.
* [S03.08: Declare and verify interactive and rendered coverage](s03-08-preview-review-coverage.md) - Plan and evidence gates: Declare and verify interactive and rendered coverage.
* [S03.09: Close layered composition with measured output](s03-09-composition-acceptance.md) - Plan and evidence gates: Close layered composition with measured output.
* [S04.01: Specify long-form workflows and expand fixtures](s04-01-long-form-contract-fixtures.md) - Plan and evidence gates: Specify long-form workflows and expand fixtures.
* [S04.02: Add chapters, markers and transcript navigation](s04-02-chapters-markers-navigation.md) - Plan and evidence gates: Add chapters, markers and transcript navigation.
* [S04.03: Bound long-project views and derived-media work](s04-03-long-timeline-bounds.md) - Plan and evidence gates: Bound long-project views and derived-media work.
* [S04.04: Build slide scenes and educational layouts](s04-04-slides-educational-layouts.md) - Plan and evidence gates: Build slide scenes and educational layouts.
* [S04.05: Add manual camera alignment and switching](s04-05-manual-camera-sync.md) - Plan and evidence gates: Add manual camera alignment and switching.
* [S04.06: Add speaker labels and reviewed highlight proposals](s04-06-speakers-reviewed-highlights.md) - Plan and evidence gates: Add speaker labels and reviewed highlight proposals.
* [S04.07: Measure long-session synchronization and resources](s04-07-long-session-acceptance.md) - Plan and evidence gates: Measure long-session synchronization and resources.
* [S04.08: Close podcast and educational workflow acceptance](s04-08-long-form-close.md) - Plan and evidence gates: Close podcast and educational workflow acceptance.
* [S05.01: Bound the reference-style feasibility decision](s05-01-reference-feasibility.md) - Execute S05.01 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S05.02: Define evidence and recipe contracts](s05-02-reference-contracts.md) - Execute S05.02 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S05.03: Acquire and cache bounded local samples](s05-03-reference-sampling.md) - Execute S05.03 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S05.04: Extract deterministic style evidence](s05-04-reference-measurements.md) - Execute S05.04 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S05.05: Compile recipes and render comparison previews](s05-05-reference-preview.md) - Execute S05.05 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S05.06: Add editable reference review and apply controls](s05-06-reference-workflow.md) - Execute S05.06 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S05.07: Close reference-style quality and compatibility](s05-07-reference-close.md) - Execute S05.07 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S06.01: Qualify three curated character and scene packs](s06-01-character-intake.md) - Execute S06.01 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S06.02: Version bounded character recipes and provenance](s06-02-character-contracts.md) - Execute S06.02 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S06.03: Harden owned Blender process execution](s06-03-character-process-limits.md) - Execute S06.03 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S06.04: Render curated opaque draft and full scenes](s06-04-character-draft-scenes.md) - Execute S06.04 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S06.05: Preserve alpha through character composition](s06-05-character-alpha.md) - Execute S06.05 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S06.06: Commit and regenerate character assets atomically](s06-06-character-regeneration.md) - Execute S06.06 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S06.07: Expose bounded character configuration and review](s06-07-character-configurator.md) - Execute S06.07 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S06.08: Accept curated character rendering across targets](s06-08-character-close.md) - Execute S06.08 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S07.01: Define bounded workflow and journal semantics](s07-01-workflow-contract.md) - Execute S07.01 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S07.02: Persist journal and idempotent mutation receipts](s07-02-workflow-journal.md) - Execute S07.02 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S07.03: Execute dependencies and recover interrupted work](s07-03-workflow-coordinator.md) - Execute S07.03 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S07.04: Admit all expensive work under one resource budget](s07-04-resource-admission.md) - Execute S07.04 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S07.05: Wire restricted specialist roles to existing capabilities](s07-05-specialist-adapters.md) - Execute S07.05 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S07.06: Expose workflow trace and live-client controls](s07-06-workflow-trace.md) - Execute S07.06 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S07.07: Accept workflow recovery and actual clients](s07-07-workflow-close.md) - Execute S07.07 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S08.01: Define the optional personal-host trust boundary](s08-01-host-threat-model.md) - Execute S08.01 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S08.02: Resolve portable assets and collect projects](s08-02-portable-assets.md) - Execute S08.02 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S08.03: Implement single-owner authenticated gateway sessions](s08-03-owner-gateway.md) - Execute S08.03 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S08.04: Scope remote media and isolate native workers](s08-04-host-media-boundaries.md) - Execute S08.04 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S08.05: Package a pinned private single-owner deployment](s08-05-private-deployment.md) - Execute S08.05 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S08.06: Recover browser sessions and task controls remotely](s08-06-host-reconnect.md) - Execute S08.06 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S08.07: Verify quotas backup restore and workspace recovery](s08-07-host-recovery.md) - Execute S08.07 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S08.08: Accept personal hosting and desktop parity](s08-08-host-close.md) - Execute S08.08 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S09.01: Freeze selected release scope and evidence requirements](s09-01-release-scope.md) - Execute S09.01 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S09.02: Validate source compatibility and decoded media](s09-02-release-source-media.md) - Execute S09.02 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S09.03: Verify offline AI and selected providers and clients](s09-03-release-ai-clients.md) - Execute S09.03 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S09.04: Validate the exact packaged native candidate](s09-04-release-native-install.md) - Execute S09.04 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S09.05: Verify cross-version upgrades and data preservation](s09-05-release-upgrade.md) - Execute S09.05 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S09.06: Verify native accessibility and whole-app endurance](s09-06-release-performance.md) - Execute S09.06 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S09.07: Prepare verified package provenance and transfer](s09-07-release-provenance.md) - Execute S09.07 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [S09.08: Adjudicate readiness and hand off exact release scope](s09-08-release-adjudication.md) - Execute S09.08 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
* [Save-as recovery verification receipt](save-as-recovery-receipt.md) - Synthetic recovery checks, limitations and pending review for project save-as.
* [S00: Baseline reconciliation and acceptance](stage-00-baseline.md) - Reconciled source facts, authorized fixture inventory, reproducible performance budgets and current scoped baseline evidence.
* [S01: Control-panel workflow and design contract](stage-01-workspace.md) - Documented incumbent design system and an accessible setup, assistant, preview, inspector and timeline workflow.
* [S02: Content profiles and compatibility foundation](stage-02-profiles.md) - Four deterministic content profiles with truthful capability reporting, explicit override precedence, migration and one-undo application.
* [S03: Bounded layered composition](stage-03-composition.md) - Versioned video/still layers, bounded transforms/transitions, supplied-matte alpha composition, manual controls and measured review/export coverage.
* [S04: Long-form podcast and educational workflows](stage-04-long-form.md) - Chapters/markers, bounded long-project views, slide scenes, manual camera alignment, speaker labels and reviewed highlights validated on long sessions.
* [S05: Reference-style analysis and editable recipes](stage-05-reference-style.md) - Ordered S05 execution steps with explicit dependencies, resource needs and acceptance gates.
* [S06: Curated Blender characters and scene packs](stage-06-characters.md) - Ordered S06 execution steps with explicit dependencies, resource needs and acceptance gates.
* [S07: Bounded specialist workflows and recovery](stage-07-workflows.md) - Ordered S07 execution steps with explicit dependencies, resource needs and acceptance gates.
* [S08: Optional private personal hosting](stage-08-hosting.md) - Ordered S08 execution steps with explicit dependencies, resource needs and acceptance gates.
* [S09: Compatibility performance and distribution gates](stage-09-release.md) - Ordered S09 execution steps with explicit dependencies, resource needs and acceptance gates.
* [Windows atomic write sharing investigation](windows-sharing-investigation.md) - Controlled Windows file-lock evidence for atomic-write failures and safe recovery boundaries.
