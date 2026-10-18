---
type: Research
title: Tauri sidecar packaging for a Node engine and FFmpeg
description: Plan for shipping a Tauri 2 desktop app with a bundled Node.js engine and LGPL FFmpeg on macOS, Windows and Linux without asking users to install Node, with verified config, commands, licence rules and pitfalls.
tags: [tauri, packaging, sidecar, nodejs, ffmpeg, licensing, desktop, ci]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T19:38:10Z
---

# Tauri sidecar packaging for a Node engine and FFmpeg

## Recommendation

- **Engine:** bundle the server with esbuild into one CommonJS file. Ship an official Node binary per target triple as `externalBin` (`binaries/node-<triple>`) and the bundle as a `bundle.resources` file. The engine has no native addons today (only `zod`), so this path has the fewest traps and runs the Node version CI tests.
- **Fallback:** `@yao-pkg/pkg` 6.23.0 (published 2026-09-29, `engines.node >=22`), which Tauri's official Node guide uses.
- **Avoid as default:** `bun build --compile` (Bun runtime, not Node) and Node SEA (Stability 1.1; native addons need a temp-file workaround). SEA suits only apps with zero native addons.
- **FFmpeg:** ship LGPL-only builds, per ADR 0002. BtbN `lgpl` covers Windows and Linux. macOS has no LGPL build we can use (see section 3), so build it in-house.
- **Lifecycle:** keep the `CommandChild` in Tauri managed state, kill it on `RunEvent::ExitRequested`, let the Node side exit when its stdin closes, and kill the whole tree (process group on POSIX, Job Object on Windows).
- **Media:** serve source media through the engine's own localhost HTTP server with `Range` support, and play H.264 + AAC MP4 proxies in the `<video>` element. Do not rely on the asset protocol for seeking on Linux.
- **Distribution:** ship unsigned on macOS and Windows at first (macOS: paid Developer ID is $99/yr and needed for notarization; Windows: SignPath Foundation offers free signing to OSI-licensed projects, unverified). Linux needs no signing. The updater needs its own minisign key regardless.

## 1. Sidecar mechanics (Tauri 2)

**Config.** `externalBin` paths resolve from `src-tauri`. Each entry needs a file named `<name>-<target-triple>` (`.exe` on Windows).

```json
{
  "bundle": {
    "externalBin": ["binaries/node", "binaries/ffmpeg", "binaries/ffprobe"],
    "resources": ["engine/dax-engine.cjs"]
  }
}
```

Host triple: `rustc --print host-tuple` (Rust 1.84+; older: `rustc -Vv | grep host | cut -f2 -d' '`). Triples to produce: `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu`, `x86_64-apple-darwin`, `aarch64-apple-darwin`, `x86_64-pc-windows-msvc`. Tauri's guide says its rename script only works for the host architecture, so cross-builds need explicit copies.

**Permissions.** JS calls need `shell:allow-spawn`, `shell:allow-execute` or `shell:allow-kill` with `"sidecar": true` and a `name` equal to the `externalBin` string. Args can be static, regex `validator`s, `true`, or `false`.

```json
{
  "identifier": "engine-sidecar",
  "windows": ["main"],
  "permissions": [
    {
      "identifier": "shell:allow-spawn",
      "allow": [{ "name": "binaries/node", "sidecar": true, "args": [{ "validator": "\\S+" }] }]
    }
  ]
}
```

Prefer spawning from Rust, so the webview never gets a process API. Rust-side spawn is not gated by capabilities (unverified; confirm in the plugin source before relying on it).

```rust
let (mut rx, child) = app.shell().sidecar("node")?
    .args(["engine/dax-engine.cjs", "--port", "0"])
    .env("DAX_TOKEN", token)        // per-launch random secret
    .env("DAX_FFMPEG", ffmpeg_path) // engine already reads this (packages/core/src/exec.ts)
    .spawn()?;
app.manage(EngineChild(Mutex::new(Some(child))));
```

`.env` and `process_group` on the Rust builder are assumed from the docs (unverified names; check docs.rs).

**Port and token.** Let the engine bind `127.0.0.1:0`, then print one `ENGINE_READY <port>` line on stdout. Rust reads it from `rx` (no free-port race), then polls `GET /health` with a timeout. Generate the token with the OS RNG in Rust, pass it by env, and return it to the frontend through a Tauri command. Community guides use the same health-poll pattern (unverified as official).

**Kill on exit.** `CommandChild::kill(self)` consumes the child, sends a kill and waits. Official docs say kill with `process_group` enabled stops the whole group or job object.

```rust
app.run(|app, event| {
    if let tauri::RunEvent::ExitRequested { .. } = event {
        if let Some(child) = app.state::<EngineChild>().0.lock().unwrap().take() {
            let _ = child.kill();
        }
    }
});
```

`ExitRequested` does not fire on crashes or SIGKILL, so the engine should also exit when its parent goes away:

```js
process.stdin.resume();
process.stdin.on("end", () => process.exit(0)); // needs stdin piped from Rust (unverified)
```

The official Tauri guide covers only one-shot `execute()` calls. It says nothing about port selection, kill or shutdown.

## 2. Shipping Node without a Node install

| Option | Command (verified unless marked) | Pros | Cons |
|---|---|---|---|
| **esbuild + Node binary (recommended)** | `npx esbuild engine/src/server.ts --bundle --platform=node --format=cjs --target=node22 --outfile=dist-sidecar/dax-engine.cjs` (flags unverified) | Real Node, no VFS, `require`, `process.execPath` all normal; native addons ship as files beside the binary | Node binary is tens of MB per platform (size unverified; measure); CI must download the right Node per triple |
| **@yao-pkg/pkg** | `npx @yao-pkg/pkg dist-sidecar/dax-engine.cjs --targets node22-macos-arm64,node22-linux-x64,node22-win-x64 --output dax-engine` (`--targets` syntax unverified here) | One file; used by Tauri's official guide; actively maintained fork of archived vercel/pkg | Native `.node` addons need files beside the binary; Node support lags Node releases |
| **Bun compile** | `bun build --compile --target=bun-linux-x64 ./engine/src/server.ts --outfile dax-engine` | Single file; targets for linux-x64/arm64 (glibc and musl), windows-x64/arm64, darwin-x64/arm64; `--windows-icon`, `--windows-hide-console` | Bun runtime, not Node; workers must be listed as entrypoints; `.node` only via `require` of the literal path; output "still way too big" per Bun |
| **Node SEA** | `node --build-sea sea-config.json` (Node 25.5+) | Official; no third-party tool | Stability 1.1; `require` only loads builtins by default; `process.dlopen` cannot read from VFS; cross-builds need `useCodeCache` and `useSnapshot` false |

**Node SEA on Node 22/24 (postject route, verified from Node docs):**

```sh
echo '{ "main": "dist-sidecar/dax-engine.cjs", "output": "sea-prep.blob" }' > sea-config.json
node --experimental-sea-config sea-config.json
cp "$(command -v node)" dax-engine
codesign --remove-signature dax-engine          # macOS only
npx postject dax-engine NODE_SEA_BLOB sea-prep.blob \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
  [--macho-segment-name NODE_SEA]               # macOS only
codesign --sign - dax-engine                    # macOS only
```

The blob and binary must come from the same Node version. Native addons in SEA must be written to `os.tmpdir()` and loaded with `process.dlopen` (Node docs workaround).

## 3. FFmpeg per OS (licence-first)

Rule: the shipped build must not use `--enable-gpl` or `--enable-nonfree`, and must not include `libx264`/`libx265` (ADR 0002; ffmpeg.org/legal lists the LGPL checklist).

| Source | Platforms | Verified facts | Verdict |
|---|---|---|---|
| **BtbN/FFmpeg-Builds** | win64, winarm64, linux64, linuxarm64 (daily auto-builds) | `lgpl` variant lacks libx264 and libx265; README has no per-variant licence table; no macOS | **Use `lgpl` for Windows and Linux.** Check the LICENSE text in the archive. |
| **evermeet.cx** | macOS Intel only (arm64 not provided, per the site); 9.0.2 released 2026-09-18 | Configured with `--enable-gpl --enable-version3`, libx264, libx265 | **Not usable** (GPL). |
| **johnvansickle.com** | Linux amd64/arm64/armhf static | All static builds are GPLv3; last git build 2024-06-29 | **Not usable** (GPL, stale). |

**macOS LGPL build (unverified recipe; check `ffmpeg -buildconf` and `ffmpeg -L` after build):**

```sh
./configure --disable-gpl --disable-nonfree --enable-static --disable-shared \
  --enable-videotoolbox --enable-audiotoolbox \
  --enable-libopenh264 --enable-libopus --enable-libvorbis --enable-libmp3lame --disable-doc
make -j"$(sysctl -n hw.ncpu)"
```

Build one arm64 and one x86_64 binary, or a universal binary with `lipo`, and name them `ffmpeg-aarch64-apple-darwin` and `ffmpeg-x86_64-apple-darwin`.

**LGPL obligations when shipping the binary (from ffmpeg.org/legal):** distribute the source that corresponds exactly to the binary, plus the configure line and licence text, next to the release artifacts. Show the LGPL notice in the about box. Do not obfuscate binary names. The engine already runs FFmpeg as a separate process (`spawn` in `packages/core/src/exec.ts`). This is an engineering summary, not legal advice. A first-run download still needs hosted source and a pinned SHA-256 per platform.

**H.264 encoding.** Follow ADR 0002: VideoToolbox (macOS), Media Foundation or NVENC/QSV/AMF (Windows), and `libopenh264` as the software fallback. The ffmpeg.org page notes H.264 patent exposure, which the project should record in its licence notes.

## 4. File handling

**Opening local files.** `dialog` `open()` returns file-system paths on Linux, Windows and macOS (verified). The default permission set includes `dialog:allow-open`. The fetched page did not document `filters` or `defaultPath` for `open()` (check the JS reference).

**Drag and drop.** Native drag-drop is on by default (`dragDropEnabled: true`, verified in the config reference). Setting it to `false` is required for HTML5 drag-and-drop on Windows, because WebView2's handler is replaced. Use the native events for real paths.

Paths arrive on drag entry and on drop, but not on every hover event. Tauri's maintainers closed issue #9823 as "not planned" on 2024-05-20 and told plugins to cache the paths from the enter event. Do the same.

**Serving large media.** Three options:

1. **Asset protocol** (`app.security.assetProtocol.enable` plus `scope`, verified). Paths the user picks at runtime need the persisted-scope plugin with its `protocol-asset` feature (verified). Linux reports (search snippets, unverified) describe seek hangs on large files and a WebKitGTK rejection of a 200 response to a Range request.
2. **Custom URI scheme in Rust** that returns `206 Partial Content` with `Content-Range`. Tauri's streaming example uses this approach (search result only, not fetched).
3. **Engine localhost server with HTTP Range (recommended).** The engine is already an HTTP server. Bind `127.0.0.1` only. A `<video src>` cannot set headers, so put the per-launch token in the query string. Test seek on all three engines in CI.

**Proxy format for playback.** Make a H.264 + AAC MP4 proxy that the webview can seek in:

```sh
ffmpeg -i source.mov -vf scale=-2:720 -c:v libopenh264 -b:v 4M -g 30 \
  -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart proxy.mp4
```

`-g 30` gives a keyframe about every second at 30 fps, which keeps seeks short. `+faststart` puts the index first, so playback starts before the file is fully read.

## 5. `<video>` codecs by engine

| Format | WebView2 (Chromium) | WKWebView (macOS) | WebKitGTK (Linux) |
|---|---|---|---|
| H.264 in MP4 | Expected to play (unverified; no Microsoft primary source fetched) | Supported (MDN lists Safari support) | Needs GStreamer plugins (see below) |
| AAC in MP4 | Expected (unverified) | Supported | Needs GStreamer plugins |
| VP8/VP9 in WebM | Supported by Chromium (MDN) | Supported (MDN lists Safari for VP8/VP9; no alpha for VP9) | Needs GStreamer VP8/VP9 decoders (unverified) |
| AV1 | Supported (MDN) | Hardware only: M3 MacBooks and later, iPhone 15 Pro and later (MDN) | Depends on GStreamer build (unverified) |
| Opus in WebM | Supported (MDN pairing) | Supported (MDN pairing with AV1; unverified for older) | Needs GStreamer Opus (unverified) |
| HEVC | Chrome on Linux is hardware-only | Supported on macOS High Sierra and later (MDN) | Not verified |

MDN recommends MP4 + AVC + AAC as the broadly supported pairing. Use that for proxies, and keep WebM/AV1 out of the Linux path until tested.

**Linux GStreamer workarounds.**

- Install the GStreamer plugin sets WebKitGTK uses: `good`, `bad`, `ugly` and `libav`. The Wails guide says H.264 failures are an upstream WebKitGTK issue hitting Tauri apps, and that Arch users hit it most (search snippet, not fetched). Package names differ per distro: Fedora `gstreamer1-plugins-good`; Debian/Ubuntu names unverified.
- Check the decoder: `gst-inspect-1.0 avdec_h264` or `openh264dec` (commands from search snippets; unverified).
- Bundle plugins with `GST_PLUGIN_PATH` pointing at each plugin directory. Tauri discussion #8426 (2024) reports this works only under X11 for its author. Wayland showed GBM "Unknown or not supported format" errors. `GDK_BACKEND=x11` is the last resort, not a fix.

## 6. CI, testing, signing, updates

**Official workflow pieces (verified from Tauri docs):** matrix over `macos-latest` (two targets), `ubuntu-22.04`, `windows-latest`. Linux apt packages: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf xdg-utils`. Then `uses: tauri-apps/tauri-action@v1` with `tagName: app-v__VERSION__`, `releaseDraft: true` and `args: ${{ matrix.args }}`. Add steps before it that run esbuild and fetch and rename Node and FFmpeg per triple; the build fails if an `externalBin` file is missing.

**Headless smoke tests.**

- `tauri-driver` works directly on Windows and Linux only; macOS needs the WebdriverIO service's embedded driver or a paid CrabNebula key (verified).
- Linux: `xvfb-run -a` around the built binary. `webkit2gtk-driver` is the expected WebKitWebDriver package (unverified).
- All three OSes: give the app a `DAX_SMOKE=1` mode that starts the engine, polls `/health`, prints the result and exits. This needs no WebDriver and runs on macOS too.

**macOS signing.** A paid Apple Developer account ($99/yr) is needed for notarization. A free account can sign for testing only, and the app still shows as unverified (verified). Ad-hoc signing (`"signingIdentity": "-"`) avoids the "broken app" message but users still approve the app manually (verified). Nested Mach-O sidecars must be signed too (unverified, standard notarization rule).

**Windows signing.** Options from Tauri's page: OV certificate, Azure Artifact Signing, or a custom sign command. SmartScreen reputation builds for OV and EV certificates alike (verified). SignPath Foundation offers free Windows signing to OSI-licensed open-source projects with a fully automated build (search snippets from signpath.org and project pages, not fetched; verify at signpath.org).

**Updater.** Install with `npm run tauri add updater`. Set `bundle.createUpdaterArtifacts: true`, `plugins.updater.pubkey` (key content, not a path) and `plugins.updater.endpoints`. Grant `updater:default`. Generate keys with `npm run tauri signer generate -- -w ~/.tauri/dax.key`. Pass `TAURI_SIGNING_PRIVATE_KEY` in CI (`.env` files do not work). Update signatures cannot be disabled, and losing the private key means existing installs cannot be updated (all verified).

## Pitfalls seen in the wild

1. **Orphaned child processes.** Tauri issue #1626 (2021-04 to 2021-05): quitting from the Dock or calling `app.exit()` left the `beforeDevCommand` Node process running and holding the port. The cause was running the command through `sh -c`, so the child was never killed; Tauri fixed its side, and a Svelte child still needed its own fix. Lesson: kill the whole tree, not just the PID. On Windows, grandchildren can survive `taskkill /PID`; use `taskkill /T /F` or a Job Object with kill-on-close (secondary sources, unverified).
2. **Drag-drop paths missing on hover.** Issue #9823 (2024-05-19 to 2024-05-20): drop-over events lacked paths, and the maintainer said this was by design. Fix: cache paths on enter.
3. **Linux seek failures with the asset protocol.** Reports describe hangs when seeking large files, and WebKitGTK rejecting a 200 response to a Range request (WebKit bugzilla, search snippets only; unverified). Fix: serve media with proper 206 responses.
4. **H.264 silently fails on Linux installs missing GStreamer plugin sets.** Symptom: video element error or no picture. Fix: install `good`, `bad`, `ugly` and `libav`, then check the decoder with `gst-inspect-1.0`.
5. **"Free" FFmpeg builds are GPL.** evermeet (libx264, `--enable-gpl`) and johnvansickle (GPLv3 static) would break ADR 0002. BtbN has no macOS build. Build macOS LGPL FFmpeg in CI.
6. **SEA with native addons.** `process.dlopen` cannot read from the VFS, and a postject-built ELF made in an arm64 Linux container crashed on `dlopen` (Node docs). Build SEA on native runners, or avoid it when native modules exist.

## Open questions (verify before implementing)

- WebView2 H.264 MP4 playback, from a fetched Microsoft or Chromium source.
- Binary sizes for each packaging option and the LGPL FFmpeg.
- Rust-side sidecar spawn ungated by capabilities; `.env` and `process_group` builder names.
- Localhost Range server in WebKitGTK under xvfb, checking 206 responses.

## Sources

Fetched (primary unless noted):

- https://v2.tauri.app/develop/sidecar/
- https://v2.tauri.app/learn/sidecar-nodejs/ (official guide; uses pkg)
- https://v2.tauri.app/plugin/shell/ (partial)
- https://v2.tauri.app/reference/javascript/shell/
- https://docs.rs/tauri-plugin-shell/latest/tauri_plugin_shell/process/struct.CommandChild.html
- https://docs.rs/tauri/latest/tauri/enum.RunEvent.html
- https://github.com/tauri-apps/tauri/issues/1626
- https://github.com/tauri-apps/tauri/issues/9823
- https://github.com/tauri-apps/tauri/discussions/8426
- https://v2.tauri.app/reference/config/
- https://v2.tauri.app/plugin/dialog/
- https://v2.tauri.app/security/asset-protocol/
- https://v2.tauri.app/distribute/pipelines/github/
- https://v2.tauri.app/distribute/sign/macos/
- https://v2.tauri.app/distribute/sign/windows/
- https://v2.tauri.app/plugin/updater/
- https://v2.tauri.app/develop/tests/webdriver/
- https://nodejs.org/api/single-executable-applications.html
- https://bun.com/docs/bundler/executables
- https://github.com/yao-pkg/pkg
- https://github.com/BtbN/FFmpeg-Builds
- https://evermeet.cx/ffmpeg/
- https://johnvansickle.com/ffmpeg/
- https://ffmpeg.org/legal.html
- https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Video_codecs
- npm registry (`npm view @yao-pkg/pkg`): version 6.23.0, modified 2026-09-29, engines node >=22

Search snippets only (not fetched; treat as leads, unverified): WebKit bugzilla 221622 and 61817; Tauri issue #4133; Wails Linux guide (wails.io/docs/guides/linux); claudskills.com tauri-sidecar-lifecycle; SignPath Foundation pages; a Wry streaming example.

Local files read: `/home/user/dax-editor/AGENTS.md`, `docs/engineering/knowledge-protocol.md`, `docs/adr/0002-apache-2-and-lgpl-ffmpeg.md`, `packages/core/package.json`, `packages/core/src/exec.ts`.
