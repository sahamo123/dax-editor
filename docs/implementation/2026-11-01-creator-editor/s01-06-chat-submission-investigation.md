---
type: Guide
title: S01.06 intermittent chat submission investigation
description: Evidence separating an unsent synthetic chat prompt from a test-teardown disconnect and the remaining diagnosis.
tags: [implementation, chat, testing, handoff]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T03:45:00Z
---

# S01.06 intermittent chat submission investigation

**State: IN_PROGRESS.** [Issue #186 / draft PR #188](https://github.com/sahamo123/dax-editor/pull/188), diagnostic/test head `19458f19fafe22a6c8a8e58d2e451f091b474083`, tree `67fe22d4eaaf5f5071e2e98f32c175c95945e629`, starts from [draft PR #187](https://github.com/sahamo123/dax-editor/pull/187), documentation head `c3ad581055db52e5a716363c6c60fdf21a5c65b9`. Its application/test head is `6c3fbea9723fcf17018d736f518e749cb7533860`. This diagnostic does not fix the issue and has not been independently reviewed.

## Corrected observation

The affected browser run failed intermittently while waiting for an undo control after submitting a synthetic chat request. A later snapshot displayed the disconnected banner. That snapshot may have been taken after the failing test's fixture shut down its engine, so it does **not** establish a connection failure.

A diagnostic taken **before teardown** found the engine's authenticated state endpoint reachable, the observed socket not closed, and the disconnected banner absent. The conversation contained neither the test prompt nor its response, and the project contained no added title. One reproduction retained the draft in an enabled composer with an enabled Send button; another showed an empty composer at the Enter event. Later instrumentation recorded a test fill returning without the expected text after the composer lost focus; another reproduction retained the text while Enter reached a different target after focus left the still-enabled composer. In one such run the input remained connected, no window blur was observed, and no disabled-state change was recorded. No production cause has been proven. The test also observed a blocked media request; its relationship to the missing submission is unknown.

The original affected-suite run and isolated repeats remain documented in the [announcement receipt](s01-06-live-announcement-receipt.md). An instrumented set passed eight of eight; another passed 14 and failed once. A pre-teardown set passed 16 and failed once. Later focus instrumentation passed 30 consecutive runs; a lower-overhead run passed 17 and failed once, and an explicit fill-observation run passed eight and failed once. A plain-textarea Chrome control passed 20 runs, whereas a key-by-key editor run lost focus on its first attempt; it was not solely a bulk-fill issue. In that reproduction the field remained connected, enabled and visible, with no captured explicit focus or blur call or window blur. A separate component test for a hypothesized batched input change passed on unchanged production code and therefore did not reproduce the defect. Twenty additional opt-in runs in installed Edge passed (private log SHA-256 `8edb2770ae7581858e32c6b26a07cdb5a994e88ab90346bc9440655a96933eed`); the affected Edge browser workflows also passed 29 with two explicit opt-in skips (log `a66bfea2131e670f3872d2475d6d34c5823d0abfa08b0f2acfff510523aba721`). Neither is an actual native WebView test and neither proves the issue is Chrome-specific. Do not replace the failures with these passes or claim a product fix.

The diagnostic is opt-in: the updated version skipped both tests by default and passed both in one explicitly enabled Edge run with key-by-key entry. `pnpm check:fast` passed before the later diagnostic-only additions; a focused Biome check and `pnpm docs:okf` passed afterward. No application behavior changed in this investigation.

## Next steps

1. Run the opt-in diagnostic after setting `DAX_CHAT_DIAGNOSTIC=1` in the shell (PowerShell: `$env:DAX_CHAT_DIAGNOSTIC = '1'`), then use `pnpm --filter @dax/desktop exec playwright test e2e/chat-submission-diagnostic.spec.ts`. Set `DAX_CHAT_DIAGNOSTIC_INPUT=keys` to compare key-by-key entry with the default fill action. Configure the documented local browser and system-FFmpeg test dependencies. Inspect input, focus and window events before cleanup. It reports synthetic booleans and event categories, never tokens or media contents. The normal browser suite skips it.
2. Determine whether focus, test action timing, a remount or application state causes the missed submission. Add a deterministic regression for the demonstrated cause before modifying product behavior.
3. Rerun the affected tests without using retries to mask failure; retain failed runs, counts and limits. Update this receipt, [#186](https://github.com/sahamo123/dax-editor/issues/186), the handoff and status.
4. The keyboard-only import and actual post-change Narrator speech in [#177](https://github.com/sahamo123/dax-editor/issues/177) remain pending; S01.06 and native-app acceptance are not complete.
