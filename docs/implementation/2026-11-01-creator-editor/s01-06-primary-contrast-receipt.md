---
type: Guide
title: S01.06 primary-button contrast child receipt
description: Rendered primary-button contrast measurements and verification.
tags: [implementation, accessibility, contrast, testing]
status: draft
generated:
  by: process:implementer
  at: 2026-11-01T23:30:00Z
---

# S01.06 primary-button contrast child

**State: IN_PROGRESS**, [issue #165](https://github.com/sahamo123/dax-editor/issues/165), parent [#162](https://github.com/sahamo123/dax-editor/issues/162). Base [PR #167](https://github.com/sahamo123/dax-editor/pull/167) was self-reviewed at `ee1c4726c7e4fb03986fe986440521f428dc5b4c`, tree `3759b950ca8597a4def3da7cb5919194385282be`; its issue, diff and evidence hashes were rechecked. The [audit receipt](s01-06-accessibility-audit-receipt.md) records the S01.05 entry gate.

The real rendered Export button in Chrome uses ordinary-sized white text. A focused Edge browser regression measured its normal contrast at 4.58:1 and its settled original hover at 3.84:1; the latter fails the 4.5:1 ordinary-text threshold in [WCAG 2.2 SC 1.4.3](https://www.w3.org/TR/WCAG22/#contrast-minimum). Private failed log SHA-256 `7d6f07428295c7f93d4987852f92fe199265a153c025b374beba7bc1176e1fc3`. A darker hover token preserves a distinct visual state and measured 5.79:1 in the rendered browser; normal remains 4.58:1. Private measurement JSON SHA-256 `ec50dab931eb0299d1aeb492dcbbbb004b80b5d3ab1519ca050b269e1ba31e57`; reviewed private screenshot `6f3952523341ea27ca012d41e3ae7fca73287b8e2e44b84f5e78005b3501064d`. This is not a whole-app contrast certification.

The same token is used by primary buttons and the send icon; no new assets or dependencies are added. Tests use generated media and system FFmpeg. The final focused test checks actual normal/hover colors and requires opaque colors before calculating contrast; final result JSON SHA-256 `8e4fcf941a40ddb5aca8b9a33bbfae134ab73dc48b2abc79fefe33df346f2def`. The final private screenshot of the target button was visually reviewed, SHA-256 `87e69b7db774740ecf98aef7d13202f1cf12ad8f34e800fddac10272559adef0`; it was captured while the preview was preparing and does not certify the whole workspace. `pnpm check` passed 1,820 package tests, 67 skipped and 17 script tests; private log SHA-256 `857e6c90bf9f72215762089457e67b96622042e0e2373be75899c4f263dabdb5`. Exact commit/tree publication and a separate self-review remain pending. Actual screen-reader, native and DPI checks remain open.

A separate reduced-motion diagnostic found an enabled Import button still had `0.12s, 0.12s` transitions with reduced motion requested. [#168](https://github.com/sahamo123/dax-editor/issues/168) tracks that distinct defect; private failed log SHA-256 `bfc84474e42e91084ee47e0ddd8ab660180c621a3fa98b6c07a5c10a5b996cbc`. Do not claim reduced-motion acceptance from the contrast check.
