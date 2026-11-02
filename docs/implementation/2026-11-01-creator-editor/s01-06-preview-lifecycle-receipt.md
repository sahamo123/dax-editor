---
type: Guide
title: Rendered-preview browser lifecycle investigation
description: Scoped timeout reproduction, teardown ordering, full-size render timings and browser test correction.
tags: [implementation, preview, accessibility, testing, handoff]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T20:20:00Z
---

# Rendered-preview browser lifecycle investigation

**State: IN_PROGRESS / self-reviewed.** [#268 / draft PR #269](https://github.com/sahamo123/dax-editor/pull/269), branch `codex/s01-06-preview-lifecycle-investigation`, test head `192fcaac08aa21c831ebf8b59a2f3677b860de96`, follows [PR #267](https://github.com/sahamo123/dax-editor/pull/267). It changes browser tests only and does not complete S01.06.

## Observation and scoped diagnosis

The previous exact-head browser suite had one 30-second preview-notice timeout; its post-failure snapshot showed a disconnected editor and cancelled preview. A retry passed. See the [burst receipt](s01-06-notice-burst-receipt.md). Its sequence was not captured, so that specific failure's cause remains unproven.

An opt-in generated-media diagnostic records only relative timestamps, bounded job status categories and socket lifecycle, not URLs, tokens, paths or media contents. In a controlled case, an intentionally failed assertion occurred while the server was reachable and a render was running; explicitly shutting down the test server then produced an error job, socket close and matching disconnect/cancellation UI (log `035ca2fe38b6f25ae40563015feb7f8b2e3ccaf153e48a933c7025a83495ffc0`). This demonstrates a possible teardown explanation, not the original failure's chronology.

Using the original six-second fixture and real 1920×1080 renderer, two of three observations exceeded the old 30-second notice deadline while the engine remained reachable and the job was still running (log `19f41d430149a235b49989886880bf192b90393d5c089e7a3e492f4b7b8f5b08`). A second three-run diagnostic continued after that deadline: two renders were still running at the threshold and subsequently completed, about 37.5 and 30.6 seconds after their running events; all three eventually passed (log `e0660d523de7b7d05445cd094f71ce44b09fe86f1748e5c3df33adc881d8d187`). A 640×360 comparison passed three times (log `fa4a56f8f35d856cdba4fb01a1a792512e8761f920b7dea0284ed997e4fc4acd`), but is not substituted for the full-size test.

## Candidate and verification

The existing full-size notice test now has a bounded 90-second notice assertion and a 120-second overall test budget. It still uses the same generated video, renderer, real job events, review dialog and keyboard dismissal. The opt-in diagnostic is skipped unless `DAX_PREVIEW_DIAGNOSTIC=1`; `DAX_PREVIEW_SMALL=1` selects the separate small-format comparison. No application or production timeout changed.

- Three exact-head repetitions of the original preview test passed, taking 32.6, 34.4 and 44.1 seconds overall (log `e1a1d31b4c37b8a87fba7fa4c8d18914fb5d65cb1b608818e354000ddfca9dcd`).
- The combined nine-check browser run passed at `192fcaac08aa21c831ebf8b59a2f3677b860de96`, including full-size preview, modal notice geometry, burst handling, accessibility-tree inspection and both lifecycle diagnostics (log `f2947d2c916d1b563294782b5a937ef8610aef15021caf7795f68c50b1258858`). These are browser tests with diagnostic system FFmpeg.
- `pnpm check:fast` passed. Full `pnpm check` passed on that head: 1,967 package tests passed, 67 skipped and 17 script tests passed (log `864ae9bd854dc50a54c3d10172b85f7ca92356177f9259a9c2f9e80f68dd92c0`). The new browser diagnostic is opt-in and is not counted in that package test total.
- Self-review covered diagnostic scoping, test limits, synthetic data and the original failure's uncertainty. This is not independent review. Actual keyboard-only import, screen-reader speech and native Windows/DPI acceptance remain open; system FFmpeg does not verify the packaged runtime.
