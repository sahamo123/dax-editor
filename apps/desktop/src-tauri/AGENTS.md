# AGENTS.md: the Tauri shell (`apps/desktop/src-tauri`)

Read `/AGENTS.md` first. This file covers only the Rust shell and how the app is packaged.

## What the shell is (and is not)

A small Tauri 2 host. It opens the window, shows the native open-file dialog, delivers drag-and-drop paths, and runs the engine server as a sidecar process. **It contains no editing logic**; that lives in `packages/core` and is served by `packages/server`. Keep the Rust side small. If you are tempted to add editing features here, put them in the TypeScript engine instead.

## Layout

| Path | What |
|---|---|
| `src/lib.rs` | App wiring: plugins, setup, window/exit handling, launch config. |
| `src/sidecar.rs` | Starts, supervises and stops the server. No Tauri types, so it is unit-testable. |
| `src/guard.rs` | Orphan prevention per OS (process group, `PDEATHSIG`, Windows job object). |
| `src/server_info.rs` | `ServerInfo` parsing/validation and token generation. |
| `src/health.rs` | Dependency-free `/api/health` probe. |
| `src/commands.rs` | IPC commands the page may call (`get_server_info`). |
| `build.rs` | Declares app commands to the permission system, runs Tauri codegen. |
| `capabilities/main.json` | The page's permissions. Least privilege; see below. |
| `tauri.conf.json` | Window, CSP, bundle (installers, sidecars, resources). |
| `entitlements.plist` | macOS hardened-runtime entitlements (JIT for Node). |
| `../sidecars.lock.json` | Pinned, checksummed Node and FFmpeg downloads. |
| `../scripts/` | `prepare-sidecars.mjs`, `build-ffmpeg-lgpl.sh`, tests. |
| `../shell-placeholder/` | Temporary page and stand-in server used until the real UI and server land. |

Generated and never committed: `binaries/`, `resources/`, `gen/`, `target/`, `../.cache/`.

## Commands (from the repo root unless noted)

```sh
pnpm dev:desktop                     # prepare dev sidecars, then `tauri dev`
pnpm build:desktop                   # release: download pinned Node + LGPL FFmpeg, bundle server, `tauri build`
pnpm --filter @dax/desktop shell:test   # script tests + `cargo test`
pnpm --filter @dax/desktop shell:lint   # cargo fmt --check + clippy -D warnings
cd apps/desktop && pnpm exec tauri build --debug --bundles deb   # quick Linux package, for smoke tests
```

Linux build libraries (`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, ...) must be installed. `pnpm dev:desktop` needs `ffmpeg` on `PATH`; `build:desktop` does not (it downloads the pinned build).

## The server contract (shell to `dax-server`)

The server builder must honour exactly this; it is also in `docs/specs/product-v1.md`.

- **Launch:** `dax-node <entry> --port 0 --data-dir <dir> --origin <o>...` with the working directory set to the data dir. Origins passed: `tauri://localhost`, `http://tauri.localhost`, `https://tauri.localhost` (plus the Vite dev origin in debug builds).
- **Environment:** `DAX_SERVER_TOKEN` is the bearer token the server must require (generated per launch, 64 hex chars; the server must read it, and may generate its own only if it is unset). `DAX_FFMPEG` / `DAX_FFPROBE` are the bundled binaries (already read by `packages/core/src/exec.ts`). `NODE_OPTIONS` is removed, `NODE_ENV=production` is set. The token is never in argv.
- **Ready line:** one `ServerInfo` JSON line on stdout (`{url, token, port, version}`); `url` must be `http://127.0.0.1:<port>` (the shell rejects anything else) and `port` must match. Everything else on stdout and stderr is treated as log output; never print secrets.
- **Health:** the shell sends `GET /api/health` with `Authorization: Bearer <token>` and requires 200 before telling the UI it is ready.
- **Shutdown:** exit when **stdin reaches end-of-input** (the shell holds the only write end; it disappears when the app exits or crashes) and on `SIGTERM` (Unix). On either, stop children (FFmpeg, `llama-server`) and exit promptly. A server that ignores both can survive an app crash; that is a server bug.
- **Files the server reads at runtime** (fonts) must be located relative to the bundled entry file: `resources/server/cli.mjs` finds `../assets/` (copied from `packages/core/assets`). Do not rely on `node_modules` or the repo layout.
- Paths from the native dialog and drag-and-drop can be anywhere (external drives, `D:\`). The server's `--allow-root` defaults (home and data dir) will refuse some of them. Decide that policy in the server (for example, allow roots the shell registers); the shell currently does not.

## Swapping the stand-in for the real server

Today `prepare-sidecars.mjs` bundles `shell-placeholder/dax-server-standin.mjs` as `resources/server/cli.mjs` because `packages/server/dist/cli.js` does not exist yet. Once it does:

1. `pnpm --filter @dax/server build`.
2. `pnpm dev:desktop` / `pnpm build:desktop`. The script finds `packages/server/dist/cli.js` automatically and bundles it with esbuild into one `cli.mjs` (release builds refuse the stand-in unless `--allow-standin` is passed).
3. For live server development without re-bundling: `DAX_SERVER_ENTRY=/abs/path/packages/server/dist/cli.js pnpm dev:desktop` (debug builds only; the override is compiled out of release builds). `DAX_NODE` overrides the Node binary the same way.
4. Point the shell at the real UI: in `tauri.conf.json` set `build.devUrl` to the Vite URL, `build.frontendDist` to `../dist` (the UI's build output), and add `build.beforeDevCommand` / `build.beforeBuildCommand` (`pnpm --filter @dax/desktop dev` / `build`, whatever the UI package defines). Then delete `shell-placeholder/web/` (keep the stand-in server if it is still useful for shell tests).
5. If the UI needs more IPC (it should not; prefer the server), add the command in `commands.rs`, list it in `build.rs`, and grant it in `capabilities/main.json`.

## Least privilege (do not weaken without an ADR)

- The page may call: `get_server_info`, `dialog:allow-open` (open dialog only), and event listen/unlisten (for drag-and-drop and status events). Nothing else: no shell, fs, http, window control, opener, clipboard.
- We deliberately do **not** use `tauri-plugin-shell`: Rust starts the sidecar directly, so the page has no way to spawn processes, and we control process groups ourselves.
- No `assetProtocol`: media is served by the engine server over `http://127.0.0.1`, authenticated by the token.
- CSP is strict (`default-src 'none'`, scripts from the app only, no `eval`, connect/media only to the app itself and `127.0.0.1`). `devCsp` is looser for Vite (`unsafe-eval`, `unsafe-inline`) and applies to debug builds only. The placeholder page has a **Run permission self-test** button that proves refusals; re-run it after any capability or CSP change.
- A new capability or CSP relaxation needs a reason in the PR description.

## Packaging decisions (details: `docs/adr/0009-desktop-sidecar-packaging.md`)

- Node runtime, FFmpeg and ffprobe are Tauri `externalBin` sidecars (`dax-node`, `dax-ffmpeg`, `dax-ffprobe`), because on macOS only `externalBin` executables are code-signed and notarized by the Tauri bundler, and Tauri handles per-target naming and the executable bit. They are named with the `dax-` prefix so a `.deb`/`.rpm` never collides with the distro's own `ffmpeg` package.
- The engine server is one esbuild-bundled file shipped as a **resource** (plain JavaScript; not an executable, so nothing to sign).
- Nothing is committed: `sidecars.lock.json` pins versions and SHA-256s; `prepare-sidecars.mjs` downloads, verifies, installs, and scans FFmpeg for GPL flags.
- FFmpeg must stay LGPL. Windows/Linux: BtbN static `lgpl` builds, pinned to a dated release. macOS: built from the pinned source by `scripts/build-ffmpeg-lgpl.sh` (no trustworthy prebuilt LGPL macOS build exists). `prepare-sidecars.mjs` fails the build if `--enable-gpl`, `--enable-nonfree`, `libx264`, `libx265` or other forbidden flags appear in the binary.

## Testing rules

- Pure logic (parsing, token, path resolution, command building, health probe) has unit tests in the module (`cargo test`). Keep process-lifecycle code in `sidecar.rs` free of Tauri types so it stays testable.
- Orphan prevention is verified by hand under `xvfb-run` plus `pgrep` (see the work summary in `docs/log.md` for the matrix); it cannot be a plain unit test. Re-run it if you touch `guard.rs` or the shutdown path: window close, `SIGTERM`, `SIGKILL` of the app, and `SIGKILL` of the server, each followed by `pgrep -af dax-node`.
- Windows (job object) and macOS code paths are not testable in the Linux sandbox. `cargo check --target x86_64-pc-windows-gnu` compiles the Windows branch (needs `mingw-w64`). Say so honestly in PRs.

## Gotchas

- Spawn the server from the supervisor thread only (Linux `PR_SET_PDEATHSIG` is tied to the spawning thread).
- macOS has no `PDEATHSIG`: it relies on the stdin protocol and process-group signalling.
- Closing the window quits the app on every platform, on purpose (one window, one server).
- The Linux webview is WebKitGTK; video codecs come from the user's GStreamer plugins. The `.deb`/`.rpm` recommend `gstreamer1.0-plugins-good/bad/libav`; the AppImage bundles the media framework. The UI should keep playing app-made proxy files and feature-detect with `canPlayType`.
- `identifier` (`org.daxeditor.desktop`) fixes the app-data directory and the updater identity. Change it before the first public release or never.
