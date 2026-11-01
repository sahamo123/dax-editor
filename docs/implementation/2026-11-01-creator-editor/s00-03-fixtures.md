---
type: Guide
title: S00.03 acceptance fixture inventory and receipt
description: Regeneration instructions, coverage and rights boundaries for synthetic and private real-media acceptance fixtures.
tags: [implementation, fixtures, evidence, media]
status: draft
generated:
  by: process:implementer
  at: 2026-11-01T12:10:00Z
---

# S00.03 fixture inventory and receipt

**State: VERIFIED**, with a separate self-review; independent stage review remains due. [Issue #125](https://github.com/sahamo123/dax-editor/issues/125), [PR #126](https://github.com/sahamo123/dax-editor/pull/126), tested head `103e2fb4ee39a80e2fc0bfd85a7ddd0ede2769b5`. Before entry, predecessor [issue #123](https://github.com/sahamo123/dax-editor/issues/123), [PR #124](https://github.com/sahamo123/dax-editor/pull/124) and head `58089a15147971b0bce590cfcd6c313d4e225517` were rechecked against the clean current tree.

## Synthetic cases

From the repository root with system `ffmpeg` and `ffprobe` on PATH, run `pnpm fixtures:acceptance`. It creates a unique folder under ignored `artifacts/acceptance-fixtures/`, never overwriting an existing run. It uses test patterns, an included Inter font for a frame counter, mono sine audio and the MPEG-4 encoder. The generated `manifest.json` records FFmpeg version, stream properties and SHA-256 for each generated file. Keep manifests and videos out of Git.

| Case | Target stream | Intended checks |
|---|---|---|
| short | 12 s, 320×180, 30 fps, mono audio | Portrait format, split, text, undo and short export |
| full-length | 65 s, 320×180, 30 fps, mono audio | Longer timeline, trim, save/reopen and export |
| podcast | 75 s, 320×180, 30 fps, mono tone | Timeline navigation and long-audio handling; not speech recognition |
| educational | 45 s, 320×180, 30 fps, mono audio | Format, titles and chapter-like navigation; not a human lesson |
| fractional | 10 s, 320×180, 30000/1001 fps, mono audio | Frame-grid and duration conversion |
| variable-rate | 10 s, 320×180, variable frame intervals, mono audio | Variable-rate import and synchronization |
| no-audio | 6 s, 320×180, 30 fps, no audio | Import, preview and export without audio |
| malformed / missing | Invalid bytes / absent file | Clear error and missing-media recovery |

On this laptop, two independent generation runs produced identical hashes for all seven videos using the same system FFmpeg 9.0.1 build. A later run after formatting also matched; all seven files fully decoded. The generator checks stream dimensions, duration, audio presence and distinct frame intervals for the variable-rate case. The invalid file was rejected by ffprobe and the intentionally missing path remained absent. Byte-identical output across different FFmpeg builds or platforms is not assumed; regenerate and record the actual build and hashes.

These generated clips are synthetic technical fixtures. Tone does not establish speech recognition, and repeated patterns do not demonstrate human editing usability. The existing opt-in `scripts/New-SpeechFixture.ps1` and `scripts/verify-speech-longform.mjs` cover a separately generated narration; Windows voice selection can change its output and prior results must not be described as a fresh run.

## Existing private media and scope

Prior October 27 acceptance recorded an owner-authorized private Drive recording and an MCP edit/export. Its local result and project snapshots remain under ignored `artifacts/real-video-mcp/`; the result is readable. A fresh non-destructive availability check found its private source file and matched its SHA-256 against the prior result; no media content or private path was published. That authorization and evidence concern the recorded test, not redistribution or an actual external-assistant inference claim. Keep original media, identifiers, paths and transcripts private. Verify availability and applicable permission again before each new use. No real podcast or educational recording has been freshly inventoried or usability-tested for this step; those are explicit gaps, not synthetic passes.

The 30/60/120-minute corpus is reserved for S04.01. Preserve previous ignored files and use new unique run folders; do not delete or overwrite user projects. A manifest hash establishes file identity, not rights or product acceptance.

## Verification still required

The first full `pnpm check` stopped at dead-code validation because the generator was not registered as a project command. Adding `fixtures:acceptance` fixed the issue; the standalone dead-code check and fixture command then passed. The normal-host full retry with explicit system FFmpeg/ffprobe passed: 1,801 package tests and 17 script tests passed, with 67 package tests skipped. Final checks and self-review were recorded in issue #125. Required real-media usability cases with unavailable authorized inputs must remain blocked at their applicable acceptance gate. The packaged FFmpeg `spawn UNKNOWN` issue remains distinct from these system-tool fixture checks.
