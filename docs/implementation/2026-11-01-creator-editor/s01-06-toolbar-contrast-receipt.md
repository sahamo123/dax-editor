---
type: Evidence
title: Toolbar icon contrast audit
description: Browser measurements and a separately tracked wrapped toolbar overlap.
tags: [accessibility, contrast, toolbar, evidence]
status: draft
generated:
  by: process:scribe
  at: 2026-11-02T20:45:00Z
---

# Toolbar icon contrast audit

[#273 / draft PR #275](https://github.com/sahamo123/dax-editor/pull/275) measures essential SVG editing/transport icons against computed composited backgrounds in generated-media Edge browser sessions at 1000×700 and 1440×900. On application/test head `419eba4778b27590b1d6a7da9e296a3519e59c8a`, two browser tests and `pnpm check:fast` passed. Normal icon contrast was 15.457:1, hover 12.727:1, pressed 5.122:1 and primary Play 16.333:1 normal / 19.316:1 hover. Loop, Snapping and Mute toggle by keyboard with pressed state maintained. These are limited sampled states, not a complete accessibility or native acceptance.

An exploratory hit-test at 1440×900 found Zoom out's bottom at 669 CSS px while the toolbar bottom was 659.40625 px; the bottom three of nine points hit the timeline. This failure was reproduced by the diagnostic before it was separated from the passing contrast test. It is tracked independently in [#274](https://github.com/sahamo123/dax-editor/issues/274). No layout fix is claimed here.

The actual picker, assistive-technology speech, native acceptance and S01.06 remain open. Review is pending.