---
type: Guide
title: Notification keyboard focus and contrast samples
description: Rendered keyboard focus, text contrast, geometry and overflow samples in synthetic Settings dialogs.
tags: [implementation, accessibility, keyboard, contrast, testing]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T21:05:00Z
---

# Notification keyboard focus and contrast samples

**State: IN_PROGRESS / self-reviewed.** [#270 / draft PR #271](https://github.com/sahamo123/dax-editor/pull/271), branch `codex/s01-06-notice-focus-contrast`, test head `b80ab8d09fa0024d6b492c2a705b2e778d592246`, follows [PR #269](https://github.com/sahamo123/dax-editor/pull/269). It adds browser evidence only and does not complete S01.06.

## Samples

In installed Edge at 1024×700 and 1440×900, synthetic long errors filled a scrollable Settings notification region and a fifth notice waited. Actual Tab events reached the region and a dismiss button; Enter removed a notice, exposed the waiting item and returned focus to the region. The Settings Save action stayed visible. The test also generated 37 synthetic errors at 1024×700 to fill the 32-entry waiting queue and expose the overflow warning, then used Tab and Enter to dismiss the warning without discarding the queue.

| Sample | Foreground / indicator | Sampled adjacent color | Ratio |
|---|---|---|---:|
| Focused region outline, both viewports | `rgb(107, 151, 255)` | `rgb(18, 21, 27)` | 6.525:1 |
| Focused notice and overflow dismiss outlines | `rgb(107, 151, 255)` | `rgb(33, 38, 54)` | 5.373:1 |
| Waiting and overflow message text | `rgb(233, 236, 243)` | `rgb(33, 38, 54)` | 12.727:1 |

Outlines measured 2 CSS pixels with a 2-pixel offset. Tests used unrounded values against 3:1 for sampled meaningful focus indicators under [WCAG 2.2 SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) and 4.5:1 for normal text under [SC 1.4.3](https://www.w3.org/TR/WCAG22/#contrast-minimum); [SC 2.4.7](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html) concerns visible keyboard focus. They require `:focus-visible`, verify viewport and scroll-region geometry, and reject non-opaque selected colors, gradients, opacity, filters and blend modes they cannot safely model. They do not measure every adjacent pixel, every notice or every control. The five synthetic focus screenshots from the exact run were visually inspected; the first region, dismiss and overflow screenshot hashes respectively are `d8817ac4158dde54a8203cd20274ec042ced2992d588f21c7ebba3516a7cc9d6`, `34fba2d1f158b5518f630b21484f2601fef9af5b59f05c2c4c4207111f2a8752`, and `e306324c5644813cc78a2fc731a4ea6437e948137a7078e3b210cea1fe7da38a`.

## Verification and boundaries

Three exact-head browser tests passed (log `3546b1d7074ab63090bceaae608eea030337612fdc61b444ec7d2e21c06cc807`). An earlier audit run timed out at 1024 because its setup selected an assistant-panel button hidden in compact view; using the persistent Settings button fixed that test setup. The 1440 sample passed in the same earlier run (log `d7f6cba605137a195cc5349c858e18aa194a863f7729c965674ca109ec0ec7dc`).

`pnpm check:fast` and `pnpm deadcode` passed (logs `bd280d13afb2f013a3c2795f1475c25ec53a81e1353042b9885bb04603b1ee85` and `6311d11253bd3c6142e3a900e7732b1ca023a0b9295890a0ca859ebd5ea8ccdb`). The full `pnpm check` at [PR #269](https://github.com/sahamo123/dax-editor/pull/269) test head `192fcaac08aa21c831ebf8b59a2f3677b860de96` passed 1,967 package tests and 17 script tests with 67 skips; it is reused only for unchanged application source and is not a new full check at this test head. Self-review is not independent review.

These are selected browser samples, not complete contrast, screen-reader speech, a keyboard-only media-picker workflow, or packaged native Windows/DPI acceptance. System FFmpeg is diagnostic only. Keep S01.06 open.
