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
- Review pass merged: symlink containment, declared-size and inflate bounds, pinned runtime digests, listener identity check, start and stop races, finite numbers, asset-path validation and FFmpeg protocol whitelist.

Known flaky tests: `packages/bridges` ("reports a slow sign-in check") and `packages/stt` ("kills whisper-cli when the signal fires") fail only under full-suite load and pass alone. Make them deterministic (wait for an explicit ready signal instead of a timer) before relying on `pnpm check` in CI.

## 3. Unfinished work, in priority order

Each item needs a regression test that fails before and passes after, one commit per item, and `pnpm check` green.

1. **Review pass: merged.** Open follow-up: confirm the pinned digests against the API `digest` field when it is reachable; check the macOS and Windows port-owner lookups; `ffprobe` in `media.ts` and the MCP and server frame paths still need the same protocol whitelist.
   Original scope, for reference:
   - D: pin SHA-256 digests for the pinned llama.cpp tag in source (the digests are in the patch and in `docs/research`), verify before running a binary, and refuse unverified installs unless an explicit `allowUnverified` option (default false) is passed.
   - F: model manager start and stop races. Key in-flight starts by model id; use a generation counter checked after each await; `stop()` during a start must prevent the server from launching.
3. Unfinished edits go to `docs/handoff/` as a patch (see its README), not into a chat or a local folder.
4. Scratch, logs and downloads under `/tmp`, `scratchpad` or `/root/.cache` are not needed. Keep only what a commit needs.
