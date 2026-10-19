---
type: Guide
title: "Handoff: how another agent resumes dax-editor"
description: "How to pick up the build from the repository alone, what is merged, what is in flight, and the order of the remaining work."
tags: [handoff, process, agents]
status: stable
generated:
  by: process:implementer
  at: 2026-10-19T05:30:00Z
---

# Handoff: resuming dax-editor

The repository is the only source of truth. Nothing needed to continue lives in an agent's chat or in a local worktree.

## Start here (any agent, any machine)

1. Check out branch `claude/exciting-lamport-1k91fh`. Never work on `main` or another branch.
2. Read `AGENTS.md`, then `docs/STATUS.md` (current state and "Needs a human"), then this file.
3. `flock /tmp/claude-0/pnpm.lock pnpm install` (or plain `pnpm install`), then `pnpm check`. It must pass before you change anything.
4. Work in small steps. Each step: tests first, `pnpm check` green, one Conventional Commit, push to the same branch.

## What is merged and pushed

Engine (`@dax/core`), agent, skills, templates, server, launcher (`@dax/engine`), MCP server and `dax` CLI, desktop shell and editor, embedded local model runtime (`@dax/local-llm`), speech-to-text (`@dax/stt`), Claude Code sign-in bridge (`@dax/bridges`), Tauri shell (Linux build only), zoom/music/image overlays (engine commands only), cut-quality fixes (energy-gated word gaps, word tails), and the first review-fix pass (symlink containment, `..` names). Latest head: see `git log -1`.

## Known state, in short

- Usable only by a technical tester on Linux. No installer exists. Nothing has been run on macOS or Windows.
- Sign-in: Claude Code works (Linux, tested). Codex is detection only. Gemini has no bridge, by decision.
- Plugin system (task 14): not started.

## In-flight work that is NOT on the branch yet

These exist only in local worktrees under `.claude/worktrees/` on the machine that ran the builders. A new machine will not have them. Recover them from the branch or ask the lead to push them:

- Review-fix pass, remaining items: archive size limits and bounded inflate (committed locally, not pushed); pinned runtime digests and the opt-in for unverified installs; health-check identity for the llama.cpp server; start/stop races in the model manager; non-finite numbers in schemas; asset paths reaching FFmpeg unvalidated (`-protocol_whitelist file`). Each needs a regression test.
- A/V drift fix in `render.ts` (convert each source to the project frame rate once before trimming; quantise cut points to the frame grid). Recipe: `docs/research/av-sync-and-breath-recipes.md`, section 4.2. Uncommitted.

## Remaining work, in priority order

1. Finish the drift fix and verify end-to-end sync on 60 joins (cutting quality is the top priority).
2. Finish the review-fix pass listed above, one commit per item.
3. Breath attenuation (-12 dB instead of deleting), per the same recipe.
4. Eval tasks for cut quality (music-bed gap, clipped-tail metric, drift, retake proposal-only).
5. Expose zoom, music and image overlays in the server protocol and the desktop timeline.
6. Plugin system (task 14).
7. Codex sign-in bridge (needs a confirmed per-run MCP setup first).
8. Installers and real macOS/Windows verification (needs a human with those machines).

## Decisions a human must make (see also `docs/STATUS.md`)

- Whether to make the timeline frame grid a model invariant (spec under `docs/specs/`).
- Whether a kept breath may lengthen the surrounding pause.
- Default for the unverified runtime install (proposed: refuse unless opted in).
- Speech install path: consent-based setup button, or download on first use.
- Trailer policy: the repo rules forbid model names in commits; some older commits still carry them.

## Rules that apply to every agent

- Develop and push only on `claude/exciting-lamport-1k91fh`.
- Never name a model or vendor as an author or in a commit message.
- Never weaken security checks to get a test green.
- Run the scribe step (log, status, indexes) when you finish a milestone: `pnpm docs:index && pnpm docs:okf`.

## Before leaving a machine: nothing may live only there

Dependencies are not a concern: `pnpm install` rebuilds `node_modules` from the lockfile, and the runtime installers fetch llama.cpp, whisper.cpp and model files on demand, verified against pinned hashes. Do not commit them.

What must be on the branch before you stop:

1. `git status` is clean, and `git log origin/claude/exciting-lamport-1k91fh..HEAD` is empty (everything is pushed).
2. No worktree holds commits or edits the branch lacks. Check with `git worktree list` and, for each, `git -C <worktree> status --short` and `git rev-list --count claude/exciting-lamport-1k91fh..HEAD`. Merge or copy the work to the branch first.
3. Scratch, logs and downloads under `/tmp`, `scratchpad` or `/root/.cache` are not needed. Keep only what a commit needs.
4. Plans and findings go in `docs/` (status, log, research), not in a chat or a file outside the repo.
