---
type: Guide
title: S01.06 timeline overlay label contrast
description: Reproduced timeline label contrast gaps, scoped fix and verification limits.
tags: [implementation, accessibility, contrast, timeline]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T14:00:00Z
---

# Timeline overlay label contrast

**State: IN_PROGRESS.** [Issue #241 / draft PR #242](https://github.com/sahamo123/dax-editor/pull/242), branch `codex/s01-06-overlay-label-contrast`, builds on [PR #240](https://github.com/sahamo123/dax-editor/pull/240) documentation head `6082ba14c185ecfbc2b8383eb4564ec2441ee834`. Application change head `6a52fe4120f80845446cf9e9a0212ddebab74974` is followed by test-only correction `7e0989e58bf4fc45858cd9dd53bb73ca10720a17`. The S01.06 parent remains open.

## Reproduction and change

A generated-video browser scenario added real title, lower-third, caption and callout overlays. The test measured text and glyph contrast from computed styles on opaque category backgrounds, including alpha composition of glyph opacity, before and after selection. Before the fix, ratios were title 4.4993:1, lower-third 3.6779:1, caption 3.0273:1, callout 2.7666:1 and custom fallback 3.5273:1. The fallback was simulated using a temporary synchronous class change; it did not change the saved project. The private reproduction log SHA-256 is `335c23d63f20723d7961b0992d159180d07426e34f4a9172e17b63b6d64d3cab`; the inspected screenshot hash is `24e43838efb7195c567b3f0e7438662a1fc4369d9d7cfbe5c31c698dbdef5cee`.

The timeline UI uses darker distinct category backgrounds and fully opaque glyphs. After the change, corresponding ratios were 5.2970:1, 5.4716:1, 4.9648:1, 5.1272:1 and 5.7242:1; glyph ratios match their labels. The change does not alter stored overlay or exported-video styles. The browser scenario verifies that selection does not mutate the project.

## Verification and limits

Five affected browser checks passed at 1440×900 and 1000×700, including side-panel regressions and the corrected test (private log SHA-256 `90759ec9943a44f875e98787efff22367e1858d24f5db60e328a83c063047995`). Inspected screenshots from the unchanged UI have wide hash `da8b2a39b2bee3dca5016468089501e1696b3b5db09ec77575b406967579e1d3` and compact hash `fb8a3bd408ae69925c2512e11e3c4f19dbba7c5461addce6978b6d201cec6a34`. Corrected-test screenshots have wide hash `a955cf82d56f50d12826d18ce5dbdf1772360b88c682a97b314451a770971192` and the same compact hash. System FFmpeg was used diagnostically with generated media; this does not validate the packaged runtime.

The first full `pnpm check` failed because the test assigned to the read-only TypeScript `Element.className` property (private log SHA-256 `5989bd6e0996afe2f9ca1f9a9616d5d3993d89647ec3d47a333baab3acce8441`). The test-only correction uses attribute access; the affected browser checks passed again. The host-authorized full retry passed at corrected application/test head `7e0989e58bf4fc45858cd9dd53bb73ca10720a17`: 1,896 package tests passed, 67 skipped and 17 script tests passed (private log SHA-256 `d76b6dea28d3359e8f2dca2553c49acacb142d7ee2e2d7ad5d1b78981afe04d6`).

These measurements cover the specified timeline labels and glyphs, not drag ghosts or whole-app contrast. They do not establish actual native-app, screen-reader, or exported-video behavior. Review remains pending; keyboard-only native picker and screen-reader acceptance remain open. No private project or media was used.
