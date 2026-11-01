# Dax Editor design context

This document records the incumbent editor and the selected **proposed refinement**, based on the [workspace audit](docs/implementation/2026-11-01-creator-editor/s01-01-audit-receipt.md). It does not claim that the proposed layout has shipped or that native accessibility has passed.

## Operating principles

This is a task-focused desktop editor. The video and timeline are the working surface; controls must be readable, predictable, keyboard reachable and dense enough for a laptop. Preserve familiar affordances and visible focus. Use motion only to communicate state, never to delay editing. Keep a persistent, understandable route to manual controls and task status whether an assistant is configured or not.

## Incumbent visual system

The application uses a dark surface hierarchy, blue primary/selection accent, semantic green/amber/red status colors, purple assistant attribution, compact rounded controls and an Inter-first system-sans fallback. The authoritative values are [tokens.css](apps/desktop/src/app/styles/tokens.css), including `--bg-0` through `--bg-4`, `--text`, `--text-dim`, `--accent`, `--ok`, `--warn`, `--danger`, `--ai` and `--focus`. Reuse those tokens and the existing controls; no replacement identity, remote font/image request, new UI library or new dependency is selected. An Inter entry in the font stack does not itself prove the font is bundled or installed.

## Proposed workspace direction

Keep project and transport controls at the top, an accessible assistant beside the preview when space permits, and the timeline below the preview. Separate project-wide setup from the contextual inspector. Selecting a clip or overlay may reveal its properties but must not steal focus. At narrow widths, offer an explicit Edit/Assistant switch and a resizable bottom/context inspector; task status and a way back to editing remain available. Preserve panel size preferences and clamp them to current space.

Give the preview the available area while maintaining its aspect ratio; the review action must not reserve a full-height side column. Keep task actions distinct at narrow widths: Queue, Steer and Stop cannot overlap. Summarize errors in plain language, with safe diagnostic details kept separate. The [design contract](docs/specs/workspace-design-contract.md) defines state, focus and verification requirements.

## Verification boundary

Inspect rendered empty, import, edit, error, review and export states at 1366×768, 1440×900 and 1920×1080, with keyboard/focus, panel resizing, tasks and manual editing. Use before/after evidence on the relevant source commit. Browser viewport captures do not establish native Windows scaling: actual 100%, 125%, 150% and 200% scale checks, dialogs, playback and export require a policy-authorized native target. Keep assistive technology and contrast claims unverified until actually measured.
