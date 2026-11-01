---
type: Guide
title: S00.02 capability reconciliation receipt
description: Source-backed reconciliation of transcript, template and history behavior and the associated checks and limitations.
tags: [implementation, baseline, evidence, capabilities]
status: draft
generated:
  by: process:implementer
  at: 2026-11-01T11:58:00Z
---

# S00.02 capability reconciliation

**State: VERIFIED**, with a separate self-review; independent stage review remains required. [Issue #123](https://github.com/sahamo123/dax-editor/issues/123), [PR #124](https://github.com/sahamo123/dax-editor/pull/124), tested head `58089a15147971b0bce590cfcd6c313d4e225517`. Before entry, the implementer reopened [S00.01 issue #121](https://github.com/sahamo123/dax-editor/issues/121), [PR #122](https://github.com/sahamo123/dax-editor/pull/122) and its receipt, checked the PR's tested head `41f75aae2f1e5f9a863e39d8d1d6bfeaca401475`, and confirmed that commit was the clean current baseline.

## Claim-to-source reconciliation

| Claim | Current source evidence | Result |
|---|---|---|
| Missing transcript means transcription is absent from the build | `packages/core/src/commands.ts` exposes `transcribe` through an injected `Transcriber`; runtime/model availability varies | Correct missing-transcript guidance without asserting runtime availability; test both injected and absent adapters. |
| Captions are absent from the engine | `commands.ts` provides `set_captions`; `captions.ts` derives lines from transcripts | Manual caption support exists, but template application of caption steps is still deferred. Correct `ENGINE_FEATURES` wording without removing the deferred step. |
| All deferred template features are absent engine capabilities | `templates.ts` reports a deferred step as skipped and does not apply it | Describe applier coverage separately from individual commands; no template behavior changed. |
| Saved history is implicit in the project file | `session.ts` stores `<project path>.history.json`, checks current-project equality on load, and uses a temp-file rename for the history | Correct the core agent map; project and history are separate writes, not a single atomic transaction. |
| Speech-to-text has no adapter | `packages/stt` supplies a separate runtime adapter; `transcribe` also checks for injection | Correct the core map; installed speech runtime/model and actual transcription remain separate checks. |

Historical research states the engine baseline at its stated date and remains historical. Current model, hosted providers, live assistant clients and packaged-native behavior are not verified by this source reconciliation.

## Checks and failure handling

Two new focused tests initially failed against the old claims and passed after correction. The full two-file suite passed **242 tests** on the normal Windows host with explicit system FFmpeg/ffprobe. The first broader attempt using the packaged renderer failed `spawn UNKNOWN` in `detect_silence`, both in the restricted environment and on the normal host; it was stopped after the failure and isolated. This is a real packaged-binary execution failure in this environment, not a passed native/packaged test. No policy changes were made.

The first `pnpm check` using system FFmpeg failed at lint because two newly added lines required formatting; those lines were corrected. The normal-host retry with explicit system FFmpeg/ffprobe passed `pnpm check`: 1,801 package tests and 17 script tests passed, with 67 package tests skipped. Some documentation was updated during the run; final docs/OKF, lint and whitespace checks were rerun on the final snapshot. A separate self-review and tested PR head are recorded in issue #123. Raw test logs are private under the dated folder's ignored `.local/` directory. A system-FFmpeg success does not resolve the packaged-runtime blocker.
