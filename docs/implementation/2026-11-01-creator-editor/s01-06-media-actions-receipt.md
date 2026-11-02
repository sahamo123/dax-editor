---
type: Guide
title: S01.06 media card action layout
description: Regression evidence for readable and usable media-card controls at two viewport widths.
tags: [implementation, accessibility, media, testing]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T05:33:00Z
---

# S01.06 media card action layout

**State: IN_PROGRESS.** [Issue #190](https://github.com/sahamo123/dax-editor/issues/190) follows [draft PR #191](https://github.com/sahamo123/dax-editor/pull/191) documentation head `c3f0796069191a8e5d059c969b3b528ae30fb583`. At narrow media-card widths, the status badge and two actions competed for one flex row and the Add and Relink labels were clipped. The row now wraps and its children retain their intrinsic widths; command behavior and accessible names are unchanged.

The generated-media browser regression failed on the old layout at both 1440 and 1000 pixels because button text overflowed. With the fix, both sizes passed: labels and buttons fit inside the card, Tab moved focus to Relink with an outline, Add increased the actual clip count, and keyboard activation of Relink selected a generated video. Its original path-difference assertion could also pass if the asset disappeared; see [#194](https://github.com/sahamo123/dax-editor/issues/194) for the strengthened check. Three existing contextual contrast checks also passed; five tests passed total in installed Edge. Generated screenshots at both sizes were inspected, including the keyboard focus ring. The test used system FFmpeg and an in-process test engine, not the packaged runtime or native application.

Browser log SHA-256 `ecc6a5c7a346f45f489d9b71f4457f2d302af96f416c4a69cbe2fcbf6c265c66`; CSS SHA-256 `23738ec4d4d3300aed5e3883fa72ed59217e482adf39ff803e697af77f17be66`; regression test SHA-256 `6d2e8ca661d67f23044f0b520ed89e32a7e0743012ae60c57f19ffc2aff62077`. Full `pnpm check` passed (1,826 package tests passed, 67 skipped; 17 script tests passed), private log SHA-256 `7b12ea32d4eef060267b22a644bd7b410d6e2241437f88f4a44ff645dcb6625a`; [draft PR #192](https://github.com/sahamo123/dax-editor/pull/192) is published at application/test head `7e1595b6a2c5e63b5f426383b4d085547102169c`; review remains pending. Keep S01.06 open: complete keyboard-only import, observed actual screen-reader speech, investigation #186, wider accessibility review and native/DPI checks before advancing. Do not publish private screenshots or local paths.

## Relink assertion recheck

Review found that the earlier path-difference assertion could pass if the asset disappeared. [Issue #194](https://github.com/sahamo123/dax-editor/issues/194) strengthens it to require the original asset and a non-empty changed path, then checks that the resulting path is a file. Both generated-media browser tests passed in installed Edge at 1440 and 1000 pixels. [Draft PR #195](https://github.com/sahamo123/dax-editor/pull/195) is published at test head `a9f1eaaee79d16f39b5325ab4431060ac1b99e82`; review remains pending. New test SHA-256 `c234cc842feb2085621c4b7c5c8d68f0222be0093a02109c29fc2367ab7a8579`; private browser log SHA-256 `1e3edbdc1783f2508e73401e99325b49cb2525c2bac56d330bf3df7ca5565492`. This test-only follow-up does not change the application source covered by the full check; native and S01.06 gates remain open.