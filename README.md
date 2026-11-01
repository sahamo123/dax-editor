# dax-editor

A free, open-source video editor you drive with plain language. Drop in a video, say what you want, and watch it get edited. Chat on the left, your video on the right.

> **Development testing is available; release acceptance remains open.** The desktop editor, CLI, live-project MCP, local AI/speech and optional API providers are implemented. See [current status](docs/STATUS.md) for verified versus pending workflows. **Latest continuation: `codex/impeccable-design-setup`, based on `codex/laptop-agent-handoff`; default `main` is older.** [New laptop / any-agent handoff](docs/engineering/laptop-continuation.md) includes setup, exact baseline, private-file transfer and next issues. [Impeccable design setup](docs/engineering/impeccable-design.md) adds optional pinned UI/UX guidance.

## Goals

- **Completely free and open source.** Apache-2.0. No paid services required to use it.
- **Prompt-driven editing.** Cuts, silence and filler-word removal, transcripts, captions, and animation suggestions based on the format you want (tutorial, explainer, short-form).
- **Works with any LLM.** Use it from Claude or any MCP client, from the built-in chat with your own API key, with a local model through Ollama, or with a small embedded model.
- **Desktop app for macOS, Windows and Linux** (Tauri), with a **CLI and MCP server from the start**.
- **Extensible.** Optional controlled Blender templates run separately. Cloud-storage connectors and broader plugins remain future work, built on the engine's interfaces.
- **Built to be continued by anyone.** The repo is the source of truth and is readable by any person or AI agent. See [Working on this project](#working-on-this-project).

## What works today

`@dax/core` is a TypeScript library with:

- A JSON timeline model with non-destructive, undoable edit operations (split, trim, delete range, keep ranges, move, volume).
- FFmpeg probing, silence detection and scene detection.
- Mapping from source-file time to timeline time, so "remove these silences / filler words" stays correct after earlier edits.
- An FFmpeg renderer with LGPL-safe encoder selection, atomic/cancellable export and complete-effects WebM review. Shipped builds do not rely on libx264/libx265.
- Offline whisper.cpp transcription, correction, caption styling and reviewed filler/silence cuts.
- A `Connector` interface with a local-disk implementation.

`apps/desktop` provides import, preview, timeline/inspector edits, project lifecycle, undo/history, chat attachments, Planning/Edit modes, non-cancelling steering and tracked jobs. Providers include optional local llama.cpp, OpenRouter, OpenAI and custom compatible APIs. External MCP clients share the live project; optional Blender uses controlled templates as a separate process. See STATUS for acceptance limits rather than assuming every client/platform is verified.

`@dax/evals` measures how well a model can edit video (see [docs/evals/overview.md](docs/evals/overview.md)).

## Develop

Needs Node 22 (`.node-version`), pnpm 10.28.0 (`package.json`) and FFmpeg/ffprobe on your `PATH` (or set `DAX_FFMPEG` / `DAX_FFPROBE`). On a new Windows laptop use the [fresh setup and launch commands](docs/engineering/laptop-continuation.md#fresh-windows-x64-setup); `Enter-Dev.ps1` and root launchers require ignored caches absent from a clone.

```sh
pnpm bootstrap   # checks tools, installs dependencies, enables git hooks
pnpm check       # lint, build, doc coverage, knowledge base, dead code, tests (what CI runs)
pnpm eval --adapter oracle   # run the model-evaluation harness
```

## Working on this project

- **People:** read [CONTRIBUTING.md](CONTRIBUTING.md). Work items are GitHub Issues.
- **AI agents:** read [AGENTS.md](AGENTS.md), [handoff](docs/engineering/handoff.md), [cross-laptop continuation](docs/engineering/laptop-continuation.md), then [docs/STATUS.md](docs/STATUS.md). Workflow: [docs/engineering/agent-workflow.md](docs/engineering/agent-workflow.md).
- **Memory:** `docs/` is an [Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format) knowledge base with a project [log](docs/log.md), architecture decisions ([docs/adr](docs/adr/index.md)) and an [index](docs/index.md). How it is kept current: [docs/engineering/knowledge-protocol.md](docs/engineering/knowledge-protocol.md).
- Also: [Code of Conduct](CODE_OF_CONDUCT.md), [Security policy](SECURITY.md), [Governance](GOVERNANCE.md).

## License

Apache-2.0. See [LICENSE](LICENSE). FFmpeg, whisper.cpp, Blender and any models are separate projects under their own licenses; we run them as separate programs and do not bundle GPL code in the app.
