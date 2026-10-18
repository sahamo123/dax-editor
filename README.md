# dax-editor

A free, open-source video editor you drive with plain language. Drop in a video (or record one), say what you want, and watch it get edited. Chat on the left, your video on the right.

> **Status: early.** The video engine (`@dax/core`) works and is tested. The CLI, MCP server and desktop app are not built yet. See the [roadmap](docs/ROADMAP.md).

## Goals

- **Completely free and open source.** Apache-2.0. No paid services required to use it.
- **Prompt-driven editing.** Cuts, silence and filler-word removal, transcripts, captions, and animation suggestions based on the format you want (tutorial, explainer, short-form).
- **Works with any LLM.** Use it from Claude or any MCP client, from the built-in chat with your own API key, with a local model through Ollama, or with a small embedded model.
- **Desktop app for macOS, Windows and Linux** (Tauri), with a **CLI and MCP server from the start**.
- **Extensible.** Connectors for cloud storage (Google Drive and more) and optional plugins such as Blender animation come later, built on interfaces that already exist in the engine.

## What works today

`@dax/core` is a TypeScript library with:

- A JSON timeline model with non-destructive, undoable edit operations (split, trim, delete range, keep ranges, move, volume).
- FFmpeg probing, silence detection and scene detection.
- Mapping from source-file time to timeline time, so "remove these silences / filler words" stays correct after earlier edits.
- An FFmpeg renderer that picks a license-friendly H.264 encoder (hardware encoders first; libx264 only if present).
- Transcript types and filler-word detection (the whisper.cpp adapter is not written yet).
- A `Connector` interface with a local-disk implementation.

## Develop

Requires Node 20+, [pnpm](https://pnpm.io) and FFmpeg on your `PATH` (or set `DAX_FFMPEG` / `DAX_FFPROBE`).

```sh
pnpm install
pnpm build
pnpm test
```

## Docs

- [Roadmap](docs/ROADMAP.md)
- [Research: landscape, risks and open questions](docs/RESEARCH.md)

## License

Apache-2.0. See [LICENSE](LICENSE). FFmpeg, whisper.cpp, Blender and any models are separate projects under their own licenses; we run them as separate programs and do not bundle GPL code in the app.
