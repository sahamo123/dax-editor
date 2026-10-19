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
| `src/api/local-model.ts` | `LocalModelAction`: the UI's names for what it can do to the local model (each maps to one `/api/local-model/*` endpoint). The status and reply shapes live in `@dax/protocol`. |
| `src/platform.ts` | `getServerInfo()`, `pickFiles()`, `pickSavePath()`, `onFileDrop()`. Web reads `?server=&token=`; Tauri code is imported lazily. |
| `src/app/store.ts` | zustand vanilla store: server state, connection, chat transcript, toasts, UI flags. |
| `src/app/controller.ts` | Everything that talks to the server (commands, import, export, chat, settings). Components call this, never `fetch`. |
| `src/app/chat-model.ts` | Pure: `chat` events to transcript; when "Undo this change" is safe. |
| `src/app/layout/` | `Shell` (grid, resizable panels, hosts the editor), `Drawer`, `EmptyState`, `ConnectionBanner`. |
| `src/app/chat/`, `settings/`, `history/`, `media/`, `topbar/`, `dialogs/` | The panels and dialogs. |
| `src/app/styles/` | `tokens.css` (design tokens), `base.css`, `components.css`. |
| `e2e/mock-server.mjs` | The engine the fast e2e specs use: the REAL `@dax/server` in-process, with only a scripted assistant, a fake local model and settable CLI sign-in states injected through the server's own interfaces. Shapes cannot drift because nothing is re-implemented. |
| `e2e/real-engine.mjs` | Starts the real `dax-engine` process (what the desktop sidecar runs), nothing faked. `e2e/fake-model.mjs` is an OpenAI-compatible stand-in the real agent can talk to. |
| `e2e/engine-api.mjs` | Test-side REST helper (state, command, import, settings), separate from the app's own client. |
| `e2e/*.spec.ts` | Playwright tests (Chromium at `/opt/pw-browsers/chromium`, headless). `real-engine.spec.ts` runs against `dax-engine`; the rest against `mock-server.mjs`. |

## Commands

```sh
pnpm --filter @dax/desktop dev          # vite dev server on :5173 (open /?server=URL&token=TOKEN)
pnpm --filter @dax/desktop mock-server  # node e2e/mock-server.mjs --port 4399 --token dev-token-dev-token --ai [--video file.mp4]  (token: 16+ chars)
pnpm --filter @dax/desktop build        # typecheck + production build (dist/)
pnpm --filter @dax/desktop test         # Vitest + Testing Library
pnpm --filter @dax/desktop test:e2e     # Playwright: builds the engine and its packages, then the app (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers)
pnpm --filter @dax/desktop docs:check   # TSDoc coverage
pnpm exec biome check --write apps/desktop
```

Build `@dax/core` and `@dax/protocol` first (`pnpm --filter @dax/core build`, same for protocol). `test:e2e` builds `@dax/engine` and everything it needs itself; after changing server or engine code run `pnpm --filter "@dax/engine..." build` so the e2e does not run stale code. Screenshots from the e2e run go to `test-results/shots/` (override with `SHOTS_DIR`); look at them after UI changes.

## Rules specific to this app

- **One way to change a project:** call `controller.run(name, args)` (the `EditorApi.run`). Never build project edits in the UI.
- **Works without AI.** Nothing outside the chat panel may depend on a provider being configured. Chat controls are disabled with an explanation, never hidden.
- **Secrets:** an API key lives only in a password input until Save, is sent once to `/api/settings/api-key`, then cleared. Never put a key in the store, a log, a URL or `localStorage`.
- **Server unreachable:** controls that need the engine are disabled and `ConnectionBanner` explains it. Do not add features that assume the socket is up without checking `connection.status`.
- **Selectors must return stable references** (zustand 5): select primitives or existing objects, derive new arrays with `useMemo`.
- **Browser storage** is only for per-viewer conveniences (panel sizes, last tab); always in try/catch.
- **Style:** use the CSS variables from `tokens.css` (the editor module should too: `--bg-0..4`, `--border`, `--text`, `--text-dim`, `--accent`, `--ok`, `--danger`, `--ai`, `--radius`). Dark theme only for now. Every control needs an accessible name and a visible `:focus-visible` ring.
- **Keyboard shortcuts:** the shell owns Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z and Ctrl+Y (`use-shortcuts.ts`); the editor owns playback and timeline keys (`useEditorShortcuts`). Do not bind undo/redo in both places.
- **The server is the source of truth for every shape.** Shared request/reply types (`LocalModelStatus`, `JobStarted`, `ChatStarted`, `CancelResponse`, `ImportResult`, ...) live in `@dax/protocol` as zod schemas; the client checks the ones it cannot afford to guess (local model status, job ids). Facts the UI relies on, all verified by `e2e/real-engine.spec.ts`:
  - `GET`/`PUT /api/settings` return `Settings` (400 `{ error }` if invalid). `POST /api/settings/api-key` returns the refreshed `ProviderStatus[]` (never the key). `GET /api/providers` always re-checks (no cache), which "Check again" needs.
  - `POST /api/import` is HTTP 200 `{ ok: false, error }` when nothing imported, else `{ ok: true, summary, data: ImportResult }` (some files may have failed). Only a malformed request is a 4xx.
  - `POST /api/chat` is 202 `{ runId }`. A provider that is not set up is **not** a refused request: the run's first event is an `error`. 409 only if a run is already active. `POST /api/chat/cancel` returns `{ cancelled }`.
  - `export_video` through `POST /api/command` answers when FFmpeg has started (`data.jobId`); the end of the export arrives as `job` events (`result` is the file written), so the "Exported ..." toast comes from the job, not the reply.
  - Local model: `GET /api/local-model` returns the flat `LocalModelStatus` (`detail` always present, `label`/`description`/`sizeBytes`/`modelId` when known, `supported: false` when the build has no runtime). Actions are separate endpoints: `POST /api/local-model/install|start` (202 `{ jobId }`), `stop|uninstall` (200 `{ ok: true }`), `cancel` (200 `{ cancelled }`). None returns the new status, so the controller re-reads it. The jobs' own labels ("Downloading the local model") are shown as is.
  - A `cli-*` provider omits `signedIn` when the tool is not installed or cannot be driven; `signedIn: false` means installed but signed out.
  - Project new/open/save return the full `StateResponse` (the UI does not call them yet). A rejected token is 401 `{ error }`; the client shows one fixed sentence for it.
  - The server refuses tokens shorter than 16 characters and any `Origin` not in its `--origin` list (the web build runs at `http://127.0.0.1:4173` in the e2e; the Tauri shell must pass its own origin).
