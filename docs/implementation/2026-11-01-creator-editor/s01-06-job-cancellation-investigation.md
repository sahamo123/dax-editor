---
type: Guide
title: S01.06 cancellation outcome investigation
description: Reproduction of task cancellation as an urgent job error and the remaining typed-contract work.
tags: [implementation, accessibility, tasks, cancellation]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T16:00:00Z
---

# Cancellation outcome investigation

**State: IN_PROGRESS.** [Issue #251](https://github.com/sahamo123/dax-editor/issues/251) starts from [PR #250](https://github.com/sahamo123/dax-editor/pull/250) documentation head `3328ecf4777eb13e00dbee795184c65ccec42909`. This is an opt-in diagnostic, not an application fix or completed S01.06 acceptance.

## Reproduction

In an isolated Edge browser and real local server, a fake speech setup reported progress and waited for an abort. Clicking **Cancel speech job** caused its task to become `cancelled`, while the visible toast had error styling and the assertive alert region contained `Cancelled`. An initial diagnostic failed before cancellation because a progress-bar selector matched two elements (private log SHA-256 `79dec59c6f26f9407d2d490bbf9befb71a1e66e323b17bd63ecf3021cc4b30f`); the exact-selector retry reproduced the observation (log `49f3a6b08396c5b4b118172a90143fbf4884c2d3b787e785755d23bc1193418a`).

A separate generated-media export, started and cancelled through the authenticated local engine API, also returned a job with status `error`, error exactly `Cancelled`, and task status `cancelled`. Both diagnostics plus three related notification checks passed (private log `ba048d1f268f8b3f10aa43aef9ec23de2f90ccc7955219d7ccf8f4950906ebe1`). The export used diagnostic system FFmpeg. The browser diagnostic is opt-in via `DAX_CANCEL_DIAGNOSTIC=1`; its assertions deliberately describe the existing defect and must be revised when the behavior is fixed. Both cases skip by default (log `7601134ecd59726c96039497dfe6e26fdaaa20e8f900e5786fd323340c0a07bb`).

`pnpm check:fast` passed after the diagnostic and documentation changes (private log `1ab7c1ed582ae01060b7536abd1603eb6c109a73a6a37efab30b2dbcb2e638b6`), as did `pnpm docs:index` and `pnpm docs:okf`. The earlier full `pnpm check` on PR #250 is reused only for unchanged application source; it does not verify this new browser fixture.

## Next work and limits

The server maps the exact error text `Cancelled` to task status `cancelled`, while the desktop routes all job errors to an urgent error notice. Non-export work knows whether its abort signal was requested; export forwards the command outcome, and the core command layer wraps exceptions as plain command errors and returns only their message. A UI-only string match would conflate a real failure with an intentional cancellation. Specify a backwards-compatible typed outcome spanning the core command wrapper, job records and task mapping; preserve real errors, first-terminal-outcome ordering, existing clients and non-replay behavior. Add focused core/server/protocol/controller tests and revise the browser diagnostic to verify the corrected behavior.

No user projects, actual speech/model downloads, screen-reader speech or native packaged runtime were involved. Actual keyboard-only picker and Narrator acceptance [#177](https://github.com/sahamo123/dax-editor/issues/177) remain open. Retain failure logs and preserve private data; do not advance S01.06.
