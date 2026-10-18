---
type: Research
title: Timeline UI patterns
description: "Recommends a plain React timeline on pointer events, engine-owned state and an FFmpeg-fed proxy preview, and records which permissive timeline and drag libraries were checked and rejected."
tags: [research, ui, timeline, react, preview, waveform, keyboard, accessibility, testing]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T19:42:00Z
---

# Timeline UI patterns

Research for the manual-editing UI: a Premiere/CapCut-style layout (media bin, preview, multi-track timeline with drag, trim, split, ripple delete, zoom, snapping, waveforms, playhead, shortcuts, drag-and-drop animation presets) in React with live preview, using only MIT, Apache-2.0, BSD or ISC dependencies. Checked on 2026-10-18. Package versions and publish dates come from the npm registry on that day.

**Licence notes.** [OpenChatCut](https://github.com/0xsline/OpenChatCut) is AGPL-3.0; its UX is recorded as ideas only (section 7). Two candidates are blocked by the dependency rule in [AGENTS.md](../../AGENTS.md): Mediabunny is MPL-2.0 and Twick uses the Sustainable Use License. Both need a human decision before use.

## Recommended v1

1. **Components.** `EditorShell` (media bin, preview, inspector; a chat pane can sit left later). `MediaBin` (virtualized list). `PreviewPlayer` (two `<video>` elements plus a DOM overlay for text). `Timeline` (our own component: ruler, track lanes, clip views, playhead, waveforms). `ShortcutLayer` (one keydown listener and one keymap table).
2. **Libraries.** No timeline component. `@tanstack/react-virtual` 3.14.21 (MIT) for bin and track lists. `zustand` 5.0.15 (MIT) for UI-only state. `@playwright/test` 1.64.1 (Apache-2.0) for tests. No dnd-kit in v1 (section 2).
3. **Interaction.** Native pointer events with `setPointerCapture`, `touch-action: none` on handles, and a 3 px threshold before a drag starts. Convert pixels to timeline seconds with one pure function. Commit one command on `pointerup`. Never send each `pointermove` to the engine.
4. **State model.** The engine (`packages/core`) owns the project: an immutable document, pure commands and the undo stack. The UI holds a read model of the last confirmed revision, plus transient state (zoom, scroll, selection, drag ghost, playhead). Each command carries a client id and a base revision. The UI applies it optimistically, then reconciles with the engine's answer. On rejection it rolls back to the confirmed snapshot.
5. **Playhead.** Not React state. Keep it in an external store and read it with `useSyncExternalStore` only in the components that draw it.
6. **Preview v1.** Two `<video>` elements (A/B) playing short-GOP, low-resolution proxies. Preload the next clip and seek it to its in-point before the swap. One timeline clock drives the active element. Text overlays are DOM elements at the same frame-relative coordinates the export uses.
7. **Truth.** The FFmpeg render is the authority. A golden-frame test compares preview with export and fails on drift.
8. **Waveforms and thumbnails.** Generated on the server with FFmpeg, cached by content hash, drawn on canvas at device-pixel resolution.
9. **Shortcuts.** One table, one listener, ignored inside text inputs. Space play/pause; J/K/L shuttle; I/O marks; S split at playhead; Delete lifts; Shift+Delete ripples; Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z; +/- zoom; arrows step a frame; N toggles snap.
10. **Accessibility.** Playhead, zoom and volume are `role="slider"` with keyboard steps (APG pattern).
11. **Tests.** Vite dev server plus Playwright on Chromium from `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`. Real Tauri webview tests come later through WebdriverIO's Tauri service.
12. **Decisions needed.** Mediabunny (MPL-2.0) for in-browser demux; Twick (SUL) is excluded.

## 1. Existing permissive React timeline components

| Package or repo | Licence (checked) | Version, last publish | Evidence | Fit for NLE editing | Verdict |
|---|---|---|---|---|---|
| `@xzdarcy/react-timeline-editor` | MIT (npm and GitHub) | 1.0.0, 2026-01-25 | 800 stars, 40 open issues | Rows of actions with start, end and effect id; drag and resize. Open issues: no undo/redo (#73), no multi-select (#74), drag between tracks (#47), drag-resize can make start exceed end (#37), slow with large action arrays (#46). Depends on `interactjs` (MIT, 1.10.28) and `react-virtualized` (MIT, `^9.22.3`) | Reference only. Its data model is the view's, which conflicts with engine-owned state |
| `@designcombo/timeline` 5.5.8 | not checked (no licence field in npm metadata) | 2025-12-05 | none | unknown | Excluded until its licence is checked |
| `@twick/timeline` 0.15.31 | Sustainable Use License (not on our list) | 2026-05-07 | 541 stars; full SDK with undo/redo | Full SDK, not a component | Excluded |
| `@remotion/player` 4.0.536 | "SEE LICENSE IN LICENSE.md" | 2026-10-16 | n/a | n/a | Excluded: AGENTS.md bans Remotion |
| `react-timeline-9000` 2.0.0 | MIT | 2022-07-10 | n/a | "performance focused" | Stale |
| `omniclip` 1.0.7 | ISC (README badge says MIT) | 2024-05-25 | n/a | Web editor, not a library | Ideas only |
| OpenCut (`OpenCut-app/OpenCut`) | MIT | n/a | 95.2k stars; README says it is being rewritten and is not taking outside contributions | Ideas only | Not a dependency |
| `konva` 10.9.0 and `react-konva` 19.3.2 | MIT | 2026-10-15 | Canvas scene graph | Good for a canvas timeline; adds a second rendering model | Fallback if DOM clips are too slow |
| `wavesurfer.js` 8.0.2 | BSD-3-Clause | 2026-10-07 | 10.4k stars; regions and timeline plugins | One waveform per clip | Optional; v1 draws peaks itself |
| `mediabunny` 1.61.6 | MPL-2.0 | 2026-10-16 | 7.3k stars; MP4/WebM read and write over WebCodecs | Strong for in-browser demux | Not on our list; needs a human decision |

**Conclusion.** No permissive, maintained, NLE-grade React timeline was found. The `@xzdarcy` package is the most usable permissive option, but its open issues are the features an editor needs most. Build our own timeline on pointer events and start from the data model: clips with timeline `start`, `duration`, `inPoint`, and `trackId`, all in seconds.

*Limit:* the npm README page returned HTTP 403, so the `@xzdarcy` feature list comes from its GitHub page only. Zoom, snap and waveform support in that library are (unverified).

## 2. Drag and drop: dnd-kit vs native pointer events

- `@dnd-kit/core` 6.3.1 (MIT) was last published 2024-12-05 and is the legacy package. The new `@dnd-kit/react` and `@dnd-kit/dom` 0.5.1 (MIT) were published 2026-10-15 and are pre-1.0, so expect API churn.
- dnd-kit's PointerSensor takes `distance` or `delay`, not both. Use `touch-action: none` on the handle, since pointer listeners cannot block browser touch behaviour (verified on dndkit.com).
- A timeline needs pixel-to-time maths, trim handles, a playhead and snapping to edges. dnd-kit moves items within sortable lists; most of this work is ours either way.
- `setPointerCapture` keeps `pointermove` and `pointerup` on the handle when the pointer leaves it; capture ends on release or `pointerup` (verified, MDN).
- **Verdict.** Native pointer events for clips, trim, playhead and bin-to-track drops. Revisit `@dnd-kit/react` after 1.0 for reorderable lists such as preset stacks.
- **Snapping (design, unverified).** Candidates are clip edges, the playhead, markers and 0. Accept a candidate within about 8 px converted to seconds at the current zoom, show a guide line, and let Alt disable it.
- **Preset drop (design).** The drop target is the track under the pointer; show a ghost that follows the pointer. HTML5 drag-and-drop is not recommended because its drag image is hard to control (unverified).

## 3. Preview playback of many clips

| Approach | Verdict | Reason |
|---|---|---|
| Two alternating `<video>` elements on proxies | **v1** | No decoder code, hardware decode, simple; gaps at cuts are handled by preloading |
| MediaSource (MSE) | v2 if needed | Needs fragmented MP4 segments per timeline; more code |
| WebCodecs `VideoDecoder` | later, for frame-accurate scrubbing | Needs a demuxer (Mediabunny is MPL-2.0) and full codec strings; no demux by itself (verified, MDN) |
| FFmpeg-rendered segments | "full quality" preview only | Identical to export but slow to update after each edit |

**Frame-accurate seeking.**
- `requestVideoFrameCallback` (Baseline 2024) gives `metadata.mediaTime` for each composited frame and `presentedFrames` to detect dropped frames (verified, MDN). Use it for overlays and sync checks, not as the clock. Feature-detect it.
- Seeking lands at or near the requested time, and accuracy depends on keyframe spacing. Old WHATWG discussion and a later forum post both recommend short keyframe intervals (unverified for current browsers).
- Proxy spec (design): 540p or 720p; GOP about 1 s; `-movflags +faststart` (verified in the FFmpeg formats documentation). Pick the codec through the encoder selection in `packages/core/src/render.ts`, since AGENTS.md forbids relying on `libx264` in shipped builds.

**Audio sync (design, to test).** While playing, the timeline clock comes from `performance.now`; while scrubbing, it comes from the element's `currentTime`. Correct an element only when drift passes about 40 ms. v1 plays the audio of the active element only and documents that crossfades and mixing come in v2. Mixing would need WebAudio scheduling of `AudioBufferSourceNode`.

**Text overlays.**
- **DOM (v1).** Accessible, selectable and easy to restyle. Positions are percentages of the frame, so they match the render's coordinates. Load the same font file the render uses, through `@font-face`.
- **Canvas.** Needs manual line wrapping and metrics; use it only for effects.
- **Risk (unverified).** Line height, letter spacing and kerning differ between CSS and FFmpeg's `drawtext`. Measure with a golden-frame test per text preset. Move to canvas only if the difference exceeds about 1 px at 1080p.

## 4. Waveforms and thumbnails

- **Waveform image.** FFmpeg's `showwavespic` takes `s=WxH` and `split_channels=1`; the wiki default size is 600x240 (verified in a search snippet of the FFmpeg wiki; the filter reference was too long to read fully).
- **Peaks for the UI (design).** Decode mono 8 kHz `s16le` to stdout, then keep min and max per bucket, for example 50 buckets per second, as JSON. This avoids `audiowaveform`, which is GPL-3.0 (verified) and may run only as a separate program. wavesurfer.js accepts precomputed peaks (search snippet; the v8 signature is unverified).
- **Drawing.** Set the canvas backing size to CSS size times `devicePixelRatio`; draw vertical min/max bars; redraw only on zoom or clip change (devicePixelRatio handling is unverified in the sources fetched).
- **Thumbnails (filmstrip).** One frame every N seconds at a fixed height, for example `fps=1/N` with `scale`; a contact sheet can use the `tile` filter (filter names from memory, the FFmpeg wiki page was blocked, unverified). Pick the nearest frame by time when drawing.
- **Cache (design).** Key = hash of path, size, mtime and FFmpeg argument version. Store in the app cache directory. Files are immutable, so invalidate by key. Peaks at one fixed resolution let all zoom levels reuse them.

## 5. NLE keyboard conventions

| Action | Premiere (secondary sources) | dax-editor v1 | Note |
|---|---|---|---|
| Play/pause | Space | Space | consistent |
| Shuttle | J reverse, K pause, L forward; repeated J or L speeds up | same | (unverified, search snippets) |
| Split at playhead | C (Razor); Ctrl/Cmd+K (Add Edit) | **S** | Brief asks for S; Premiere uses S for snap |
| Snap toggle | S (one German source only) | **N** | avoids the split conflict |
| Ripple delete | Shift+Delete on Windows; Mac key disputed among sources | Shift+Delete | Mac key unverified |
| Lift | not verified | Delete | leaves a gap (design) |
| Undo/redo | Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z | same | standard |
| Zoom | = / - | +/- | (unverified) |
| Frame nudge | not verified | Left/Right one frame; Shift+Left/Right 1 s | design |
| Mark in/out | I / O | I / O | (unverified) |

Adobe's shortcut page returned HTTP 403 and the Kdenlive docs returned 404, so Premiere rows come from vendor-neutral blog snippets. Ignore shortcuts when focus is in a text field. Provide a `?` help overlay.

## 6. Performance pitfalls and accessibility

- **DOM element count.** A developer's self-reported benchmark (unverified method) showed 114 FPS minimum on canvas vs 39 on DOM with many subtitle clips, and blamed DOM element count and per-element listeners ([dev.to article](https://dev.to/techsquidtv/60-fps-headless-timeline-editor-component-for-react-17j8)). A design-editor case study reports DOM repaints lagging during drag once a page has many styled elements (search snippet, not a timeline). Rule: virtualize tracks and render only clips in the visible window. A clip-node budget of about 500 is a design target (unverified).
- **Re-render storms.** Do not store the playhead in React state at 60 Hz. React requires `getSnapshot` to return the same value until the store changes, or it re-renders and errors with "should be cached" (verified, react.dev). Use selectors for the few components that need the playhead.
- **Drag.** Keep drag state local and commit once. A command per `pointermove` floods undo and the engine. Use pointer capture, `touch-action: none` and a distance threshold so clicks do not start drags (verified on dndkit.com).
- **Trim safety.** Clamp so start stays below end. The reference library has an open issue on this (#37).
- **High-DPI canvas.** Scale the backing store by `devicePixelRatio` and re-measure on resize (general practice, unverified).
- **In-browser FFmpeg.** A "Show HN" thread on an open-source web editor (2024-05, 588 points) reports a 50-80 MB FFmpeg.wasm download, about 10 FPS decode with FFmpeg.wasm, a 4 GB per-tab limit the author accepts, and IndexedDB too slow as swap. The author moved decode and encode to WebCodecs in workers ([HN item](https://news.ycombinator.com/item?id=40331968), read through the Algolia API). This supports server-side FFmpeg proxies over FFmpeg.wasm for preview.
- **Accessibility (APG slider, verified).** `role="slider"`; `aria-valuemin`, `aria-valuemax`, `aria-valuenow`; `aria-valuetext` for timecodes; Left/Right/Up/Down step; PageUp/PageDown larger step; Home/End for min and max; focus on the thumb. Clips are focusable list items: Enter selects, arrows move by a frame, and the label reads start, duration and track.

## 7. UX patterns: chat-left, result-right

**Lovable** (verified on docs.lovable.dev; a product, not a reference implementation):
- Chat is the left panel; the preview is on the right.
- Each response shows activity cards; a Details view lists steps and file changes.
- "Undo latest edit" reverses the most recent change. "Revert to this version" restores an earlier one after confirmation. "Preview" shows the app as it was after a message without reverting. "History" browses versions.
- Plan mode investigates and plans without changing code; the user switches modes with a picker.

**OpenChatCut** (AGPL-3.0; README only, ideas only):
- Edits arrive as proposals: review, preview, then apply, adjust or undo.
- Manual approval is the default; auto approval applies the whole draft at once.
- External agents work in a draft session. The live timeline is untouched until submit, and the session commits as one undo step.
- Draft sessions expose only draft-safe tools; generation, export and project deletion are excluded, because a rejected draft cannot roll them back.
- The README does not say how a manual edit made during a pending draft is merged (a gap).

**Recommendation for dax-editor.**
- A proposal card in the chat with a summary (for example "removed 4 silences, -12.4 s"), **Preview** (the timeline plays the proposed state with a ghost overlay; the project is unchanged), **Apply** (one undo step) and **Discard**.
- Each proposal records its base revision. A manual edit after the proposal marks it stale; offer a new proposal rather than silently merging.
- No mode switch. Manual and AI edits share one undo stack. "Edit" on an AI-created clip selects it and opens the inspector.
- Keep chat history and proposals in the engine, not browser storage.

## 8. Testing the UI headlessly

- Install and run: `PLAYWRIGHT_BROWSERS_PATH=$HOME/pw-browsers npx playwright install` and the same variable at test time (verified, Playwright docs). The preinstalled Chromium `chromium-1194` in `/opt/pw-browsers` must match the installed Playwright version (unverified; check with a launch test).
- Run the React UI in Vite with a mocked engine adapter. Drag with `page.mouse.down`, several `move` steps, then `up`. Assert on revision and clip times exposed through `data-` attributes or a test-only store, and use pixel checks only for visual snapshots.
- Tauri: `tauri-driver` supports Windows and Linux; the WebdriverIO Tauri service with its embedded server supports Windows, Linux and macOS (verified, v2.tauri.app). Browser mode runs the frontend in Chrome and intercepts `invoke()`, so it does not test the backend.
- Parity test: fixed lavfi footage, FFmpeg renders frame N, Playwright screenshots the preview at the same time, compare within a tolerance.

## Pitfalls

- Preview drift after cuts when the next clip is not preloaded, or when proxy GOPs are long.
- Playhead in React state causes re-render storms.
- Each pointer move committed as an undo step, or sent to the engine.
- Pointer capture not set, so drags break when the pointer leaves the handle; no `touch-action: none`, so touch scrolls instead.
- DOM clip count grows with the project; no virtualization.
- Text overlays that look right in CSS but differ from the render (line height, kerning).
- Licence drift: Mediabunny (MPL-2.0), Twick (SUL), `audiowaveform` (GPL-3.0), Remotion and OpenChatCut (AGPL-3.0) must not enter the dependency tree.
- `@dnd-kit/react` is pre-1.0; `@dnd-kit/core` is legacy and last published 2024-12.
- Relying on `libx264` in a shipped build.

## Unverified

- Snapping thresholds, the clip-node budget, the 40 ms drift threshold, GOP length, and the audio design.
- `tile` and `fps` thumbnail filter syntax; devicePixelRatio canvas handling; DOM vs canvas text parity.
- Premiere shortcuts (secondary sources only); Mac ripple-delete key; S for snap in Premiere.
- The preinstalled Chromium version against Playwright 1.64.1.
- Whether the `@xzdarcy` library handles zoom, snapping and waveforms (its npm README was blocked).
- Reddit threads: the fetch tool could not reach Reddit, and search returned no relevant threads, so no Reddit developer discussion is cited.

## Sources

Fetched (2026-10-18):
- https://github.com/xzdarcy/react-timeline-editor
- https://github.com/xzdarcy/react-timeline-editor/issues
- https://github.com/clauderic/dnd-kit
- https://github.com/katspaugh/wavesurfer.js
- https://github.com/OpenCut-app/OpenCut
- https://github.com/ncounterspecialist/twick
- https://github.com/Vanilagy/mediabunny
- https://github.com/0xsline/OpenChatCut
- https://github.com/bbc/audiowaveform
- https://github.com/mui/material-ui/blob/master/LICENSE (licence format check only)
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback
- https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
- https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture
- https://ffmpeg.org/ffmpeg-filters.html (truncated)
- https://ffmpeg.org/ffmpeg-formats.html (truncated)
- https://www.w3.org/WAI/ARIA/apg/patterns/slider/
- https://playwright.dev/docs/browsers
- https://v2.tauri.app/develop/tests/webdriver/
- https://dndkit.com/api-documentation/sensors/pointer
- https://docs.lovable.dev/features/projects/chat
- https://dev.to/techsquidtv/60-fps-headless-timeline-editor-component-for-react-17j8
- https://react.dev/reference/react/useSyncExternalStore
- https://news.ycombinator.com/item?id=40331968 (read via https://hn.algolia.com/api/v1/items/40331968)
- https://hn.algolia.com/api/v1/search?query=browser%20video%20editor%20timeline&tags=story&hitsPerPage=15

Package metadata (npm registry, via `npm view`, 2026-10-18): `@xzdarcy/react-timeline-editor`, `@xzdarcy/timeline-engine`, `@dnd-kit/core`, `@dnd-kit/react`, `@dnd-kit/dom`, `wavesurfer.js`, `@wavesurfer/react`, `konva`, `react-konva`, `react`, `zustand`, `immer`, `@tanstack/react-virtual`, `react-virtualized`, `interactjs`, `react-hotkeys-hook`, `@playwright/test`, `playwright-core`, `mediabunny`, `@designcombo/timeline`, `@twick/timeline`, `@remotion/player`, `react-timeline-9000`, `omniclip`.

Search results only (not opened): Premiere shortcut snippets (firecut.ai, vidpros.com, filmimpact.com, hongkiat.com); FFmpeg showwavespic snippets (trac.ffmpeg.org/wiki/Waveform, ffmpeg-cvslog 2015); wavesurfer peaks snippets (wavesurfer.xyz/docs/peaks/); WHATWG 2011 threads (lists.whatwg.org); Lovable and browser-editor search results.

Not reachable: Reddit (fetch tool refused); Adobe help (403); npmjs.com package page (403); Kdenlive docs (404); Zustand transient-update guide (404); FFmpeg Waveform wiki and thumbnail wiki (bot-check block); GitHub API via the session's `gh` for these repositories (not enabled for the session).
