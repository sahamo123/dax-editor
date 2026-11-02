---
type: Spec
title: Desktop workspace product and design contract
description: Proposed setup, contextual inspection, responsive layout, task, focus and verification rules for the first-improvement editor.
tags: [desktop, workspace, accessibility, design, implementation]
status: draft
generated:
  by: process:implementer
  at: 2026-11-01T15:00:00Z
---

# Desktop workspace product and design contract

This is the proposed contract for S01.03–S01.07, not a claim that those changes exist. The [audit](../implementation/2026-11-01-creator-editor/s01-01-audit-receipt.md), [product brief](../../PRODUCT.md) and [design context](../../DESIGN.md) establish scope. Tracking: [issue #140](https://github.com/sahamo123/dax-editor/issues/140).

S01.03 was verified with self-review under [issue #142](https://github.com/sahamo123/dax-editor/issues/142): an empty-project setup surface can be skipped or reopened, with project options separate from selected-item inspection. Its [receipt](../implementation/2026-11-01-creator-editor/s01-03-setup-receipt.md) records tests and limitations. The later native acceptance below remains proposed.

S01.04's [preview child](../implementation/2026-11-01-creator-editor/s01-04-preview-child-receipt.md) passed self-review in [PR #147](https://github.com/sahamo123/dax-editor/pull/147). The dependent [compact candidate](../implementation/2026-11-01-creator-editor/s01-04-responsive-receipt.md) is under test in [issue #144](https://github.com/sahamo123/dax-editor/issues/144). Browser layout observations do not establish the later native acceptance.

## Problem and goals

Project-wide setup, selection properties and optional tools currently compete in the same drawer; a compact drawer covers much of the editing surface. The review button reserves preview width, narrow chat actions crowd each other, and import errors can obscure controls. A creator should be able to import, edit manually or with an assistant, inspect, undo, save and export without setup or a provider blocking the workflow.

Goals: skippable project setup; direct entry for existing projects; contextual inspection; visible preview/timeline and task recovery; keyboard and window-size resilience. Non-goals: new project schema or profile persistence (S02), a second command engine, new visual identity, arbitrary multitrack/compositing, mandatory AI or paid APIs, or changing provider capabilities. No new package or architectural boundary is introduced by this contract; any later one requires its own ADR.

## Ownership and invariants

`Shell` composes layout, panels and editor public components; the app store/controller owns connection, task and shell UI state; the editor public API owns transient selection, playhead and playback state. Project mutations go through the existing typed `controller.run` / `EditorApi.run` command registry and authoritative server state. Layout, selected tab and panel size are per-viewer preferences, never project edits. Do not add another project writer or bypass revision guards, task attribution, grouped history, Planning restrictions or non-cancelling steering.

## Surfaces and states

| Surface | Entry and exit | Loading, empty and error behavior | Keyboard and regression |
|---|---|---|---|
| Project setup | Empty/new project offers setup; a clearly labelled Skip/close enters editing. Open/recent existing project enters editor directly; setup is reopenable from project controls. | Import uses native chooser in desktop and browser chooser/drop in preview; show progress, keep a usable editor during recoverable failure, summarize invalid-media errors without exposing full paths by default (#130). Missing media offers existing relink flow. Offline/no AI is a normal state. | Tab reaches import, skip and reopen; Escape dismisses setup without creating or changing a project and restores focus to its trigger when present. Test empty/existing/cancel/import failure and save/reopen. |
| Preview and timeline | Imported media reveals preview and persistent timeline; review opens a revision-bound rendered view and returns to editing. | Preparing/proxy/review progress identifies the work; failure offers retry or return while preserving edits. Review is not a claim that every interactive effect is exact. Disabled actions explain the reason. | Playback and existing timeline shortcuts work outside text fields; return from review restores its trigger. Test resize/playback, selection, history and review (#137). |
| Context inspector | Selecting an item exposes properties; deselection shows a useful no-selection state. Opening or changing selection never steals focus. Closing returns to editing and preserves selection. Project-wide settings remain discoverable separately. | Loading/unavailable controls are labelled; validation errors remain near the field and do not discard unrelated edits. Preserve source-time/timeline-time labels. | Tab and named controls operate without a pointer; Escape closes a temporary inspector and restores focus to the opener if it still exists. Test selection changes, trim/title/volume commands and undo. |
| Assistant and tasks | Provider and mode are visible; task summary remains reachable in Edit and Assistant views. Queue is distinct from Steer and Stop; attachment and mode controls remain reachable. | Clearly distinguish configured, testing, connected, unavailable and error; do not imply unsupported CLI backends work (#131). Show active/queued/failed/interrupted work and recovery without silently replaying edits. No provider leaves manual editing available. | Composer has labelled actions and visible focus. Planning never mutates, steering does not cancel, Stop is explicit. Test queued context, cancellation, restart and constrained widths (#136). |
| Export and project dialogs | Top-level actions remain reachable; open/close returns to prior context. | Show path/format, overwrite choice and job progress; report error and recovery without falsely reporting success. Preserve project on failure. | Focus enters dialog, remains within modal controls, Escape/cancel closes without export and restores trigger; test native chooser separately. |

## Responsive and focus contract

During rendered review, progress percentages remain readable through the labelled progress bar and visible text without changing a live status region on every update. Meaningful start, completion and error announcements remain distinct; actual screen-reader behavior requires separate observation. [#163](https://github.com/sahamo123/dax-editor/issues/163) tracks the scoped correction.

During export, the top-bar progress control remains keyboard-focusable and is programmatically unavailable; activation must be ignored until the running job finishes. Offline and empty-project states remain genuinely disabled. Closing the export dialog without a valid submission returns focus to its trigger. [#164](https://github.com/sahamo123/dax-editor/issues/164) tracks the scoped correction.

Primary-button text must meet the [WCAG 2.2 ordinary-text 4.5:1 contrast threshold](https://www.w3.org/TR/WCAG22/#contrast-minimum) in normal and hover states; the hover state must remain visually distinguishable. Measure the rendered opaque foreground and background rather than assuming a token comment is accurate. [#165](https://github.com/sahamo123/dax-editor/issues/165) tracks the scoped correction.

When reduced motion is requested, suppress the defined incidental shell transitions at their component selectors and retain clear immediate state changes. Keep working feedback visible and slow the spinner rather than removing its status text. Normal-motion behavior remains unchanged. [#168](https://github.com/sahamo123/dax-editor/issues/168) tracks the scoped correction; actual assistive-technology observation remains separate.

S01.05's [narrow composer child](../implementation/2026-11-01-creator-editor/s01-05-composer-receipt.md) passed self-review: the message field and active-run actions occupy separate rows, and Queue is labelled distinctly from Steer and Stop. It does not complete the task/recovery acceptance.

The [failure and autosave visibility child](../implementation/2026-11-01-creator-editor/s01-05-failure-receipt.md) is in progress. It also addresses a reproduced delayed-state response that hid an autosave warning; full verification remains pending.

At wide sizes retain resizable chat, preview/timeline and contextual panel. At narrow sizes use a labelled Edit/Assistant switch; an inspector may dock at the bottom and be resized/closed without permanently covering preview and timeline. Keep a visible task summary in both views. Preserve stored dimensions while clamping to the available viewport: chat minimum 260 CSS px when shown, preview column at least 320 CSS px when feasible, timeline at least 150 CSS px, and preview at least 160 CSS px high. If the physical window cannot accommodate all minima, collapse/switch panels and keep primary actions reachable rather than hiding content or creating page-wide horizontal overflow. These are implementation targets, not proof of existing behavior.

Splitters remain named keyboard-operable separators; arrows and Home/End continue to work. Preserve playhead, selection, active tasks and undo stack across resize or mode switch. A temporary panel's Escape closes only that panel, not the active task; explicit Stop remains separate. Restore focus to a still-mounted opener, otherwise a predictable labelled workspace control. Never auto-focus an inspector merely because a selection changed. Text-entry keys must not invoke timeline shortcuts.

## Audit-to-acceptance mapping

| Finding | Required verification |
|---|---|
| [#130](https://github.com/sahamo123/dax-editor/issues/130) raw import error | Invalid generated input yields concise actionable UI; safe detail is bounded and dismissible; successful re-import still works. |
| [#131](https://github.com/sahamo123/dax-editor/issues/131) misleading CLI setup | Provider choices match actual supported backend states; external MCP setup is distinguished from in-app chat. |
| [#136](https://github.com/sahamo123/dax-editor/issues/136) crowded task controls | At minimum chat width and active/queued Planning state, all actions and status remain readable, separately focusable and operable. |
| [#137](https://github.com/sahamo123/dax-editor/issues/137) lost preview width | Measure stage and parent before/after at default and extreme chat widths; preserve full aspect ratio and review access. |
| Compact drawer tradeoff | Show selection properties and return to the timeline without permanent preview obstruction; test resize, Escape and focus restoration. |

## Acceptance matrix

| Evidence | Required checks |
|---|---|
| Component and command tests | Empty/existing project, skip/cancel, import failure, selection/focus, manual commands, undo, Planning, queue/steer/Stop and task recovery. Use generated fixtures; no network. |
| Browser | Before/after empty/import/edit/error/review/export at 1366×768, 1440×900 and 1920×1080; compact mode, extreme stored sizes, no clipped primary actions, keyboard traversal, focus and layout persistence. Capture exact source and viewport. |
| Accessibility | Named controls, visible focus, sensible order, no traps, error/status announcements and measured contrast. Reduced motion and text scaling are checked where relevant. Automated checks supplement, not replace, keyboard/assistive-technology review. |
| Native Windows | On a policy-authorized target, actual 100%, 125%, 150% and 200% system scaling with dialogs, keyboard, playback, inspector, tasks/progress and export; record machine, source/installer/binary hashes and exact scale. Browser viewport/zoom is insufficient. Owner laptop is a separate row if an alternate target is used. |
| Repository | Changed behavior has meaningful tests and public contracts; `pnpm check`, relevant desktop/browser tests, scribe, `pnpm docs:index` and `pnpm docs:okf` pass before the corresponding step is VERIFIED. |

Preserve projects and local data. Do not send media or credentials to a provider in tests. Failed or unavailable required evidence remains open and blocks its dependent step; do not weaken policy or treat this specification as acceptance evidence.

A modal dialog owns its keyboard interactions: editor playback and project mutation shortcuts, including global undo/redo, must not act on the background project when the event originates inside the modal. The dialog retains its own controls and Escape handling. After it closes, normal shortcuts resume; text entry retains its native undo behavior.

Restorable history entries must keep readable text in normal and hover states. Entries from other history branches remain fully legible and carry an explicit Other branch label and a visual border; their distinction must not depend on reduced opacity or color alone.

Every task cancellation control has an accessible name that includes its visible action, task title and unique task identifier. Multiple tasks with the same title remain distinguishable, and activating a control cancels only its associated task.
