---
type: Status
title: Project status
description: "Current state of dax-editor: what works, what is in progress, what is next in order, what is blocked, and how to resume."
tags: [status, roadmap, handoff]
status: stable
generated:
  by: process:scribe
  at: 2026-10-19T12:00:00Z
---

# Project status

## Functional desktop release — October 22, 2026

The owner approved the [functional release contract](specs/functional-desktop-release.md), tracked by [issue #8](https://github.com/sahamo123/dax-editor/issues/8), issues #9–#17 and dependent draft PRs #18–#37. Implemented: task/revision guards, captured queued settings/credentials, provider probes and independent provider namespaces, project lifecycle/relink/manual controls, responsive tools, offline speech, live-session MCP, and optional bounded Blender templates. Current application source (0d1b7e7) passes `pnpm check`, 37 browser workflows and 25 Rust tests. Packaging follow-up f42200a passes 13 shell-script tests, dead-code checks and actual local offline-resource preparation. Native release remains **NOT READY**; no security policy has been changed.

- **Verified now:** real speech transcription/correction/captioned export (23 words; stream durations differ by under 1 ms), MCP transport/read-only/revision/batch tests, and laptop manual project-copy/undo/redo controls. See the contract and root tracker for evidence paths.
- **Local AI:** on-demand startup and configurable idle unload are implemented. The stronger offline suite passes format/title/follow-up/volume/trim/unsupported requests, manual-only export, restart persistence and inference cleanup with outbound fetches refused. Final assertions include fit/fps/title timing preservation (ADR 0015). Evidence: `artifacts/offline-smoke-1792707259245/result.json`. Measured requests took 49–129 seconds on the i5-8265U; first response took 15–85 seconds. This is slow and does not establish arbitrary-request correctness. A mid-run inference sample was 2.66 GB; whole-application peak memory remains unmeasured.
- **Blocked or pending:** actual hosted-provider edits without owner-configured keys; actual Claude/Codex sessions; multiple named same-family connections; complete manual parity; final installer and native clean install/upgrade/dialogs. The verified official Blender 4.5.14 executable is also blocked by Code Integrity event 3077, so real template renders are unverified. Local native rebuilding is blocked both at the Tauri Node binding and the official Cargo CLI's generated build helpers. PR #37 provides an unsigned artifact-only Windows candidate build; CI artifacts and native installation are separate gates.
- **Preview:** `Start Development Preview.cmd` uses persistent `.dax-data/`. It has been restarted with current application source; the final smoke verifies frontend, authenticated engine and installed/unloaded local AI (`artifacts/functional-final-preview-smoke.log`). Browser playback was observed after reconnect. Final screenshots live under `artifacts/functional-audit/final/`. Historical checkpoints below retain their original evidence and are superseded by this section.
- **Cloud checks:** Windows and Linux pass in run 39867954167. Experimental macOS fails because its FFmpeg lacks text/subtitle filters and process/fallback/path tests need investigation; [issue #39](https://github.com/sahamo123/dax-editor/issues/39) records the exact failures. This does not establish macOS release readiness.
- **Final local gate:** full `pnpm check` passed again after portable packaging changes and the evidence handoff (`artifacts/functional-delivery-final-check.log`). Documentation indexes/OKF also pass after recording the macOS follow-up. This supersedes earlier notes that the final gate was still running.

## Windows laptop checkpoint — October 20, 2026

The next continuation ([issue #6](https://github.com/sahamo123/dax-editor/issues/6), branch `codex/lightweight-ai-providers`) adds explicit OpenRouter setup with isolated key storage, model ID and context/output/temperature settings, plus generic OpenAI/LM Studio/Ollama endpoint presets. Hosted connection status is configuration only; no paid API was called. A verified 533 MB Qwen3.5 0.8B trial measured 17.74 tokens/second but failed a basic format edit and changed an unsolicited fit parameter. It is not promoted to the shipping catalogue; 2B remains bundled. MIT llama.cpp remains the embedded runtime, LM Studio is optional. See [the spec and trial outcome](specs/lightweight-ai-providers.md).

The preview now has a browser video picker and local streaming upload, including dropped files and chat video attachments (1 GiB per file, up to 10 attachments per request). Send queues follow-ups; Steer task adds guidance to the active run at its next model step without cancelling or restarting it; attachment/mode changes continue after the active run. Tasks show queue positions, status and recent results, persisted in private `tasks.json`. Engine restart marks unfinished work interrupted. Planning/Edit is captured per request; Planning exposes only read-only registry tools and never imports attachments into the timeline (ADR 0013, [issue #4](https://github.com/sahamo123/dax-editor/issues/4)). Manual timeline history and export jobs retain their existing tracking.

Local replies stream with template thinking disabled, a 512-token cap and a 90-second per-request timeout without retries. A live file chooser imported generated footage and played its preview; a real offline Planning reply completed without timeline changes. Full checks pass in `artifacts/chat-tasks-full-check.log`; subsequent attachment/drop/control regressions have separate final logs. The native installer predates these preview improvements and remains unvalidated.

The browser preview launcher now redirects the plain root address to the current engine session. Fresh tabs and bookmarks no longer require manually carrying the per-launch engine URL/token; this also replaces stale remembered connections after a launcher restart. The redirect stays loopback-only and is not cached.

Current local implementation and evidence supersede older "not merged" / "Windows untested" statements below. Delivery remains **NOT READY** until native validation is completed.

- Source and dependency caches are in the laptop checkout. See [the implementation plan](engineering/windows-desktop-plan.md) and `DEVELOPMENT-TASKS.md` at the repository root.
- The native Windows executable compiled. The shell now targets the React editor and bundles the full engine, fonts, skills and templates. Export save permission is narrowly granted (ADR 0011).
- Real Windows FFmpeg overlay export failed before the drive-colon fix and passes after it (17 filter/render tests). Real-engine browser integration passed 3 tests.
- A fresh-data-directory bundled-engine test, with outbound fetches refused, started Qwen 3.5 2B, made an actual AI title edit, exported video/audio, preserved the edit on restart and cleaned up inference. Evidence: `artifacts/offline-live-smoke.log` and `artifacts/offline-smoke-1792517191814/result.json` (local, ignored).
- Single-installer packaging includes the verified small model, pinned CPU runtime, licence/provenance records and app-local Microsoft C++ release DLLs. WebView2 uses its offline installer. The unsigned NSIS installer rebuilt successfully with the render/archive/shutdown fixes (1.53 GiB). Installation validation is blocked. See ADR 0012 and the ignored local delivery record `artifacts/DELIVERY.json`.
- Two native startup defects were isolated: Node 22 rejects Tauri's verbatim Windows drive paths; path normalization passes a Windows Rust regression. Zod 3's `toString` assignment fails with frozen Object.prototype; a minimal pnpm dependency patch preserves prototype freezing. That startup regression and 3 real-engine browser tests pass (4 total).
- Windows Application Control event 3077 blocked the unsigned executable. The owner confirmed this is a personal laptop with administrator access but no signing certificate. Registry `VerifiedAndReputablePolicyState=1` reports Smart App Control enforcement; administrator access alone does not override it. Policy-trusted signing or an authorized development environment is required for native validation. No security settings were changed.
- The full required `pnpm check` passes on Windows (`artifacts/check-windows-verified.log`); the final added preview launcher also passes lint/dead-code checks. Windows fixtures now use junctions and native path expectations. Bridge fake executables run through a test-only adapter; POSIX-only mode-bit and signal-forwarding assertions are explicitly scoped. All 32 browser editor workflows pass (`artifacts/desktop-all-e2e-verified.log`).
- A browser teardown failure reproduced a real engine shutdown race: FFmpeg still held a preview file after shutdown returned. Media tasks, process close events and export completion/cleanup are now awaited. The regression failed before the fix and passes afterward; 40 pipeline/server checks pass.
- `Start Development Preview.cmd` runs the browser editor with the packaged offline engine. Its real-model smoke passes (`artifacts/development-preview-smoke.log`); data persists in ignored `.dax-data/`. This gives a usable development workflow while native launch is blocked. Browser imports use typed file paths; native dialogs remain unverified.
- Delivery work and remaining gates are tracked in [GitHub issue #2](https://github.com/sahamo123/dax-editor/issues/2) and the root task tracker.
- The original two-hour deadline was missed. Speech installation controls, native import/save/export dialogs and the final clean-install test remain incomplete or blocked. No ready desktop release is claimed.

## Historical upstream baseline (superseded by the October checkpoints)

The sections below preserve the earlier handoff for provenance. Their "not merged", "not run" and feature-absence statements describe that earlier branch, not the current functional-release source. Use the October 22 section and linked acceptance contract for current work.

## Where we were

Resuming from another agent or machine: start with [the handoff guide](engineering/handoff.md).


The engine, command registry, skills, templates, agent, engine server and launcher, the desktop app's browser build, the `dax` CLI and the `dax-mcp` MCP server are merged on branch `claude/exciting-lamport-1k91fh`. There is no installed product yet: the Tauri shell is still in progress, the embedded local model and speech-to-text are wired into the engine (not yet merged, and not yet installed by any user action), and an independent review has open findings that a hardening pass is fixing. The plan and its checklists are in [ROADMAP](ROADMAP.md).

## Works today

- **Command registry** (`packages/core/src/commands.ts`, `template-commands.ts`, `effect-commands.ts`): 45 commands with typed arguments, model-facing descriptions and JSON-schema tool specs. It is the only way a project changes.
- **Timeline and edits**: undoable pure edits, a gapless main track, clip fades, and 8 ms audio fades at real cuts so joins do not click. Cuts sit on the project's frame grid, and each source is converted to the project rate once before trimming, so picture and sound end together after 60 joins (measured, see [A/V sync](research/av-sync-and-breath-recipes.md)).
- **History tree** (`session.ts`): states tagged manual, AI or template; jump to any state; named checkpoints; undo then edit keeps the old branch.
- **Cut engine** (`cuts.ts`): speech detection relative to the noise floor, five presets (gentle, standard, tight, podcast, tutorial), and reviewable cut plans. Commands `plan_cuts`, `apply_cut_plan`, `smart_cut`. Filler-word cuts need a transcript from `transcribe`, which needs the speech runtime and a model installed (see Known issues).
- **Word-timed captions** (`captions.ts`): three looks burned in via ASS, following every cut. Command `set_captions`. Needs a transcript.
- **Text overlays** (`overlays.ts`, `overlay-filters.ts`, `presets.ts`): titles, lower-thirds, captions and callouts, with six animation presets rendered by FFmpeg `drawtext`. Overlays follow ripple deletes. Text is safe from filter injection. Inter (OFL-1.1) is bundled.
- **Effects layers** ([spec](specs/effects-layers.md); `zoom.ts`, `audio-layer.ts`, `image-overlays.ts`, `effect-commands.ts`): punch-in and push-in zooms with easing and a focus point (`add_zoom`), music and sound effects on an audio track with automatic ducking under speech and a limiter so the mix cannot clip (`add_audio`, `set_ducking`), and PNG or JPG logos, watermarks and stickers with five presets and the text animations (`add_image_overlay`). All undoable, safe to repeat, and checked by measuring rendered frames and audio levels. Music is anchored to the timeline, so ripple deletes do not chop it; zooms, images and sound effects follow the footage.
- **Templates apply more**: a template's `effects` (zoom moves, a music bed, a logo) are now applied instead of skipped. Music and logos are never bundled: pass `music` or `logo` to `apply_template`, or the step says what to do.
- **Output shape**: fit modes (contain, cover, blur) and format presets via `set_format`: landscape 1080p and 720p, portrait 1080x1920, square 1080, portrait 4:5.
- **Renderer** (`render.ts`): LGPL-safe encoder choice; main track, overlays and captions in one FFmpeg command.
- **Templates**: 34 style and industry recipes (16 styles, 18 industries) in `templates/`, applied by a deterministic applier with no AI involved. One applied template is one history entry.
- **Skills**: 24 `SKILL.md` playbooks plus a router in `skills/`. The loader picks the few that fit a request within a character budget.
- **Agent** (`@dax/agent`): a tool loop over the registry with OpenAI-compatible and Anthropic providers, JSON repair and recovery of tool calls written as text. It needs a provider the user configures: an API key, or an OpenAI-compatible endpoint. Eval adapters let the eval harness score any provider on the same loop.
- **Engine server** (`@dax/server`, bin `dax-server`): HTTP and WebSocket API on 127.0.0.1 implementing `@dax/protocol`. Serves media with HTTP Range support. Checks the bearer token, Host and Origin.
- **Engine launcher** (`@dax/engine`, bin `dax-engine`): starts the server with the agent, skills and provider registry wired in, plus the built-in local model (download, start, stop, cancel, uninstall) and the whisper.cpp speech engine. Nothing downloads until the user asks; missing speech setup reports `transcription unavailable: <reason>`.
- **Desktop app, browser build** (`apps/desktop`): app shell with chat, settings, history, a media bin and a reconnecting client. Editor with a gapless two-video preview, a CSS overlay preview matched to the FFmpeg output, timeline editing (reorder, trim, split, fades, volume, overlay lanes, snapping, zoom), drag-and-drop animation presets and an inspector. Playwright tests live in `apps/desktop/e2e`.
- **CLI** (`packages/cli`, `dax`): `commands`, `run <command> --json '{...}'`, `project new|show`, `import`, `cut`, `export`, `mcp`, `serve`. Machine-readable `--json` output and documented exit codes. Projects persist as `.dax.json` with their undo history, so `dax run undo` works between invocations.
- **MCP server** (`packages/mcp`, `dax-mcp`): every core command as a tool (annotations from `readOnly`/`irreversible`), a `preview_frame` image tool, project and history resources, export progress and cancellation. stdio, or loopback Streamable HTTP with a bearer token and Host/Origin checks. See [CLI and MCP server](architecture/cli-and-mcp.md).
- **Core engine basics**: FFmpeg probe, silence detection and scene detection; transcript helpers; `Connector` interface (local).
- **Shared contract** (`packages/protocol`, `@dax/protocol`): request, response and event types for the server, desktop UI and agent, including the local-model, job, chat and import reply shapes as zod schemas. The server is the source of truth; the desktop client checks the shapes it cannot guess.
- **Desktop e2e against the real engine** (`apps/desktop/e2e`): Playwright runs the app against the real `@dax/server` in-process (fake assistant and local model only) and against the real `dax-engine` process (`pnpm --filter @dax/desktop test:e2e`).
- **CLI bridges** (`packages/bridges`, `@dax/bridges`, see [CLI bridges](architecture/cli-bridges.md)): Claude Code runs as a chat backend through the user's own signed-in `claude` binary. dax exposes its editing tools over a per-run loopback MCP endpoint on the live project session, and edits are credited to `ai`. The CLI may use only those tools. Settings shows not installed, not signed in, or ready. Codex is detected and reported as not supported yet. Gemini is deliberately not supported. Tested with a fake CLI, plus a recorded real run. Credentials are never read.
- **Evals harness** (`packages/evals`): oracle adapter passes 3/3 starter tasks.
- **Tooling**: `pnpm check` runs lint, typecheck, knowledge-base validation, doc coverage, dead-code check and tests across all packages. Test totals, all passing: core 365, desktop 292, agent 157, server 116, MCP 52, CLI 25, evals 21, protocol 5, engine 51, scripts 14.
- **Dev environment**: Biome lint and format, TypeDoc doc-coverage gate, knip dead-code check, git hooks (the pre-commit hook blocks commits that fail lint), AGENTS.md and contributor docs.
- **Knowledge base**: OKF validator and index generator (`pnpm docs:okf`, `pnpm docs:index`); ADRs 0001-0009 (0006 is a draft proposal); engineering docs; architecture overview and CLI/MCP architecture; evals docs; product v1 spec (draft); research reports; scribe and researcher agent definitions.
- **CI workflow** (`.github/workflows/ci.yml`): written, with Linux required and macOS and Windows non-blocking. It has not yet run on GitHub.

## In progress

Built in separate git worktrees under `.claude/worktrees`. Every commit on those `worktree-agent-*` branches is already on `claude/exciting-lamport-1k91fh`, so the worktrees are local scratch and are not needed. Check `git log` before trusting any "not merged" line below. The one unsaved edit is in [docs/handoff](handoff/README.md) (the local-llm archive symlink patch), and it does not apply cleanly yet.

- Hardening pass for the independent review's 3 high and 9 medium findings: export encoder fallback, preview blocklist, rollback after a failed autosave, path traversal through overlay ids, atomic and cancellable export, history pruning, a cancel signal, context budgets for small models, and safe template replacement.
- `@dax/local-llm` and `@dax/stt` are wired into `@dax/engine` (the default local-model controller and speech transcriber, with tests that need no network). Branch `claude/exciting-lamport-1k91fh` carries the wiring; it has not been merged. The live llama.cpp and whisper.cpp tests stay opt-in.
- Tauri shell (`apps/desktop/src-tauri`): built and checked on Linux with the engine sidecar. macOS and Windows packaging, signing and the release workflow are not run; see [ADR 0010](adr/0010-desktop-sidecar-packaging.md) and the maintainer guide.
- Reconciling the desktop client with the engine server API.
- Core engine: zoom keyframes, music ducking and image overlays.
- Scouts on cut-quality field notes, audio enhancement and screen recording.
- CLI bridges, open items: Codex needs a confirmed per-run MCP setup before it can run (API key first, subscription sign-in opt-in). The Claude bridge still needs a live end-to-end check on each supported Claude Code version, and a written answer from Anthropic on the bridge (the compliance page suggests asking sales).

## Next up (in priority order)

Each item starts after the in-progress builds it depends on are merged.

1. Merge the hardening pass and the desktop-client reconciliation, so the desktop app runs end to end against the engine server.
2. Merge the local model and speech-to-text wiring, add the desktop controls that install them (the engine has no install route for speech yet), then run the model evaluation study on real models. The adapter exists; no real-model run is recorded yet.
3. Draft/approve flow for external MCP agents ([ADR 0006](adr/0006-draft-approve-for-external-agents.md)). Today MCP edits the live session, credited as AI and undoable.
4. Tauri desktop app in a real window: chat on the left, preview and timeline on the right.
5. Engine gaps from the creator research: a second video layer for B-roll; shapes and generated cards; finding where to zoom automatically (cursor, code, face); automatic sound-effect placement; transitions. Music and sound-effect layers, punch-in and zoom, and image overlays are built in the engine (the effects layers); wire them into the server, the protocol types and the desktop timeline.
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
- The local-llm archive symlink-chain patch (`docs/handoff/local-llm-archive-symlink-chains.patch`) conflicts with the current `archive.ts`, and nothing in it has been run. Finish it per [handoff section 4](engineering/handoff.md).
- pnpm 10 ignores the esbuild build script (`pnpm approve-builds` decides it). Dependencies and system tools are listed in [handoff section 3](engineering/handoff.md#3-dependencies-and-system-requirements).
- Projects saved before the frame-grid change are not re-quantised on open. Their cuts are snapped at render, so the timeline can differ from the output by up to half a frame per old cut. Breaths are kept and attenuated by 12 dB (see [cut intelligence status](research/cut-intelligence.md)); the per-preset breath depths and render ramp are not built.
- Windows and macOS are untested.
- The independent review's 3 high and 9 medium findings stay open until the hardening pass merges.
- Core export is not yet atomic or cancellable. Cancelling an MCP export lets FFmpeg finish in the background and then deletes its file.
- Speech-to-text is wired into the engine, but nothing installs its whisper-cli runtime or model yet (no engine route or desktop button), and the default never downloads on its own. Until a user or the developer provides `DAX_WHISPER_CLI` and a model, captions, filler-word removal and transcript-based cuts report "transcription unavailable".
- The embedded local model is wired into the engine but not merged, so the built-in chat still needs the user's own provider until a user downloads and starts the model. The desktop e2e test in `apps/desktop/e2e/real-engine.spec.ts` expects the real engine to show the local model as "not available"; with the wiring the card should offer a download instead, so that test will need updating (not run here).
- There is no Tauri shell yet, so the desktop app runs only as a browser build. The Tauri shell cannot be compiled in the cloud sandbox because the Linux WebKitGTK libraries are missing.
- MCP edits go straight into the live session with no approval step yet. They are credited as AI and are undoable.
- The effects layers are engine and command only: the server, protocol types and desktop timeline do not show zooms, audio clips or image overlays yet. The effects tests ran on FFmpeg 6.1.1 only; FFmpeg 7 is untested.
- Research reports contain claims marked unverified. Check them before relying on them, starting with [landscape](research/landscape.md).

## How to resume

1. Run `pnpm bootstrap` (one-time: checks the toolchain, installs dependencies, enables git hooks).
2. Run `pnpm check` (everything CI runs).
3. Run `git worktree list` to see the builds in progress, so you do not duplicate them.
4. Read the newest entries in [log](log.md), then pick the top issue in GitHub Issues.
5. After your work, do the scribe step (see [knowledge protocol](engineering/knowledge-protocol.md)).
