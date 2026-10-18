# apps/desktop/src/editor

The editor module of `@dax/desktop`: **preview player, timeline, presets panel, inspector, editor toolbar and keyboard
shortcuts.** It must be a good manual editor with no AI at all. Root rules in `/AGENTS.md` apply; the interface it shares
with the app shell is in `docs/specs/product-v1.md` ("UI split: two builders, one interface").

## Public surface (`index.ts`, the only thing the shell imports)

`EditorProvider({ api, children })`, `useEditor(): EditorApi & EditorUi`, `PreviewPane`, `Timeline`, `PresetsPanel`,
`Inspector`, `EditorToolbar({ history? })`, `useEditorShortcuts()`, and the type `EditorApi`. It also imports
`ui/editor.css` (namespaced `.dx-*`; colours come from the shell's tokens such as `--bg-1`, `--accent`, with fallbacks).

Integration rules:

- Give `PreviewPane` and `Timeline` a parent with a **definite size** and `min-width: 0` (grid and flex items otherwise grow to the
  timeline's scroll width). `PreviewPane` sizes its 16:9 stage with container query units.
- Call `useEditorShortcuts()` **once**, inside the provider. It binds Space/K/L/J, S, Delete/Backspace, arrows, Home/End,
  +/-, Shift+Z, Escape. It does **not** bind undo/redo: the shell owns Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z and Ctrl+Y.
- `EditorToolbar` hides its own Undo/Redo buttons unless `history` is passed (the shell has them in its top bar).
- Pass a new `api` object (or at least a new `api.state`) whenever the server state changes.

## The one rule

**Project data comes only from `api.state`; every edit is `api.run(name, args)`** (through `useExec`). The editor keeps only
UI state (playhead, playback, selection, zoom, snapping, drag previews). While dragging, the timeline shows a local
preview computed by pure functions; on release it sends one command and holds the preview until the history revision
changes (or 3 s, or the command fails).

## Architecture

```
index.ts            public surface
types.ts            EditorApi / EditorUi (the contract)
store.ts            EditorStore: external store (useSyncExternalStore) with playhead, playback, selection, zoom,
                    preset drag. Kept outside React so the 60 Hz playhead never re-renders what does not read it.
context.tsx         EditorProvider, useEditor, useExec (runs a command, records failures), selectors
actions.ts          split / delete / undo / redo / addPreset wrappers shared by toolbar, shortcuts, timeline
shortcuts.ts        useEditorShortcuts
lib/                PURE logic with unit tests (no React, no DOM): geometry (zoom, ticks), snap, clip-layout (ripple
                    trim and reorder previews), overlay-layout (lane rows, move/resize), overlay-anim (animation
                    presets and text layout, mirrors core's overlay-filters.ts), captions-preview (mirrors core's
                    captions.ts), media-cache (waveform/filmstrip loading), project, time
playback/engine.ts  PlaybackEngine: plays the EDIT with two <video> elements used ping-pong (the next clip is preloaded
                    and seeked, then swapped in at the cut). The playing element's clock is the master clock.
playback/controller connects store <-> engine synchronously (so play() runs inside the user gesture)
preview/            PreviewPane (video + overlays + captions as DOM/CSS), OverlayLayer, CaptionLayer
timeline/           Timeline (layout) + gesture hooks (useClipGestures, useOverlayGestures, useTimelineView),
                    ClipBlock, OverlayBlock, Ruler, Playhead (moved imperatively), Filmstrip, Waveform, drag-session
presets/            PresetsPanel (pointer-event drag, not HTML5 DnD, because Tauri webviews break it), PresetChip
inspector/          Inspector, useDraft (debounced field editing)
toolbar/            EditorToolbar
dev/                dev harness: mock server, harness page, Playwright e2e (below)
```

### Playback in one paragraph

`PlaybackEngine.tick()` runs every animation frame. The playhead is `clip.start + media.currentTime - clip.in` of the
playing element. Within one frame of a cut it swaps to the standby element, which was preloaded for the next clip and is
already showing its first frame, so the switch is gap-free. Clips of the same file that continue exactly (a split) do not
switch at all. If the next clip is not ready the engine holds at the cut and shows "Loading". Volume and fades are applied
per frame (`volume` is capped at 1 in the preview, which uses `HTMLMediaElement.volume`; the export applies the real gain).
J plays in reverse by stepping the playhead (silent). Browsers that refuse `play()` without a gesture show a "Click to play"
button (`onBlocked`).

### Media URLs and formats (assumptions the protocol does not spell out)

`mediaUrl(serverUrl, token, assetId, kind)`: `proxy.mp4` plays in `<video>`; `thumb.jpg` is one poster frame;
`filmstrip.jpg` is **one row of equally spaced frames across the whole asset** (the frame count is inferred from the image
size and the video's aspect ratio); `waveform.json` is a JSON array of peaks, or `{ "peaks": [...] }`, spread evenly over
the whole asset (normalised on load). If any of these 404s the timeline degrades (thumb, then gradient; no waveform) and the
preview shows "Preparing preview..." and reloads when a `proxy` job finishes.

## Running and testing

```sh
pnpm --filter @dax/core build && pnpm --filter @dax/protocol build     # once; the mock server uses the real core
pnpm --filter @dax/desktop editor:dev          # Vite harness on :5180 (needs the mock server below)
pnpm --filter @dax/desktop editor:mock         # mock server on :4390, token dev-token; generates FFmpeg demo media
pnpm --filter @dax/desktop editor:test         # Vitest + Testing Library (editor files only)
pnpm --filter @dax/desktop editor:e2e          # Playwright, starts both servers itself (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers)
pnpm --filter @dax/desktop editor:typecheck
```

The shell's `pnpm --filter @dax/desktop test` also runs the editor's Vitest files. Open the harness at
`http://127.0.0.1:5180/` (defaults to the mock server). `dev/mock-server.ts` applies commands with the real `@dax/core`
`Session` and `tryRunCommand`, and serves WebM (VP9/Opus) as `proxy.mp4` with Range support because the bundled Chromium
has no H.264. Playwright screenshots go to `dev/.artifacts/screenshots/` (git-ignored): look at them after UI changes.

## Things to know before changing code

- Times are seconds; say "source time" or "timeline time". Clip `in/out` are source time, `start` is timeline time.
- The main track is **gapless and rippling**: trim, delete and reorder move everything after. The previews in `lib/clip-layout.ts`
  reproduce what `trim_clip`, `move_clip`, `remove_clip` do, and are tested against them in spirit (see the tests).
- Keep `lib/overlay-anim.ts` and `lib/captions-preview.ts` in step with `packages/core/src/overlay-filters.ts` and
  `captions.ts`. The tests compare the constants and results with the core functions.
- `useEditorSelector` selectors must return primitives or stable references; `useEditor()` re-renders on every playhead tick,
  so internal components use selectors instead.
- Do not import `@dax/core` at runtime in browser code (it pulls in Node APIs): `import type` only. Tests and the mock server may.
- Pointer drags use `timeline/drag-session.ts` (pointer capture + window listeners, Escape cancels, edge auto-scroll).

## Known gaps

- `update_overlay` / `move_overlay` cannot set `lane`, and `update_overlay` cannot set the box or accent colour, so overlays are
  not draggable between lanes and those two style fields are not in the Inspector.
- `PresetInfo` has no `style`, so preset chips derive their look from the category unless the server adds a `style` field.
- Preview volume above 100% is not audible in the preview (element volume maxes at 1). `fit: "blur"` is previewed as `contain`.
- The Inspector has no controls for captions or the format (`set_captions`, `set_format`) yet; captions are only previewed.
- Overlay text uses the `Inter` font family if the page provides it (the harness loads the core fonts); otherwise a system sans.
- Per-element autoplay unlocking for WebKit (macOS Tauri) is untested: a refusal shows the "Click to play" button.
