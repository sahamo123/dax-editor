---
type: Guide
title: S01.06 export focus child receipt
description: Reproduction and verification of stable keyboard focus while an export runs.
tags: [implementation, accessibility, export, testing]
status: draft
generated:
  by: process:implementer
  at: 2026-11-01T23:10:00Z
---

# S01.06 export focus child

**State: VERIFIED with self-review**, [issue #164](https://github.com/sahamo123/dax-editor/issues/164), [PR #167](https://github.com/sahamo123/dax-editor/pull/167), tested head `ee1c4726c7e4fb03986fe986440521f428dc5b4c`, tree `3759b950ca8597a4def3da7cb5919194385282be`, parent [#162](https://github.com/sahamo123/dax-editor/issues/162). Base [PR #166](https://github.com/sahamo123/dax-editor/pull/166) is self-reviewed at `1a57506035551b4d6cf3ddae414acd54f044274b`; its issue, test evidence, published diff and hashes were rechecked before this child. See the [audit receipt](s01-06-accessibility-audit-receipt.md) for the S01.05 entry check and partial keyboard walkthrough.

In a generated-media Chrome walkthrough, opening and confirming export with the keyboard briefly restored focus to the Export trigger, then the browser moved focus to the page when the trigger became natively disabled. The six-second generated output was fully decoded with video and audio. A focused component regression failed against the old control; private log SHA-256 `c7691b6c0f249d3f2cec9ae4e47e08097a8d897ffb069be3938c9c8964b522ac`.

The candidate keeps the running-export control focusable while exposing `aria-disabled` and explicitly refusing activation; genuinely unavailable offline/empty states remain natively disabled. The existing busy visual treatment is preserved. Thirty-four component tests and seven generated-media browser history/export tests passed, including focused busy control, ignored repeat Enter and Escape restoration; browser log SHA-256 `67015f7f1d34d4740bc47aa8657312d92fa1f0832e61b8c20a5d09c0e3c79332`. This verifies browser behavior, not actual screen-reader or native Windows behavior.

The corrected `pnpm check` passed 1,820 package tests, 67 skipped and 17 script tests; private log SHA-256 `cc8365e0bdde769ec1ea532e8fb13c98c3a4e3d96c368ea9107b961bb0065f85`. A compact-window browser test was added afterward; application source was unchanged. Biome passed, and the complete focused history/export browser suite passed eight tests across wide and compact layouts, log SHA-256 `346c737c5a9cf6299065f4261bcf095bf0894ce9fcdb0363a4798bb28cf2ddee`. A wide browser capture visibly shows the busy focus ring; its private SHA-256 is `fae8ee857f8f78dcdac4e13e6fc162155ad3b6ed2d41013e4a0512bd0d47ba27`.

The published diff, capture and log hashes received a separate self-review, not independent review. The S01.06 audit, primary-hover contrast [#165](https://github.com/sahamo123/dax-editor/issues/165), full manual file-picker and actual assistive-technology observations remain open. Preserve private captures and projects.

The first `pnpm check` failed at TypeScript build because a component-test role query incorrectly used Playwright's `exact` option. The test selector was corrected; failed log SHA-256 `26c29dac736d88c1777cd5618fbfbace4518bd5d2e96158872510cca5bafadb8` is retained under [E015](errors-and-recovery.md). The corrected full check passed as described above.
