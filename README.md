# dax-editor

A free, open-source video editor you drive with plain language. Drop in a video (or record one), say what you want, and watch it get edited. Chat on the left, your video on the right.

> **Status: early.** The video engine (`@dax/core`) and a model-evaluation harness work and are tested. The CLI, MCP server and desktop app are not built yet. Current state: [docs/STATUS.md](docs/STATUS.md). Plan: [docs/ROADMAP.md](docs/ROADMAP.md).

## Goals

- **Completely free and open source.** Apache-2.0. No paid services required to use it.
- **Prompt-driven editing.** Cuts, silence and filler-word removal, transcripts, captions, and animation suggestions based on the format you want (tutorial, explainer, short-form).
- **Works with any LLM.** Use it from Claude or any MCP client, from the built-in chat with your own API key, with a local model through Ollama, or with a small embedded model.
- **Desktop app for macOS, Windows and Linux** (Tauri), with a **CLI and MCP server from the start**.
- **Extensible.** Connectors for cloud storage (Google Drive and more) and optional plugins such as Blender animation come later, built on interfaces that already exist in the engine.
- **Built to be continued by anyone.** The repo is the source of truth and is readable by any person or AI agent. See [Working on this project](#working-on-this-project).

## What works today

`@dax/core` is a TypeScript library with:

- A JSON timeline model with non-destructive, undoable edit operations (split, trim, delete range, keep ranges, move, volume).
- FFmpeg probing, silence detection and scene detection.
- Mapping from source-file time to timeline time, so "remove these silences / filler words" stays correct after earlier edits.
- An FFmpeg renderer that picks a license-friendly H.264 encoder (hardware encoders first; libx264 only if present).
- Transcript types and filler-word detection (the whisper.cpp adapter is not written yet).
- A `Connector` interface with a local-disk implementation.

`@dax/evals` measures how well a model can edit video (see [docs/evals/overview.md](docs/evals/overview.md)).

## Develop

Needs Node 22+, [pnpm](https://pnpm.io) (`corepack enable`) and FFmpeg on your `PATH` (or set `DAX_FFMPEG` / `DAX_FFPROBE`).

```sh
pnpm bootstrap   # checks tools, installs dependencies, enables git hooks
pnpm check       # lint, build, doc coverage, knowledge base, dead code, tests (what CI runs)
pnpm eval --adapter oracle   # run the model-evaluation harness
```

## Working on this project

- **People:** read [CONTRIBUTING.md](CONTRIBUTING.md). Work items are GitHub Issues.
- **AI agents:** read [AGENTS.md](AGENTS.md) first, then [docs/STATUS.md](docs/STATUS.md). Switching agents takes minutes: [docs/engineering/agent-workflow.md](docs/engineering/agent-workflow.md).
- **Memory:** `docs/` is an [Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format) knowledge base with a project [log](docs/log.md), architecture decisions ([docs/adr](docs/adr/index.md)) and an [index](docs/index.md). How it is kept current: [docs/engineering/knowledge-protocol.md](docs/engineering/knowledge-protocol.md).
- Also: [Code of Conduct](CODE_OF_CONDUCT.md), [Security policy](SECURITY.md), [Governance](GOVERNANCE.md).

## License

Apache-2.0. See [LICENSE](LICENSE). FFmpeg, whisper.cpp, Blender and any models are separate projects under their own licenses; we run them as separate programs and do not bundle GPL code in the app.
