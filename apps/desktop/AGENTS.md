# apps/desktop

The desktop UI (`@dax/desktop`): React 18 + TypeScript + Vite + zustand. Chat on the left, preview over timeline on the right, a tabbed drawer (Presets, Inspector, Media, History). Root rules in `/AGENTS.md` and the spec in `docs/specs/product-v1.md` ("apps/desktop UI") apply. The Tauri shell lives in `src-tauri/` and is owned separately; do not edit it from here.

## Two builders, one interface

- **App shell** (this package): `src/app/**`, `src/api/**`, `src/platform.ts`, `src/main.tsx`, `index.html`, Vite/Vitest/Playwright config, `e2e/mock-server.mjs`.
- **Editor module**: `src/editor/**` (preview, timeline, presets panel, inspector, editor toolbar, shortcuts). The shell only touches it through `EditorApi` / `EditorUi` / `EditorProvider` / `useEditor()` and the components exported from `src/editor/index.ts`.
- `src/editor/index.ts` and `types.ts` in the shell branch are a **placeholder** with the exact public surface. At merge, take the editor builder's versions of everything under `src/editor/`.

## Map

| Path | Purpose |
|---|---|
| `src/api/client.ts` | Typed REST client. Never throws; failures are `{ ok: false, error }`. |
| `src/api/socket.ts` | WebSocket with exponential-backoff reconnect (token in `?token=`). |
| `src/api/local-model.ts` | Body shapes for `/api/local-model` (not yet in `@dax/protocol`). |
| `src/platform.ts` | `getServerInfo()`, `pickFiles()`, `pickSavePath()`, `onFileDrop()`. Web reads `?server=&token=`; Tauri code is imported lazily. |
| `src/app/store.ts` | zustand vanilla store: server state, connection, chat transcript, toasts, UI flags. |
| `src/app/controller.ts` | Everything that talks to the server (commands, import, export, chat, settings). Components call this, never `fetch`. |
| `src/app/chat-model.ts` | Pure: `chat` events to transcript; when "Undo this change" is safe. |
| `src/app/layout/` | `Shell` (grid, resizable panels, hosts the editor), `Drawer`, `EmptyState`, `ConnectionBanner`. |
| `src/app/chat/`, `settings/`, `history/`, `media/`, `topbar/`, `dialogs/` | The panels and dialogs. |
| `src/app/styles/` | `tokens.css` (design tokens), `base.css`, `components.css`. |
| `e2e/mock-server.mjs` | Stand-in engine: real `@dax/core` Session and `runCommand`, FFmpeg proxies, WebSocket events, scripted chat. |
| `e2e/*.spec.ts` | Playwright tests (Chromium at `/opt/pw-browsers/chromium`, headless). |

## Commands

```sh
pnpm --filter @dax/desktop dev          # vite dev server on :5173 (open /?server=URL&token=TOKEN)
pnpm --filter @dax/desktop mock-server  # node e2e/mock-server.mjs --port 4399 --token dev --ai [--video file.mp4]
pnpm --filter @dax/desktop build        # typecheck + production build (dist/)
pnpm --filter @dax/desktop test         # Vitest + Testing Library
pnpm --filter @dax/desktop test:e2e     # Playwright (builds first; PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers)
pnpm --filter @dax/desktop docs:check   # TSDoc coverage
pnpm exec biome check --write apps/desktop
```

Build `@dax/core` and `@dax/protocol` first (`pnpm --filter @dax/core build`, same for protocol). Screenshots from the e2e run go to `test-results/shots/` (override with `SHOTS_DIR`); look at them after UI changes.

## Rules specific to this app

- **One way to change a project:** call `controller.run(name, args)` (the `EditorApi.run`). Never build project edits in the UI.
- **Works without AI.** Nothing outside the chat panel may depend on a provider being configured. Chat controls are disabled with an explanation, never hidden.
- **Secrets:** an API key lives only in a password input until Save, is sent once to `/api/settings/api-key`, then cleared. Never put a key in the store, a log, a URL or `localStorage`.
- **Server unreachable:** controls that need the engine are disabled and `ConnectionBanner` explains it. Do not add features that assume the socket is up without checking `connection.status`.
- **Selectors must return stable references** (zustand 5): select primitives or existing objects, derive new arrays with `useMemo`.
- **Browser storage** is only for per-viewer conveniences (panel sizes, last tab); always in try/catch.
- **Style:** use the CSS variables from `tokens.css` (the editor module should too: `--bg-0..4`, `--border`, `--text`, `--text-dim`, `--accent`, `--ok`, `--danger`, `--ai`, `--radius`). Dark theme only for now. Every control needs an accessible name and a visible `:focus-visible` ring.
- **Keyboard shortcuts:** the shell owns Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z and Ctrl+Y (`use-shortcuts.ts`); the editor owns playback and timeline keys (`useEditorShortcuts`). Do not bind undo/redo in both places.
- **API assumptions the protocol does not spell out** (keep in sync with `@dax/server`): `GET`/`PUT /api/settings`; `POST /api/settings/api-key` returns no key; `POST /api/import` returns `CommandResponse`-shaped JSON (`{ ok: true, summary }` or an error status with `{ error }`); `POST /api/chat` returns immediately (any 2xx) and events follow on the socket, a refusal is non-2xx with `{ error }`; `GET`/`POST /api/local-model` use the shapes in `src/api/local-model.ts`; a `cli-*` provider omits `signedIn` when the tool is not installed.
