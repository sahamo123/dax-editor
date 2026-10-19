---
type: Guide
title: "Handoff: how another agent resumes dax-editor"
description: "Where the build stopped, what is merged, what is unfinished and where its patch is, and the order of the remaining work. Read this first when resuming from the repository alone."
tags: [handoff, process, agents]
status: stable
generated:
  by: process:implementer
  at: 2026-10-19T06:30:00Z
---

# Handoff: resuming dax-editor

The repository is the only source of truth. Everything needed to continue is on branch `claude/exciting-lamport-1k91fh`. Nothing lives in a chat, a local worktree or `/tmp`.

## 1. Start (any agent, any machine)

1. `git checkout claude/exciting-lamport-1k91fh` (never `main`, never another branch).
2. Read `AGENTS.md`, then this file, then `docs/STATUS.md` (current state and "Needs a human").
3. `corepack enable && pnpm bootstrap` (Node 22+, FFmpeg on PATH).
4. `pnpm check`. It must pass before you change anything. If it fails, fix that first.
5. Work in small steps: test first, `pnpm check` green, one Conventional Commit, push to this branch. Use the trailer `Co-Authored-By: Claude <noreply@anthropic.com>`, or your own agent name, but never a model name.

## 2. Where we stopped (head: `git log -1`)

The product is not finished. The goal (a shippable desktop video editor with an embedded model, bring-your-own API key and two sign-in options) is about 55% done. Estimates by area are in `docs/STATUS.md`.

Done and merged:
- Video engine: timeline model, about 45 commands, cuts with energy-gated word gaps and word tails, captions, text overlays with animations, zoom, music ducking, image overlays (engine only), templates, undo and history.
- Render: FFmpeg export, atomic and cancellable. Picture and sound now stay in step after cuts (measured within 1 ms over 60 joins, `packages/core/src/av-sync-render.test.ts`).
- Agent loop, skills, server, launcher (`@dax/engine`), MCP server and `dax` CLI.
- Desktop shell and editor (browser build), Tauri 2 shell (Linux build only).
- Embedded local model runtime (`@dax/local-llm`) and speech-to-text (`@dax/stt`), both wired into the launcher. Verified on Linux CPU only.
- Claude Code sign-in bridge (`@dax/bridges`), Linux only.
- Review-fix items done: symlink containment and declared-size and inflate bounds in the archive reader; `..`-prefixed names are ordinary names.

Known flaky tests: `packages/bridges` ("reports a slow sign-in check") and `packages/stt` ("kills whisper-cli when the signal fires") fail only under full-suite load and pass alone. Make them deterministic (wait for an explicit ready signal instead of a timer) before relying on `pnpm check` in CI.

## 3. Unfinished work, in priority order

Each item needs a regression test that fails before and passes after, one commit per item, and `pnpm check` green.

1. **Review-fix items D and F** (partly written, not applied). Patch: `docs/handoff/review-fix-D-F-wip.patch`. Scope:
   - D: pin SHA-256 digests for the pinned llama.cpp tag in source (the digests are in the patch and in `docs/research`), verify before running a binary, and refuse unverified installs unless an explicit `allowUnverified` option (default false) is passed.
   - F: model manager start and stop races. Key in-flight starts by model id; use a generation counter checked after each await; `stop()` during a start must prevent the server from launching.
2. **Review-fix item E**: the llama.cpp health check trusts any HTTP 200 on the port, then sends the bearer key. Verify the listener is the spawned process before sending the key.
3. **Review-fix item G**: `z.number()` accepts `Infinity` in core schemas and command arguments. Add `.finite()` where project or command data is accepted.
4. **Review-fix item H**: asset paths reach FFmpeg unvalidated. Refuse URL schemes and relative paths in `asset.path`, and add `-protocol_whitelist file` before every `-i` (core `render.ts`, `media.ts`, `cuts.ts`, and `packages/stt/src/audio.ts`).
5. **Breath attenuation** (-12 dB instead of delete), per `docs/research/av-sync-and-breath-recipes.md`. Open decision: whether a kept breath may lengthen the pause.
6. **Eval tasks for cut quality**: music-bed gap preserved, clipped-tail metric under threshold, drift under threshold, retake handled as a proposal only.
7. **Expose zoom, music and image overlays** in the server protocol and the desktop timeline. Today they are engine commands only.
8. **Plugin system** (task 14). Not started. Design: `docs/research/plugin-architecture.md`.
9. **Codex sign-in bridge.** Blocked on a confirmed per-run MCP setup. Do not edit `~/.codex/config.toml`. Detection only until confirmed.
10. **Gemini**: no consumer bridge, by decision. Use the bring-your-own API key path.
11. **Installers and real-platform verification.** Needs a person with macOS and Windows machines. Signing secrets and the release workflow are described in `docs/maintainers/desktop-release.md`.

## 4. Decisions a human must make

- Make the timeline frame grid a model invariant? (spec under `docs/specs/`). Partly implemented: cuts snap to the grid at render.
- May a kept breath lengthen the surrounding pause?
- Default for an unverified runtime install (proposed: refuse unless opted in).
- Speech install path: a consent-based setup button (recommended) or download on first use.
- Old projects: re-quantise cut points on open, or only at render (current behaviour).
- Trailer history: older commits carry model names. Rewriting pushed history needs explicit approval.

## 5. Rules for every agent

- Develop and push only on `claude/exciting-lamport-1k91fh`.
- Never name a model or vendor as an author or in a commit message.
- Never weaken a security check to get a test green.
- Never disable git hooks to commit. If a hook fails, fix the cause.
- Run the scribe step when a milestone lands: `docs/log.md`, `docs/STATUS.md`, then `pnpm docs:index && pnpm docs:okf`.

## 6. Before you stop: nothing may live only on this machine

Dependencies are not a concern: `pnpm install` rebuilds `node_modules` from the lockfile, and the runtime installers fetch llama.cpp, whisper.cpp and model files on demand, verified against pinned hashes. Do not commit them.

1. `git status` is clean and `git log origin/claude/exciting-lamport-1k91fh..HEAD` is empty.
2. No worktree holds commits or edits the branch lacks: check with `git worktree list`, then for each `git -C <worktree> status --short` and `git rev-list --count claude/exciting-lamport-1k91fh..HEAD`.
3. Unfinished edits go to `docs/handoff/` as a patch (see its README), not into a chat or a local folder.
4. Scratch, logs and downloads under `/tmp`, `scratchpad` or `/root/.cache` are not needed. Keep only what a commit needs.
