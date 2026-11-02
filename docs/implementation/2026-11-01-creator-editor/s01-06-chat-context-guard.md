---
type: Guide
title: S01.06 chat submission context guard
description: Evidence for rejecting stale project and provider contexts during attachment staging.
tags: [implementation, chat, recovery, concurrency]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T07:10:00Z
---

# S01.06 chat submission context guard

**State: IN_PROGRESS.** [Issue #201 / draft PR #208](https://github.com/sahamo123/dax-editor/pull/208) is published on `codex/s01-06-chat-context-race`, application/test head `c1b128fc4bf459b9c8d9ae5d234ecc2dfa608348`, based on draft PR #205 documentation head `75cf0862a9c4aaaaeceaef0de3c043b7f75c68f8`. Review remains pending.

Before the change, two generated-media browser diagnostics reproduced unsafe task attribution when the project or provider was switched while an upload was held: each task used the later context. The local logs `chat-context-project-diagnostic.log` and `chat-context-both-diagnostic.log` retain that evidence. The [contract](../../specs/chat-context-guard.md) captures the intended pre-task guard and compatibility boundary.

The engine publishes a non-secret provider-context version and validates it with the project identity before accepting a task. Project and provider transitions refuse chat while incomplete. The desktop captures both values before staging, preserves its message and attachments on confirmed pre-task rejection, and does not automatically resend an uncertain request. Legacy API clients may omit both guards and remain unguarded; a current desktop fails closed when an older engine omits the context version. The changes do not resolve retained staged files [#202](https://github.com/sahamo123/dax-editor/issues/202) or establish the intermittent focus failure's cause [#186](https://github.com/sahamo123/dax-editor/issues/186).

Focused verification passed: nine protocol tests, nine server tests and 76 desktop controller/component tests. Four local browser scenarios passed against an in-process real engine with a scripted provider and generated footage: project and provider changes during upload, a project change between two uploads, and a project change immediately before chat. They observe a 409, no task, and a retained draft and attachments; the final two also observe one request. Browser log SHA-256 `aad7efff01a7d4a53b48806f262d1a8d466db6651d1adbf642521d8cbcdd520f`. The repeatable browser test is in separate child [#206 / PR #209](https://github.com/sahamo123/dax-editor/pull/209). An initial sandboxed browser attempt failed at test startup and was interrupted during cleanup; the authorized Windows-process run passed. System FFmpeg was explicitly selected for testing; this is not native, packaged-runtime, or hosted-provider verification.

The expanded [#206 / draft PR #209](https://github.com/sahamo123/dax-editor/pull/209) regression passed all six scenarios at test head `93f0fddbe8f144079433b6144e35ecf972f7679b`: both project and provider switches during the first upload, between two uploads and immediately before chat. The two-file tests assert exactly one chat request, no accepted chat task and retained message and attachments. Log SHA-256 `9f0c48854248264b49055fca0b6103db2f50b0d2a97cc8b470a0394baa5e52c2`; browser test SHA-256 `992f87f7c173ac1c224c419ce6ca59447edc748f4bf0868f8620df53ed8c653d`. Ten existing chat, attachment-recovery, Planning/queue/steer and Stop browser tests also passed; log SHA-256 `a2900c3875224bd5b4afc227747bc97077d0b493602a7a8141961300ed26486c`. Both use a local scripted assistant and generated media. Review remains pending.

The first combined `pnpm check` passed lint, builds, docs and dead-code checks, then failed one saved-connection load test with HTTP 500; the response and logs were not recorded in that run. The remaining package tests passed, but script tests were not reached. Failed log SHA-256 `157ad22064a259f3cded2522fc34847f9cb31dfa2db6b443e71171b886091cff`. Five isolated reruns and a full retry passed with improved failure diagnostics; this does not establish the original cause. [#207](https://github.com/sahamo123/dax-editor/issues/207) tracks investigation.

A further 20 isolated synthetic-credential connection runs passed (25 isolated passes total), still without reproducing the original failure. The test-only diagnostic in [draft PR #210](https://github.com/sahamo123/dax-editor/pull/210), test head `5524223eb48236c9344c7009b066266c62dc4f2b`, reports the response and harness logs, which the logger redacts, on a future failure. The diagnostic does not alter application behavior or establish why the original server returned 500. Review and investigation remain open.

The full retry passed: 1,847 package tests passed, 67 skipped, and 17 script tests passed. Log SHA-256 `a9b5cf311fae14d18f6c5d958973553bb12062e08f42c7ae7611cc39f522ea05`. Application source matched PR #208 head above; the run also included an uncommitted test-only diagnostic message for #207 and a local browser test that is being split into #206. Those changes do not alter application behavior. The browser test was expanded after the retry's lint phase and needs its own focused verification.

The parent S01.06 remains in progress. Keyboard-only native picker use and actual post-change Narrator speech [#177](https://github.com/sahamo123/dax-editor/issues/177), native/DPI acceptance and review are still open; do not advance to S01.07 on these results.
