---
type: Decision
title: "ADR 0009: Ship Node, the engine server and an LGPL FFmpeg as sidecars"
description: The desktop installer bundles an official Node runtime and FFmpeg as Tauri externalBin sidecars and the engine server as one bundled JavaScript resource, with pinned, checksummed downloads and no committed binaries.
tags: [adr, desktop, packaging, tauri, ffmpeg, license]
status: stable
generated:
  by: process:implementer
  at: 2026-10-18T20:10:00Z
---

# ADR 0009: Ship Node, the engine server and an LGPL FFmpeg as sidecars

## Context

[ADR 0003](/adr/0003-typescript-engine-sidecar.md) left open how to ship the TypeScript engine without asking users to install Node. [ADR 0002](/adr/0002-apache-2-and-lgpl-ffmpeg.md) requires an LGPL-only FFmpeg. The Tauri shell must start the engine, keep it alive for the life of the app, and never leave it running afterwards. Installers must be signable and notarizable on macOS.

## Decision

1. **Node runtime: the official Node.js binary, renamed `dax-node`, as a Tauri `externalBin` sidecar.** Pinned to one LTS version with a SHA-256 in `apps/desktop/sidecars.lock.json`, downloaded at build time (never committed).
2. **Engine server: one esbuild-bundled file `server/cli.mjs`, shipped as a Tauri resource.** Files the server reads at run time (fonts) ship next to it in `assets/`.
3. **FFmpeg and ffprobe: LGPL-only static builds as `externalBin` sidecars named `dax-ffmpeg` and `dax-ffprobe`.** Windows and Linux use BtbN's `lgpl` static builds pinned to a dated release; macOS is built from the pinned FFmpeg source by `apps/desktop/scripts/build-ffmpeg-lgpl.sh` because no trustworthy prebuilt LGPL macOS build exists. The build fails if the binary contains `--enable-gpl`, `--enable-nonfree`, `libx264`, `libx265`, `libxvid` or `libfdk-aac`.
4. **Rust starts the sidecar directly (`std::process`), not through `tauri-plugin-shell`.** The page therefore has no permission to spawn processes at all, and the shell controls process groups, stdin and job objects itself.
5. **Lifetime protocol:** the shell holds the write end of the server's stdin; end-of-input means "exit". Added per platform: process group and `PR_SET_PDEATHSIG` (Linux), process group (macOS), a kill-on-close job object (Windows).

## Why this and not the alternatives

- **Why `externalBin` for executables:** the Tauri bundler code-signs `externalBin` programs (with the hardened runtime and our entitlements) on macOS, sets the executable bit and handles per-target names. Executables placed in `resources` are not signed, and an unsigned Mach-O inside the app makes notarization fail.
- **Why the official Node binary instead of a single-file executable (Node SEA, `pkg`, `bun build --compile`, `deno compile`):** the engine is plain JavaScript on Node, and the official binary is the exact runtime we test with. SEA still embeds a full copy of Node (about 120 MB), needs `postject` injection and re-signing, and supports only a single bundled script, so it saves nothing in size while adding a fragile build step. Bun and Deno would change the runtime under `ws`, `child_process` and signal handling. Keeping Node plus a plain script also lets contributors debug the server with ordinary Node tools.
- **Why one bundled file instead of shipping `node_modules`:** thousands of small files are slow to sign, copy and install (especially on Windows) and add attack surface. One file with a linked licence file is simpler. Native add-ons are not supported by this approach; if the server ever needs one, ship it as a resource next to the bundle or revisit this ADR.
- **Why not the shell plugin's sidecar API:** it hands the page a way to run programs (guarded only by scopes), kills only the direct child, and does not reap grandchildren. We want none of that exposed to JavaScript.
- **Why not download Node/FFmpeg on first run:** an offline-capable installer is a better first experience, and first-run downloads need their own integrity and update story. Local models are different and are downloaded on demand (see `packages/local-llm`).
- **Why not rely on the user's FFmpeg:** distro and Homebrew builds are GPL (they include x264), version-skewed and inconsistent between machines. Developers may still use their own through `DAX_FFMPEG` / `DAX_FFPROBE`.

## Consequences

- The installer is large: the pinned LGPL FFmpeg binaries are about 140 MB each uncompressed on Linux (they include many codecs and libraries) and Node is about 125 MB; the Linux `.deb` is roughly 100 MB. **Follow-up:** replace the prebuilt FFmpeg with our own minimal LGPL build (only the codecs, filters and muxers the engine uses; likely 20 to 30 MB) using `build-ffmpeg-lgpl.sh` as the starting point, and ship one FFmpeg binary if ffprobe can be dropped.
- Shipping FFmpeg binaries creates LGPL obligations: ship the licence text (done: `licenses/FFMPEG-LICENSE.txt`), state where the corresponding source is (`licenses/THIRD-PARTY.txt`), and keep the programs replaceable (the app honours `DAX_FFMPEG`/`DAX_FFPROBE`). The BtbN builds are `--enable-version3` (LGPL 3); the macOS build is LGPL 2.1 or later.
- macOS needs the `allow-jit` and `allow-unsigned-executable-memory` entitlements for Node's V8 under the hardened runtime (`apps/desktop/src-tauri/entitlements.plist`); this cannot be tested without a signed build, see the [desktop release guide](/maintainers/desktop-release.md).
- A server that ignores both stdin end-of-input and `SIGTERM` can outlive a crashed app. The contract in `apps/desktop/src-tauri/AGENTS.md` forbids that; nothing else in the shell can fully prevent it without `SIGKILL`-on-parent-death, which would skip the server's own child cleanup.

## Alternatives considered

Node SEA / `pkg` / Bun / Deno single-file executables, shipping `node_modules`, the Tauri shell plugin sidecar API, first-run downloads, a system FFmpeg, and an engine rewritten in Rust (rejected earlier in ADR 0003). See the reasons above.
