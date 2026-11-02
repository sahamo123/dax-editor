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

**State: IN_PROGRESS.** [Issue #201](https://github.com/sahamo123/dax-editor/issues/201) is being addressed on `codex/s01-06-chat-context-race`, based on draft PR #205 documentation head `75cf0862a9c4aaaaeceaef0de3c043b7f75c68f8`. Confirm branch publication before using it on another laptop. Full source checks and review remain pending.

Before the change, two generated-media browser diagnostics reproduced unsafe task attribution when the project or provider was switched while an upload was held: each task used the later context. The local logs `chat-context-project-diagnostic.log` and `chat-context-both-diagnostic.log` retain that evidence. The [contract](../../specs/chat-context-guard.md) captures the intended pre-task guard and compatibility boundary.

The engine publishes a non-secret provider-context version and validates it with the project identity before accepting a task. Project and provider transitions refuse chat while incomplete. The desktop captures both values before staging, preserves its message and attachments on confirmed pre-task rejection, and does not automatically resend an uncertain request. Legacy API clients may omit both guards and remain unguarded; a current desktop fails closed when an older engine omits the context version. The changes do not resolve retained staged files [#202](https://github.com/sahamo123/dax-editor/issues/202) or establish the intermittent focus failure's cause [#186](https://github.com/sahamo123/dax-editor/issues/186).

Focused verification passed: nine protocol tests, nine server tests and 76 desktop controller/component tests. Four local browser scenarios passed against an in-process real engine with a scripted provider and generated footage: project and provider changes during upload, a project change between two uploads, and a project change immediately before chat. They observe a 409, no task, and a retained draft and attachments; the final two also observe one request. Browser log SHA-256 `aad7efff01a7d4a53b48806f262d1a8d466db6651d1adbf642521d8cbcdd520f`. The repeatable browser test is a separate child [#206](https://github.com/sahamo123/dax-editor/issues/206), pending publication. An initial sandboxed browser attempt failed at test startup and was interrupted during cleanup; the authorized Windows-process run passed. System FFmpeg was explicitly selected for testing; this is not native, packaged-runtime, or hosted-provider verification.

The first combined `pnpm check` passed lint, builds, docs and dead-code checks, then failed one saved-connection load test with HTTP 500; the response and logs were not recorded in that run. The remaining package tests passed, but script tests were not reached. Failed log SHA-256 `157ad22064a259f3cded2522fc34847f9cb31dfa2db6b443e71171b886091cff`. Five isolated reruns passed with improved failure diagnostics; this does not establish the original cause. [#207](https://github.com/sahamo123/dax-editor/issues/207) tracks investigation, and a new full check is required.

The parent S01.06 remains in progress. Keyboard-only native picker use and actual post-change Narrator speech [#177](https://github.com/sahamo123/dax-editor/issues/177), native/DPI acceptance, full checks, publication and review are still open; do not advance to S01.07 on these results.
