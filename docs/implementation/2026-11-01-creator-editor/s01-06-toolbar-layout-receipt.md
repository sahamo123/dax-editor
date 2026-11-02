---
type: Evidence
title: Wrapped toolbar layout correction
description: Browser hit testing and source checks for wrapped editing controls.
tags: [accessibility, toolbar, layout, evidence]
status: draft
generated:
  by: process:scribe
  at: 2026-11-02T21:15:00Z
---

# Wrapped toolbar layout correction

**State: VERIFYING.** [#274 / draft PR #276](https://github.com/sahamo123/dax-editor/pull/276) reserves the toolbar's full wrapped height in the timeline flex layout. The preceding regression failed on the unfixed source at 1440×900, minimum timeline height: Snapping ended at 819 CSS px, below the toolbar bottom at 798.67 CSS px. This is separate from the [contrast audit](s01-06-toolbar-contrast-receipt.md).

At application/test head `d1dadc7bb4ec9c9b563cd18b89542da9fff1b467`, 13 generated-media Edge browser checks passed, including all toolbar button and slider bounds and nine pointer hit samples each at 600, 720, 1000 and 1440 CSS px. The regression exercises minimum timeline height, keyboard focus and toggling, window resize, and closing/reopening the side panel; existing responsive and preview checks also passed. Screenshots at 600, 720 and 1440 were inspected. Browser log SHA-256: `bdf666c4e21559c9f43c400ea5c6fca9c9a68548a36b53089d38fa0d2b5eb31e`.

The first `pnpm check` failed one server engine test when Windows returned `EPERM` during atomic state-file rename; 191 server tests passed and the desktop package passed. Its cause is unproven; compare the separate [#149 investigation](windows-sharing-investigation.md) without assuming identity. Failed-run log SHA-256: `e41a44c6cbc1f76894602ff36b7473824529dd41298fcd176e6e4470c8e0a26d`. All 16 server engine tests then passed in isolation; log SHA-256: `19dcfef786b2ee9945359b05d6658dab13c3b270cf575b1b51cd403c6ec0c65a`.

A full `pnpm check` rerun on the same source passed: 1,967 package tests passed, 67 skipped and 17 script tests passed. Rerun log SHA-256: `d528ffa6c1e434034aa8af505e11f95ed4eff901f5857499c613c43e4930fd61`. Test FFmpeg was the explicitly selected system binary, not packaged-runtime verification.

Self-review on test-only head `6ae11d2d0616d8afe5e425b14f505f7c6e42e4a8` rechecked the CSS flex interaction, responsive test and screenshots. The prior test only measured the remaining timeline height, so it now also programmatically focuses the clip at minimum height, verifies its center is unobscured, and selects it by pointer. Four browser checks at 600, 720, 1000 and 1440 CSS px passed; log SHA-256 `bf376ac40c5de58d38d98a772e3c7f774a04b13fa6036483b587f119148ed695`. `pnpm check:fast` passed; log SHA-256 `9e420896c2332ef689b5dcde719f6c25542b7747bf07bd9d000cc6a33cfe04e2`. Application and package source are unchanged from the full-check head above. The focus test is not a full keyboard-only workflow.

Self-review is complete; independent review remains pending. S01.06, actual Windows picker, task-specific assistive-technology speech, native desktop and DPI acceptance remain open. No release readiness is claimed.