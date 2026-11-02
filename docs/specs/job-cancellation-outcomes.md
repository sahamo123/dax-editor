---
type: Spec
title: Typed background job cancellation outcomes
description: Backward-compatible cancellation identity from command execution through job status, task tracking and desktop notices.
tags: [tasks, cancellation, compatibility, accessibility]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T16:10:00Z
---

# Typed background job cancellation outcomes

## Problem

[#251](https://github.com/sahamo123/dax-editor/issues/251) reproduces explicit speech and export cancellation as error-shaped jobs. The server currently interprets the literal error message `Cancelled` as a cancelled task, while the desktop announces it as an urgent error. The core command wrapper converts exceptions to untyped messages. An unrelated failure can have the same text, and a cancellation request can race with a successful or failed operation. [Diagnostic PR #252](https://github.com/sahamo123/dax-editor/pull/252) records the evidence. [#253](https://github.com/sahamo123/dax-editor/issues/253) implements this contract.

## Contract

- Preserve the existing job `status` values and legacy `error: "Cancelled"` for a confirmed cancellation. Add an optional typed marker `cancelled: true` on terminal cancelled jobs; older clients can ignore it and continue to see the existing error shape. Omit the marker for running, completed and failed jobs. New clients must not infer a confirmed cancellation from error text or from a successful cancellation-request response.
- A cancellation request only signals the owned work. Publish a terminal cancellation only after that work and its cleanup have actually settled with a confirmed cancellation outcome. If work succeeds despite a cancellation request, preserve its success. A genuine failure, including a failure with the exact message `Cancelled`, remains a failure even if an abort was requested.
- Preserve cancellation identity across the core command boundary: an explicitly checked, already-aborted command or a recognized abort exception while its supplied signal is aborted becomes a typed cancelled command outcome. Other exceptions keep their existing error text and remain failures. Existing successful and failed command replies remain compatible; the additional outcome metadata is optional.
- The job manager exposes a dedicated cancellation completion distinct from ordinary failure. Its first terminal outcome still wins. Export, speech, motion, AI-initiated motion and local-model work use that completion only on a confirmed cancellation; adapters must reject with a recognizable abort exception when they stop due to a signal. Completed work that returns successfully after an abort request is not falsely reported cancelled.
- The live task mapper sets `cancelled` from the typed marker and otherwise treats a job error as failed, including a literal `Cancelled` failure. Existing stored task history is not rewritten. Older untyped job records retain their error representation; do not infer a typed cancellation from them.
- The desktop emits one concise polite cancellation notice for a typed terminal cancellation, and preserves urgent failure notices for genuine or untyped errors. The local-model card presents cancellation as information rather than an error, and the task list does not display the legacy cancellation message as a warning. No progress announcement, duplicate terminal notice, internal path, retry or speculative success is introduced. Existing job reconciliation rules apply to live events and accepted snapshots.

## Verification

Tests must cover legacy and typed job JSON compatibility; explicit cancellation, normal completion and real failures (including exact text `Cancelled`); late cancellation racing success or failure; first terminal outcome; command-level abort identity; and event/snapshot ordering. Exercise real generated-media export cancellation and fake speech/local-model cancellation through the live engine, check task status and both live regions, and ensure the completed output and project history are not falsely claimed. No test downloads a model or touches user projects.

Run required source, browser and documentation checks on the exact candidate. Actual screen-reader speech, keyboard-only file-picker and native Windows/DPI acceptance remain separate; a passing DOM live-region test does not establish them. Roll back the scoped change if its typed outcome or compatibility checks fail; preserve user projects and prior test evidence.
