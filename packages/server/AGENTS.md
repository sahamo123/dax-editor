# packages/server

The engine server: a local HTTP + WebSocket API (`@dax/protocol`) over the core command registry. The desktop app, and later the CLI and MCP bridge, talk to this. Root rules in `/AGENTS.md` apply; this file adds package specifics.

Run: `pnpm --filter @dax/server build && node packages/server/dist/cli.js --data-dir /tmp/dax --origin http://localhost:5173` (prints one JSON `ServerInfo` line).
The desktop app's e2e tests run this server in-process (`apps/desktop/e2e/mock-server.mjs`) and the full `dax-engine` as a process (`real-engine.mjs`), so an API change is checked against the real UI.
Test: `pnpm --filter @dax/server test` (needs FFmpeg; media tests skip without it; the CLI tests need a prior `build`).

## Module map

| File | Responsibility |
|---|---|
| `server.ts` | `startServer()`: listener, **security gate** (Host, Origin, token), WebSocket upgrade, graceful close. |
| `routes.ts` | The route table: one handler per `API` path, thin over `Engine`. |
| `engine.ts` | All mutable state and logic with no HTTP: commands, import, export job, chat runs, settings, local-model tasks, state assembly and the coalesced `state` broadcast, shutdown. |
| `project-manager.ts` | `EngineSession` (a core `Session` that autosaves atomically and reports every change, including AI edits) and new/open/save. |
| `media-pipeline.ts` | Proxy / waveform / filmstrip / thumbnail generation, cache layout, encoder fallback, concurrency limits. |
| `range.ts` | HTTP Range parsing and file streaming (`sendFile`). |
| `security.ts`, `paths.ts` | Token/Host/Origin helpers; allowed-root containment with symlink resolution; id format. |
| `http-util.ts` | `Router`, size-limited JSON body reading, `HttpError`. |
| `hub.ts` | WebSocket broadcast, heartbeat, backpressure. |
| `stores.ts` | `settings.json`, `secrets.json` (0600), `state.json`, atomic writes. |
| `jobs.ts` | `JobInfo` bookkeeping and throttled progress. |
| `interfaces.ts`, `stubs.ts` | The injected seams (`AgentRunner`, `ProviderRegistry`, `LocalModelController`) and their stand-ins (`ScriptedRunner`, `NullProviderRegistry`, ...). |
| `cli.ts`, `args.ts` | The `dax-server` executable. |
| `test/harness.ts` | Test helpers: real server on a temp dir, raw requests, WebSocket recorder, FFmpeg fixtures. |

## Invariants (break these and things go subtly wrong)

- **Every request passes Host -> Origin -> token, in that order, before any route.** Query-string tokens are accepted only for `GET/HEAD /api/media/*` and `/ws`. Do not add a route that skips the gate. CORS headers are only ever sent for origins in the `--origin` allow-list; never `*`.
- **Never log, return or store a secret outside `secrets.json`.** Everything logged goes through `Logger` (it redacts the token and API keys). Chat events from the runner are scrubbed too. Never log a URL's query string.
- **Client-supplied paths go through `resolveInsideRoots`** (absolute, inside `--allow-root`, symlinks resolved). Client-supplied ids go through `isSafeId` and an `Object.hasOwn` lookup in the open project's assets (`__proto__` matches the id regex!). Opened project files are untrusted: their asset paths are re-checked on open and again before FFmpeg runs.
- **The server does not import `@dax/agent` or `@dax/local-llm`.** The launcher injects `AgentRunner` (or a factory), `ProviderRegistry`, `LocalModelController`.
- **A command that ran and failed is HTTP 200 `{ ok: false, error }`**; a malformed or forbidden *request* is a 4xx `{ error }`.
- **Edits are serialised** (`Engine.serial`) and mutating commands are refused with `ok: false` while an AI run is active (`busy`). Exports run outside that lock on an immutable project snapshot.
- Anything that changes the project must go through the session (`apply`/`undo`/`redo`/`restore`/`checkpoint`): `EngineSession` turns those into a pushed `state` event and a media scan. Do not mutate `session.project` directly.
- FFmpeg output always goes to a temp name and is renamed when complete, so a partial file is never served. Arguments are arrays, never shell strings.
- stdout is for the single `ServerInfo` line only; logs go to stderr.

## Data directory layout

```
<data>/settings.json     provider choice + base URLs/models (no keys)
<data>/secrets.json      API keys, mode 0600, never returned by the API
<data>/state.json        path of the project to reopen on launch
<data>/projects/*.dax.json   scratch projects (autosaved); user-saved projects live where the user chose
<data>/cache/<key>/      per source file (key = hash of path+size+mtime): proxy.mp4, waveform.json,
                         filmstrip.jpg, thumb-<tenths>-<width>.jpg
```

## Media URLs (see `mediaUrl()` in the protocol)

The waveform and filmstrip formats are defined in the protocol (`WaveformSchema`, `FILMSTRIP_FRAME_WIDTH/HEIGHT`, `filmstripFrameCount`, `waveformRate`); the desktop editor reads them from there, so change them there, not here.

- `proxy.mp4`: 480p H.264 (or best available encoder) + AAC, about 0.5 s GOP, `+faststart`; 404 until its `proxy` job is done. Range supported.
- `thumb.jpg?t=<sec>&w=<px>`: JPEG, `t` clamped to the media, `w` 16..640 (default 160), made on demand and cached.
- `waveform.json`: `{ version, duration, peaksPerSecond, peaks[] }`, peaks in 0..1 (50/s, fewer for very long media). 404 if no audio.
- `filmstrip.jpg`: one row of `N` frames, each 96x54, so the image is `N*96` wide; `N = clamp(ceil(duration), 4, 120)` and is also sent as the `X-Dax-Frames` header.

## Local model and providers (what the UI relies on)

- `GET /api/local-model` is the controller's `status()` (`LocalModelStatus` from the protocol: `detail` is always set; `supported: false` means no runtime in this build). `install` and `start` are `model-download` / `model-start` jobs (202 `{ jobId }`, 409 if a local task is already running); `stop` and `uninstall` answer `{ ok: true }`; `cancel` answers `{ cancelled }`. `uninstall` stops the model first, answers 409 during a task and 501 when the controller has no `uninstall()`.
- `GET /api/providers` always asks the registry again (the `state` push uses a 5 s cache). `POST /api/settings/api-key` and `DELETE` answer with the refreshed `ProviderStatus[]`.

## Extending

New endpoint: add the path to `API` in the protocol (lead's call), and put its request and reply shapes there as zod schemas (the desktop client imports them; do not define a shape only in the server), add a method on `Engine`, a line in `routes.ts`, and a test in `server.test.ts` *and* a 401 case in `security.test.ts`. New injected capability: define the interface in `interfaces.ts` plus a null/fake in `stubs.ts` so tests need no real backend.
