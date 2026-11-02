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

The generated-media browser regression failed on the old layout at both 1440 and 1000 pixels because button text overflowed. With the fix, both sizes passed: labels and buttons fit inside the card, Tab moved focus to Relink with an outline, Add increased the actual clip count, and keyboard activation of Relink selected a generated video and updated the asset path. Three existing contextual contrast checks also passed; five tests passed total in installed Edge. Generated screenshots at both sizes were inspected, including the keyboard focus ring. The test used system FFmpeg and an in-process test engine, not the packaged runtime or native application.

Browser log SHA-256 `ecc6a5c7a346f45f489d9b71f4457f2d302af96f416c4a69cbe2fcbf6c265c66`; CSS SHA-256 `23738ec4d4d3300aed5e3883fa72ed59217e482adf39ff803e697af77f17be66`; regression test SHA-256 `6d2e8ca661d67f23044f0b520ed89e32a7e0743012ae60c57f19ffc2aff62077`. Full repository validation and publication are pending. Keep S01.06 open: complete keyboard-only import, observed actual screen-reader speech, investigation #186, wider accessibility review and native/DPI checks before advancing. Do not publish private screenshots or local paths.
