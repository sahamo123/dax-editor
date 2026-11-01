---
type: Guide
title: S00.01 execution baseline receipt
description: Evidence and scope for the first-improvement execution baseline, including private project preservation and remaining acceptance boundaries.
tags: [implementation, baseline, evidence]
status: draft
generated:
  by: process:implementer
  at: 2026-11-01T11:50:00Z
---

# S00.01 execution baseline receipt

**State: VERIFYING.** Tracking [issue #121](https://github.com/sahamo123/dax-editor/issues/121). The user explicitly launched the implementation goal on November 1, 2026. The selected route is `first-improvement`, S00–S02, ending at S02.08 as a development candidate. This is baseline evidence, not evidence that any editor feature has been implemented or accepted.

## Scope and source

- Starting branch `codex/staged-implementation-handbook`, clean working tree, commit `f57af682441e8442700199078e028d860e22418d`, tree `9e4ad28c89f6fb5ddca895c5511b7a3b57ce655d`; planning base `f05a57b99a2d184900ddd809a7480b30052ae5c1` is an ancestor. Work branch: `codex/s00-01-baseline-receipt`.
- Target is this Windows x64 laptop. Native acceptance is required at the applicable gate on an authorized target; the historical owner-laptop Application Control blocker has not been freshly reproduced or resolved in this step.
- Preserve manual/offline editing, the local model, existing optional OpenAI, OpenRouter and custom connections, and live-project MCP. Hosted live-provider calls and actual external assistant inference are not selected for this initial baseline without configured and authorized access; they are NOT_LIVE_VERIFIED. No decision to remove release capabilities is implied.
- No deployment, paid-provider fallback, machine-security modification or automatic merge is authorized by this route.

## Preservation and environment

- `.dax-data/`, `artifacts/`, `.local-tools/` and `node_modules/` exist and remain private/ignored where applicable. No root `models/` directory was found; this does not establish whether other runtime caches exist.
- Non-destructive JSON reads found 11 saved project/history pairs using the server's `<project path>.history.json` convention. Two existing private project snapshots under `artifacts/real-video-mcp/` also parse as JSON; their associated history was not claimed.
- One saved project/history pair was copied to this handbook's ignored `.local/baseline/` folder. Both copies parse as JSON and their SHA-256 hashes match their originals. Original paths are recorded only in the ignored private receipt. This is a byte backup, not proof that media paths or a complete project restore work; preserve original files and media.
- Windows reports `Microsoft Windows 10.0.26300` x64 through .NET; Node 22.23.3, pnpm 10.28.0, Rust 1.99.1, Git 2.54.0.windows.1, system FFmpeg 9.0.1. System FFmpeg version is not packaged-runtime verification.
- The initial CIM operating-system query was denied; the .NET runtime query supplied the OS version. No security policy was modified. One preliminary path-pair query used an incorrect suffix; the corrected query followed `packages/server/src/project-manager.ts` and `packages/core/src/session.ts`.

## Verification and next gate

Entry authorization and source ancestry were verified from the current request and Git; the project/history read and private backup checks passed. Historical browser, native, model and MCP evidence remains dated in [STATUS](../../STATUS.md), not rerun here. S00.05 owns the fresh full baseline.

Before S00.02, the issue and PR must contain the reviewed final receipt, source SHA and second-review result. Recheck the receipt and the current source tree; do not infer completion from this file alone. If the original pair is needed, consult the private origin record and restore only to an explicitly chosen location after verifying all associated media. Do not overwrite a live project.
