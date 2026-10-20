---
type: Guide
title: "Handoff: how another agent resumes dax-editor"
description: "Where the build stopped, what is merged, every dependency and system tool the build needs and where each is pinned, the unfinished patch and its state, and the order of the remaining work. Read this first when resuming from the repository alone."
tags: [handoff, process, agents, dependencies]
status: stable
generated:
  by: process:implementer
  at: 2026-10-20T00:00:00Z
---

# Handoff: resuming dax-editor

The repository is the source of truth. The upstream baseline is `82f1d24` on `claude/exciting-lamport-1k91fh`; the October 20 Windows implementation is on `codex/windows-offline-desktop`, split into logical commits. Inspect `git status` before switching branches. Build artifacts, dependency caches and `.dax-data/` preview project data are ignored by Git. Read the Windows checkpoint in `docs/STATUS.md`, the root `DEVELOPMENT-TASKS.md`, and `WINDOWS-DEVELOPMENT.md` before the historical state below. Delivery tracking is [GitHub issue #2](https://github.com/sahamo123/dax-editor/issues/2). Section 3 lists baseline dependencies and pins.

The unsigned Windows installer includes offline AI. Full `pnpm check`, 32 browser workflows and the real-model development preview smoke pass. `Start Development Preview.cmd` opens the browser editor and offline AI with persistent `.dax-data/`. Native validation remains blocked by Windows Application Control event 3077; Smart App Control reports enforcement on this personal administrator-owned laptop. No signing certificate is available, and no security policy was changed. Bundled-engine/browser evidence does not replace native install and dialog validation.

## 1. Start (any agent, any machine)

1. `git checkout codex/windows-offline-desktop` for the current Windows work; the historical baseline is `claude/exciting-lamport-1k91fh`. Preserve local changes before switching.
2. Read `AGENTS.md`, then this file, then `docs/STATUS.md` (current state and "Needs a human").
3. Install the toolchain in section 3.1, then `corepack enable && pnpm bootstrap`.
4. `pnpm check`. It must pass before you change anything. If it fails, fix that first. Known flaky tests are in section 6.
5. Work in small steps: test first, `pnpm check` green, one Conventional Commit, push to this branch. Use the trailer `Co-Authored-By: <your agent name> <noreply@...>`, but never a model name in commits, PRs or repo files.

## 2. Where we stopped

The product is not finished. The goal (a shippable desktop video editor with an embedded model, bring-your-own API key and two sign-in options) is about 55% done. Estimates by area are in `docs/STATUS.md`.

Merged on this branch (`git log` is the record):
- Video engine: timeline model, 45 commands, cuts with energy-gated word gaps and word tails, breath attenuation (12 dB), captions, text overlays with animations, zoom, music ducking, image overlays (engine only), templates, undo and history.
- Render: FFmpeg export, atomic and cancellable. Picture and sound stay in step after cuts (within 1 ms over 60 joins, `packages/core/src/av-sync-render.test.ts`).
- Agent loop, skills, server, launcher (`@dax/engine`), MCP server and `dax` CLI.
- Desktop shell and editor (browser build), Tauri 2 shell (Linux build only).
- Embedded local model runtime (`@dax/local-llm`) and speech-to-text (`@dax/stt`), wired into the launcher. Verified on Linux CPU only.
- Claude Code sign-in bridge (`@dax/bridges`), Linux only.
- Review pass: symlink containment, declared-size and inflate bounds, pinned runtime digests, listener identity check, start and stop races, finite numbers, asset-path validation, FFmpeg protocol whitelist.

### Verified state of the local build worktrees

During this handoff I checked every local git worktree under `.claude/worktrees/` (20 of them, each on a `worktree-agent-*` branch):
- Every commit on those branches is already reachable from `claude/exciting-lamport-1k91fh`. None of them holds commits that exist only locally. The `worktree-agent-*` branches are not pushed and not needed. Do not push them.
- One worktree (`agent-afda45debdc07fce8`) had two **uncommitted** edits, the only work that existed nowhere else. They are saved as a patch in section 4.
- The "In progress" list in `docs/STATUS.md` was written before those commits landed. Check `git log` before trusting any "not merged" claim there.

## 3. Dependencies and system requirements

Nothing here needs a paid service. Versions below come from the files named in the table.

### 3.1 Toolchain

| Need | Pinned in | What to do |
|---|---|---|
| Node 22 | `.node-version` (`22`), AGENTS.md ("Node 22+") | Install Node 22. Note: `scripts/bootstrap.sh` still checks for Node 20+. It passes Node 22, so it is consistent with the pin, but the message is looser than the requirement. |
| pnpm 10.28.0 | `packageManager` in root `package.json` | `corepack enable`. Do not install pnpm globally at another version. |
| FFmpeg and ffprobe on `PATH` | not in the repo (system tool) | `apt install ffmpeg`, `brew install ffmpeg` or `choco install ffmpeg`. Tested on **FFmpeg 6.1.1 only**. FFmpeg 7 is untested. Builds we ship must be LGPL-safe (see `packages/core/src/render.ts`). |
| Rust 1.82 or newer, `cargo` | `apps/desktop/src-tauri/Cargo.toml` (`rust-version = "1.82"`) | Needed only for the Tauri shell. Built here with cargo 1.97. |
| Tauri 2 Linux system libraries (WebKitGTK and GTK development packages) | Tauri v2 prerequisites | Needed to compile `apps/desktop/src-tauri`. They are missing in the cloud sandbox, so the shell cannot be compiled there. Install them from the Tauri prerequisites page for your distribution. |
| Chromium for Playwright | `@playwright/test` `1.56.1` in `apps/desktop/package.json` | Local: `pnpm exec playwright install chromium`. The cloud container has Chromium at `/opt/pw-browsers` (`PLAYWRIGHT_BROWSERS_PATH`) and must not run `playwright install`. |

### 3.2 JavaScript dependencies

- `pnpm-lock.yaml` is tracked and is the source of truth. Install with `pnpm install` (or `pnpm install --frozen-lockfile` to match CI exactly).
- Workspaces: `packages/*` and `apps/*` (`pnpm-workspace.yaml`). Each package's own `package.json` lists its dependencies.
- `Cargo.lock` is tracked in `apps/desktop/src-tauri/` for the Rust side.
- **Open item:** pnpm 10 skips dependency build scripts unless allowed, and `bootstrap` prints `Ignored build scripts: esbuild@0.28.2`. The build works without it because esbuild ships its binary in an optional package, but the warning stays. Decide once with `pnpm approve-builds` (it writes an allow-list to `package.json`) rather than silencing it by hand. Not changed in this handoff.
- Dev tools in the root `package.json`: Biome (`@biomejs/biome`), knip, TypeDoc, TypeScript and `yaml`.

### 3.3 Runtime components the engine downloads (not in the lockfile)

These are fetched only when a user asks, never at install or test time. Tests do not use the network.

| Component | Pinned in | Notes |
|---|---|---|
| llama.cpp server runtime, release `b11721` | `packages/local-llm/src/runtime.ts` (one archive per platform, each with a SHA-256) | Verified before it runs. Unverified installs are refused unless `allowUnverified` is passed. |
| Local model catalogue (GGUF files) | `packages/local-llm/src/catalog.ts` (`sha256` per model, Hugging Face `revision` per model) | Only models whose licence permits commercial use and redistribution are listed. The Gemma-class licence and tool-calling behaviour are still unconfirmed (see section 5). |
| whisper.cpp runtime, `v1.9.2` | `WHISPER_RUNTIME_VERSION` in `packages/stt/src/binary.ts` (SHA-256 computed by download, since upstream publishes none) | **Not installed by anything yet.** No engine route or desktop button installs it, and no speech model is bundled. |

### 3.4 External CLIs (optional, the user's own)

- Claude Code: `DAX_CLAUDE_BIN` overrides the `claude` binary. The bridge uses only the CLI's own `auth status`. It never reads or passes credentials.
- Codex: detection only (`DAX_CODEX_BIN`). Not yet supported as a chat backend, and the MCP setup for it is not confirmed (see section 5).
- Gemini: deliberately not supported.

### 3.5 Environment variables

| Variable | Purpose |
|---|---|
| `DAX_FFMPEG`, `DAX_FFPROBE` | Explicit FFmpeg and ffprobe binaries (default: `PATH`). |
| `DAX_LLAMA_SERVER` | Explicit `llama-server` binary, instead of the downloaded runtime. |
| `DAX_WHISPER_CLI`, `DAX_STT_MODEL` | Use this whisper-cli binary instead of downloading one. The speech model defaults to `base.en-q5_1`. Without a runtime, captions, filler cuts and transcript cuts report `transcription unavailable: <reason>`. |
| `DAX_CLAUDE_BIN`, `DAX_CODEX_BIN` | CLI bridge binaries. |
| `DAX_SERVER_BIN` | Explicit engine server binary, read by the launcher (otherwise an installed `@dax/server`, else `dax-server` on `PATH`). |
| `DAX_NODE`, `DAX_SERVER_ENTRY` | Debug-builds-only overrides for the Tauri shell's Node and server entry point. Ignored in release builds. |
| `DAX_DATA_DIR`, `DAX_PROJECT`, `DAX_SKILLS_DIR`, `DAX_TEMPLATES_DIR` | Data location, project file (`--project`, else `DAX_PROJECT`), and skill and template folders. |
| `DAX_SERVER_TOKEN`, `DAX_MCP_TOKEN` | Bearer tokens, generated at run time. **Never commit a value.** |
| `DAX_LIVE_TESTS=1` with `DAX_LLAMA_SERVER` or `DAX_LIVE_LLAMA_SERVER` | Opt-in switch for the live llama test (it needs a real binary). Off by default; default test runs never touch the network. |
| `DAX_STANDIN_MODE`, `DAX_STANDIN_CHILD` | Test knobs for the stand-in child process that the process-supervision tests spawn. |

## 4. Unfinished work, in priority order

### 4.1 Patch: local-llm archive symlink chains (saved, not applied)

- File: `docs/handoff/local-llm-archive-symlink-chains.patch` (253 lines). Two files: `packages/local-llm/src/archive.ts` and `packages/local-llm/src/archive.test.ts`.
- What it does: archive extraction refuses to write through symlinks that point outside the destination, including chains of links that only escape once followed (`s1 -> sub/..`, `s2 -> s1/../escaped`). It resolves links against the real file system, checks every link again after all links exist, and removes any link it created when it refuses.
- **State:** it was written against worktree base `e37aaf8`, and `archive.ts` has since changed on this branch. `git apply --check` fails on this branch. `git apply -3` applies the test file cleanly and puts **conflicts in `archive.ts`**. Nothing from the patch has been run: no test has passed on it.
- To finish it: resolve the conflict by hand (the ideas are right, the base is old), then run `pnpm --filter @dax/local-llm test`, then `pnpm check`. Commit it as `fix(local-llm): refuse symlink chains that escape the extraction root` with a regression test that fails before the fix and passes after. Delete the patch file in the same commit.

### 4.2 Remaining work, in order

Each item needs a regression test that fails before and passes after, one commit per item, and `pnpm check` green.

1. **Finish review hardening.** Finish the patch in 4.1. Still open from the review: confirm the pinned digests against the API `digest` field when it is reachable; check the macOS and Windows port-owner lookups; `ffprobe` in `media.ts`, and the MCP and server frame paths, still need the same protocol whitelist as FFmpeg.
2. Local model in the desktop app: the reconciliation with the engine server has landed (`92f58a9`), but `apps/desktop/e2e/real-engine.spec.ts` still expects the local model to show "not available". With the wiring merged, the card should offer a download, so update that test with the change.
3. Speech install route and desktop controls (the engine has no install route for whisper yet), then the model evaluation study on real models. The adapter exists; no real-model run is recorded yet.
4. Draft/approve flow for external MCP agents ([ADR 0006](../adr/0006-draft-approve-for-external-agents.md)). Today MCP edits the live session, credited as AI and undoable.
5. Tauri desktop app in a real window: chat on the left, preview and timeline on the right. Needs the Linux GTK libraries in 3.1 to compile.
6. Engine gaps from the creator research: a second video layer for B-roll; shapes and generated cards; automatic zoom placement (cursor, code, face); automatic sound-effect placement; transitions. Wire the effects layers (zoom, music, sound effects, image overlays) into the server, protocol types and desktop timeline.
7. Screen and mic recording.
8. Connectors: Google Drive first, then rclone.
9. Plugin system ([plugin architecture research](../research/plugin-architecture.md)).

Unfinished edits go to `docs/handoff/` as a patch (see its README). Do not leave them in a worktree or a chat.

## 5. Blocked, or needs a human

- Repo settings per `docs/maintainers/repo-settings.md`: branch protection, required CI, private vulnerability reporting, Dependabot.
- Code of Conduct contact email. Until then, the interim route is GitHub private reporting.
- First CI run on GitHub, to confirm Linux passes and to see macOS and Windows results.
- Real macOS and Windows testing. Nothing has run on either.
- Signing for macOS and Windows builds (Apple Developer ID, Windows code-signing certificate). These cost money and need a human.
- Licence call, only if ever wanted: Mediabunny (MPL-2.0) for in-browser demux, or Twick (SUL, currently excluded by the dependency rule). See [timeline UI patterns](../research/timeline-ui-patterns.md).
- Confirm the Gemma-class model licence and tool-calling behaviour before relying on it. **(unverified)**
- Google Drive: a decision on OAuth app verification (restricted scope or Picker). **(unverified)**
- CLI bridge: Codex needs a confirmed per-run MCP setup before it can run (API key first, subscription sign-in opt-in). The Claude bridge needs a live end-to-end check on each supported Claude Code version, and a written answer from Anthropic on the bridge.

## 6. Known issues

- CI has not yet run on GitHub.
- Flaky under full-suite load, fine alone: `packages/bridges` ("reports a slow sign-in check") and `packages/stt` ("kills whisper-cli when the signal fires"). Make them deterministic (wait for an explicit ready signal, not a timer) before relying on `pnpm check` in CI.
- Projects saved before the frame-grid change are not re-quantised on open. Cuts are snapped at render, so the timeline can differ from the output by up to half a frame per old cut.
- Breath depths per preset and the render ramp are not built (a flat 12 dB is).
- Windows and macOS are untested.
- Core export is not yet atomic or cancellable. Cancelling an MCP export lets FFmpeg finish in the background, then deletes its file.
- Speech-to-text is wired but nothing installs whisper-cli or a model. Until a user sets `DAX_WHISPER_CLI` and `DAX_STT_MODEL`, captions, filler-word removal and transcript cuts report "transcription unavailable".
- The embedded local model is wired but not merged into a shipped build, so the built-in chat still needs the user's own provider until a model is downloaded and started.
- The Tauri shell cannot be compiled in the cloud sandbox (missing WebKitGTK libraries).
- MCP edits go straight into the live session with no approval step. They are credited as AI and undoable.
- The effects layers are engine and command only. The server, protocol types and desktop timeline do not show zooms, audio clips or image overlays yet. Tests ran on FFmpeg 6.1.1 only.
- Research reports contain claims marked unverified. Check them before relying on them, starting with [landscape](../research/landscape.md).
- `scripts/bootstrap.sh` checks Node 20+, while the pin and AGENTS.md say 22 (see 3.1).

## 7. Scratch and local state

- `/tmp`, `scratchpad` and `/root/.cache` are not needed by any commit. Keep only what a commit needs.
- Ignored and generated, safe to delete: `node_modules/`, `dist/`, `packages/*/.test-dist/`, `packages/evals/.dax-cache/`, and the `.claude/worktrees/` checkouts (their commits are already on this branch, see section 2).
- Never commit `.dax.json` projects, media, model files or tokens. `.gitignore` covers the usual cases.
