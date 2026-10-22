---
type: Spec
title: Functional desktop release
description: Delivery contract and acceptance gates for manual editing, optional AI providers, speech, live MCP and Blender templates.
tags: [desktop, release, ai, mcp]
status: draft
generated:
  by: process:implementer
  at: 2026-10-22T00:00:00Z
---

# Functional desktop release

Delivery tracking: [issue 8](https://github.com/sahamo123/dax-editor/issues/8). Each implementation issue has a separate branch and review PR; large features are split into dependent changes. Historical checks are not current release evidence.

## Product contract

An AI-first workspace must remain a usable manual editor with inference stopped and networking disabled. Chat, manual actions and local MCP clients share one authoritative session, validated command registry, task records and undo history. Planning never edits. Steering continues an active request at a model boundary; Stop is separate.

Local llama.cpp with the verified 2B model remains the default. Optional connections are OpenRouter, direct OpenAI and custom compatible APIs, with independent configuration and secrets. No automatic paid fallback or retry of an already executed mutation. Hosted live checks need owner-configured credentials; mocks do not establish hosted readiness.

Speech is required: setup, verified runtime/model provisioning, transcript correction, captions and reviewable filler/silence cuts. Blender is an optional separate user-installed process. First templates are title card, logo intro and 3D text; scripts belong to the application, parameters are validated, and renders return as media. Arbitrary model-generated Python is excluded.

## Delivery sequence

| Work | Issue | Acceptance |
|---|---|---|
| T01 baseline | [9](https://github.com/sahamo123/dax-editor/issues/9) | Fresh checks, visual walkthrough, evidence matrix and native blocker |
| T02 tasks | [10](https://github.com/sahamo123/dax-editor/issues/10) | Origins, revisions, captured project/provider/mode, history links and interrupted recovery |
| T03 providers | [11](https://github.com/sahamo123/dax-editor/issues/11) | Independent connections, tool probe, truthful status and actionable errors |
| T04 projects/manual | [12](https://github.com/sahamo123/dax-editor/issues/12) | New/open/recent/save-as, relink, manual release-feature controls and safe undo |
| T05 workspace | [13](https://github.com/sahamo123/dax-editor/issues/13) | Chat/preview/timeline, contextual tools, persistent tasks and laptop accessibility |
| T06 speech | [14](https://github.com/sahamo123/dax-editor/issues/14) | Offline setup, transcription/correction/captions/cuts and synchronized export |
| T07 live MCP | [15](https://github.com/sahamo123/dax-editor/issues/15) | Authenticated active-engine bridge, planning, tasks and client checks |
| T08 Blender | [16](https://github.com/sahamo123/dax-editor/issues/16) | Detection, bounded templates, progress/cancel, import and regeneration |
| T09 release | [17](https://github.com/sahamo123/dax-editor/issues/17) | Performance, current installer, native clean install/upgrade and provenance |

## Architecture and compatibility

Extend the existing protocol with task origin/revisions/history references, provider diagnostics, live MCP jobs, speech status and bounded Blender render requests. New settings must preserve old configuration and secrets. Project files never include credentials. Reject stale mutations instead of overwriting newer work. Project switching resolves queued work explicitly; restart marks interrupted work rather than replaying it.

Heavy rendering/transcription is bounded to one job on the target laptop. Local inference loads on demand, avoids duplicate servers and supports idle unloading. Measure end-to-end latency and peak memory, not only token throughput.

## Verification and release decision

T06 adds explicit pinned offline speech setup/removal/status, asynchronous cancellable recognition, transcript word correction, caption enable/style and selected cleanup-cut review. The Windows build now prepares and ships speech resources; offline seeding validates size/hash and respects later model removal. Default is English `base.en-q5_1` (59,721,011 bytes), two recognition threads. The speech adapter exposes real progress. Fresh generated narration passed transcription, correction, captioned video/audio export: `artifacts/speech-live/result.json`. Server/adapter checks: `artifacts/speech-server-tests.log` (46 tests), `artifacts/speech-engine-tests.log` (8). Native speech UI remains unverified.

T05 workspace foundation uses an overlay tool drawer at laptop widths, readable preset cards, labelled tabs, larger composer and top-bar task access. Fresh browser screenshot: `artifacts/functional-audit/02-workspace-rebuilt.png`. Initial waiting/media states resolved after connection and proxy loading; do not record transient capture states as persistent defects. Evidence: `artifacts/workspace-ui-build.log`; broader viewport/keyboard checks remain required.

T04 manual tools add output format/fit, titles, caption style and editing-template controls without AI. Clip properties expose source-time trim fields. Media relinking uses a picker/upload and the registry, preserving IDs/cuts/transcript only for matching source metadata; transcript word correction preserves timing and undo. Evidence: `artifacts/manual-tools-build.log` and `artifacts/project-commands-tests.log`. Broader manual feature coverage remains part of release acceptance.

T04 project foundation exposes New/Open/Recent/Save/Save As over existing project operations. Browsers open an uploaded validated copy and download project JSON; desktop uses native dialogs. Media stays referenced, not embedded. Scratch projects remain in recents and can be reopened without broadening allowed roots. Copy imports validate all asset paths before adopting the project. Project/task conflicts are refused. Evidence: `artifacts/project-workflows-build.log` and `artifacts/project-workflows-tests.log`.

T03 adds a separate direct OpenAI configuration/key namespace without removing the old compatible connection. Legacy official-endpoint settings and keys are copied once. Provider diagnostics explicitly request a synthetic tool call and never execute it; model discovery is opt-in. Status distinguishes configured from tested/connected and invalidates on settings/key changes. No paid request is made by automated tests. Evidence: `artifacts/provider-diagnostics-tests.log`, `artifacts/provider-server-tests.log`, `artifacts/provider-ui-build.log`. Multiple named profiles for the same custom endpoint family remain follow-up work within T03.

T02 foundation adds per-open project identity and monotonic revisions (including undo), optional request guards, manual command history attribution, queued provider/settings capture, AI history boundaries, and task records for export/transcription jobs. Production API/local runners use the engine command seam: a manual edit during inference preserves manual work and fails the next stale AI call. Runners without this seam retain exclusive editing. Project switching is refused with unfinished chat work. Task restart recovery remains non-replaying. Verification: `artifacts/task-revisions-tests.log` and `artifacts/task-revisions-build.log`; broader acceptance and native gates remain separate.

Required: manual-only import/edit/undo/save/reopen/export; real local AI editing suite; live hosted edits when configured; queue/steering/restart/conflict tests; read-only Planning in chat and MCP; speech correction and synchronized export; individually checked external clients; Blender template render/regenerate/cancel; native dialogs/playback/install/upgrade/cleanup; pnpm check and scribe completion.

Native Windows release remains blocked by Application Control until a policy-authorized executable can run. An unsigned build or browser test is not native validation. No security policy change is part of this plan. Remote connector hosting, public plugin-store publication and arbitrary Blender scenes are outside this release.
