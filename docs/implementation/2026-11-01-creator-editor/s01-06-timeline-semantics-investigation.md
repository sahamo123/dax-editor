---
type: Guide
title: S01.06 timeline keyboard semantics investigation
description: Rendered evidence of conflicting timeline listbox semantics and editing shortcuts, with unresolved design constraints.
tags: [implementation, accessibility, keyboard, timeline]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T14:00:00Z
---

# Timeline keyboard semantics investigation

**State: IN_PROGRESS.** [Issue #243](https://github.com/sahamo123/dax-editor/issues/243) is an S01.06 child. The reproduction used [PR #242](https://github.com/sahamo123/dax-editor/pull/242) documentation head `510b5be4c7fe7a64aa1c6a63c73a645cc6d4cc0b`, whose application/test head `7e0989e58bf4fc45858cd9dd53bb73ca10720a17` passed a full source check. This investigation changes no application source; S01.06 remains open.

## Observed behavior

Two isolated Edge browser diagnostics used a generated six-second clip, the scripted local server, an actual split at two seconds and a three-second title overlay. At both 1440×900 and 1000×700, the timeline exposed a horizontal listbox with three independently tabbable options. Enter on the first clip selected it without moving focus. Right Arrow advanced the playhead from `00:00:00` to `00:00:01` while focus and selection stayed on that clip; Shift+Right moved it to `00:01:01`; Tab then moved focus to the second clip without selecting it. The project snapshot was unchanged by these interactions.

The [W3C listbox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/) describes a composite focus model and arrow navigation between options. The observed interaction does not implement that pattern. This is a keyboard/semantics mismatch, not evidence of what any screen reader actually announced.

The second diagnostic run passed its two observation tests; private log SHA-256 `9b082865bed439d460a53ad3302e0c7298a41c67ef025d0c2dc269258281603a`. Its deliberately baseline-specific diagnostic source is retained privately as `artifacts/s01-06-live-a95cb3f5774e4269bbff1a3260816cd2/timeline-keyboard-diagnostic.spec.ts.txt` (SHA-256 `ec2806c50e6b7fce1531456779b0946b0aac2e30669ba2e0577ce3150c24c6ca`); it is not a passing regression for a future fix. The first observation run's log hash is `4b11375d0058d1df40eaa7674bc0687c3ce42d8b3bd71b668a2df16903489ea3`. Its wide and compact screenshots were inspected privately (hashes `542e9de46921df30362afe6be90c8b1fbd4513b453b55edb216f99d016066a4d` and `33dc429f6fd077d17c49f546c9433a46bd1495f746a08593b5c031b62a745371`); the preview was still preparing and is not certified. System FFmpeg was used diagnostically.

## Next design and verification

Choose a coherent, documented interaction that matches its exposed semantics and preserves practical playback, frame/second stepping and editing. Consider focus versus selection, discoverable keys, the existing shortcut reference and tooltips, offscreen timeline virtualization, empty timelines, deletion and project changes; do not silently repurpose an editing key or assume a change to ARIA alone fixes behavior. Establish behavior and keyboard regressions before implementation, then verify wide/compact rendered behavior and unchanged project/history. Actual Narrator, native picker and packaged desktop acceptance remain separate gates. No private projects or user media were opened.
