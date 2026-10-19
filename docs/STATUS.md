---
type: Status
title: Project status
description: "Current state of dax-editor: what works, what is in progress, what is next in order, what is blocked, and how to resume."
tags: [status, roadmap, handoff]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T21:30:00Z
---

# Project status

## Where we are

The engine, command registry, skills, templates, agent, engine server and launcher, the desktop app's browser build, the `dax` CLI and the `dax-mcp` MCP server are merged on branch `claude/exciting-lamport-1k91fh`. There is no installed product yet: the Tauri shell, the embedded local model and speech-to-text are still in progress, and an independent review has open findings that a hardening pass is fixing. The plan and its checklists are in [ROADMAP](ROADMAP.md).

## Works today

- **Command registry** (`packages/core/src/commands.ts`, `template-commands.ts`): 35 commands with typed arguments, model-facing descriptions and JSON-schema tool specs. It is the only way a project changes.
- **Timeline and edits**: undoable pure edits, a gapless main track, clip fades, and 8 ms audio fades at real cuts so joins do not click.
- **History tree** (`session.ts`): states tagged manual, AI or template; jump to any state; named checkpoints; undo then edit keeps the old branch.
- **Cut engine** (`cuts.ts`): speech detection relative to the noise floor, five presets (gentle, standard, tight, podcast, tutorial), and reviewable cut plans. Commands `plan_cuts`, `apply_cut_plan`, `smart_cut`. Filler-word cuts need a transcript, and there is no speech engine yet.
- **Word-timed captions** (`captions.ts`): three looks burned in via ASS, following every cut. Command `set_captions`. Needs a transcript.
- **Text overlays** (`overlays.ts`, `overlay-filters.ts`, `presets.ts`): titles, lower-thirds, captions and callouts, with six animation presets rendered by FFmpeg `drawtext`. Overlays follow ripple deletes. Text is safe from filter injection. Inter (OFL-1.1) is bundled.
- **Output shape**: fit modes (contain, cover, blur) and format presets via `set_format`: landscape 1080p and 720p, portrait 1080x1920, square 1080, portrait 4:5.
- **Renderer** (`render.ts`): LGPL-safe encoder choice; main track, overlays and captions in one FFmpeg command.
- **Templates**: 34 style and industry recipes (16 styles, 18 industries) in `templates/`, applied by a deterministic applier with no AI involved. One applied template is one history entry.
- **Skills**: 24 `SKILL.md` playbooks plus a router in `skills/`. The loader picks the few that fit a request within a character budget.
- **Agent** (`@dax/agent`): a tool loop over the registry with OpenAI-compatible and Anthropic providers, JSON repair and recovery of tool calls written as text. It needs a provider the user configures: an API key, or an OpenAI-compatible endpoint. Eval adapters let the eval harness score any provider on the same loop.
- **Engine server** (`@dax/server`, bin `dax-server`): HTTP and WebSocket API on 127.0.0.1 implementing `@dax/protocol`. Serves media with HTTP Range support. Checks the bearer token, Host and Origin.
- **Engine launcher** (`@dax/engine`, bin `dax-engine`): starts the server with the agent, skills and provider registry wired in.
- **Desktop app, browser build** (`apps/desktop`): app shell with chat, settings, history, a media bin and a reconnecting client. Editor with a gapless two-video preview, a CSS overlay preview matched to the FFmpeg output, timeline editing (reorder, trim, split, fades, volume, overlay lanes, snapping, zoom), drag-and-drop animation presets and an inspector. Playwright tests live in `apps/desktop/e2e`.
- **CLI** (`packages/cli`, `dax`): `commands`, `run <command> --json '{...}'`, `project new|show`, `import`, `cut`, `export`, `mcp`, `serve`. Machine-readable `--json` output and documented exit codes. Projects persist as `.dax.json` with their undo history, so `dax run undo` works between invocations.
- **MCP server** (`packages/mcp`, `dax-mcp`): every core command as a tool (annotations from `readOnly`/`irreversible`), a `preview_frame` image tool, project and history resources, export progress and cancellation. stdio, or loopback Streamable HTTP with a bearer token and Host/Origin checks. See [CLI and MCP server](architecture/cli-and-mcp.md).
- **Core engine basics**: FFmpeg probe, silence detection and scene detection; transcript helpers; `Connector` interface (local).
- **Shared contract** (`packages/protocol`, `@dax/protocol`): request, response and event types for the server, desktop UI and agent, including the local-model, job, chat and import reply shapes as zod schemas. The server is the source of truth; the desktop client checks the shapes it cannot guess.
- **Desktop e2e against the real engine** (`apps/desktop/e2e`): Playwright runs the app against the real `@dax/server` in-process (fake assistant and local model only) and against the real `dax-engine` process (`pnpm --filter @dax/desktop test:e2e`).
- **Evals harness** (`packages/evals`): oracle adapter passes 3/3 starter tasks.
- **Tooling**: `pnpm check` runs lint, typecheck, knowledge-base validation, doc coverage, dead-code check and tests across all packages. Test totals, all passing: core 365, desktop 292, agent 157, server 116, MCP 52, CLI 25, evals 21, protocol 5, engine 3, scripts 14.
- **Dev environment**: Biome lint and format, TypeDoc doc-coverage gate, knip dead-code check, git hooks (the pre-commit hook blocks commits that fail lint), AGENTS.md and contributor docs.
- **Knowledge base**: OKF validator and index generator (`pnpm docs:okf`, `pnpm docs:index`); ADRs 0001-0009 (0006 is a draft proposal); engineering docs; architecture overview and CLI/MCP architecture; evals docs; product v1 spec (draft); research reports; scribe and researcher agent definitions.
- **CI workflow** (`.github/workflows/ci.yml`): written, with Linux required and macOS and Windows non-blocking. It has not yet run on GitHub.

## In progress

Built in separate git worktrees under `.claude/worktrees`. None of these is merged yet.

- Hardening pass for the independent review's 3 high and 9 medium findings: export encoder fallback, preview blocklist, rollback after a failed autosave, path traversal through overlay ids, atomic and cancellable export, history pruning, a cancel signal, context budgets for small models, and safe template replacement.
- `@dax/local-llm`: embedded Gemma-class model runtime (llama-server).
- `@dax/stt`: whisper.cpp speech-to-text.
- Tauri shell (`apps/desktop/src-tauri`).
- Reconciling the desktop client with the engine server API.
- Core engine: zoom keyframes, music ducking and image overlays.
- CLI sign-in bridges to the user's own subscriptions: Claude Code first, Codex second. No Gemini consumer bridge.
- Scouts on cut-quality field notes, audio enhancement and screen recording.

## Next up (in priority order)

Each item starts after the in-progress builds it depends on are merged.

1. Merge the hardening pass and the desktop-client reconciliation, so the desktop app runs end to end against the engine server.
2. Merge the local model runtime and speech-to-text, then run the model evaluation study on real models. The adapter exists; no real-model run is recorded yet.
3. Draft/approve flow for external MCP agents ([ADR 0006](adr/0006-draft-approve-for-external-agents.md)). Today MCP edits the live session, credited as AI and undoable.
4. Tauri desktop app in a real window: chat on the left, preview and timeline on the right.
5. Engine gaps from the creator research: music and sound-effect audio layers with ducking; punch-in and zoom keyframes; image, shape and card overlays; a second video layer for B-roll.
6. Screen and mic recording.
7. Connectors: Google Drive first, then rclone.
8. Plugin system ([plugin architecture research](research/plugin-architecture.md)).

## Blocked / needs a human

- Set up repo settings per `docs/maintainers/repo-settings.md`: branch protection, required CI, private vulnerability reporting, Dependabot.
- Provide a Code of Conduct contact email. Until then, the interim route is GitHub private reporting.
- First CI run on GitHub, to confirm Linux passes and to see macOS and Windows results.
- Real macOS and Windows testing. Nothing has been run on either system yet.
- Signing for the macOS and Windows builds, which are unsigned. Signing needs an Apple Developer ID and a Windows code-signing certificate, which cost money and need a human to obtain. **(unverified: current prices)**
- Licence call, only if ever wanted: Mediabunny (MPL-2.0) for in-browser demux, or Twick (SUL, currently excluded by the dependency rule). See [timeline UI patterns](research/timeline-ui-patterns.md).
- Confirm the Gemma 4 licence and tool-calling behaviour before relying on it. The local-llm builder must confirm this. **(unverified)**
- Google Drive needs a decision on OAuth app verification: restricted scope or Picker. **(unverified)**

## Known issues

- CI has not yet run on GitHub.
- Windows and macOS are untested.
- The independent review's 3 high and 9 medium findings stay open until the hardening pass merges.
- Core export is not yet atomic or cancellable. Cancelling an MCP export lets FFmpeg finish in the background and then deletes its file.
- No speech-to-text engine is merged, so captions, filler-word removal and transcript-based cuts cannot run end to end.
- No embedded local model is merged, so the built-in chat needs the user's own provider.
- There is no Tauri shell yet, so the desktop app runs only as a browser build. The Tauri shell cannot be compiled in the cloud sandbox because the Linux WebKitGTK libraries are missing.
- MCP edits go straight into the live session with no approval step yet. They are credited as AI and are undoable.
- Research reports contain claims marked unverified. Check them before relying on them, starting with [landscape](research/landscape.md).

## How to resume

1. Run `pnpm bootstrap` (one-time: checks the toolchain, installs dependencies, enables git hooks).
2. Run `pnpm check` (everything CI runs).
3. Run `git worktree list` to see the builds in progress, so you do not duplicate them.
4. Read the newest entries in [log](log.md), then pick the top issue in GitHub Issues.
5. After your work, do the scribe step (see [knowledge protocol](engineering/knowledge-protocol.md)).
