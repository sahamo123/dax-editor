---
type: Guide
title: Windows laptop implementation plan
description: Two-hour implementation sequence, local dependency layout, acceptance gates, and follow-up scope for the first usable Windows desktop build.
tags: [desktop, windows, implementation, testing]
status: draft
generated:
  by: process:implementer
  at: 2026-10-20T14:52:00Z
---

# Windows laptop implementation plan

## Delivery target

Start: October 20, 2026, 07:52 Pacific. Target: 09:52 Pacific (120 minutes).
Checkpoint: this original deadline was missed. Offline-engine acceptance passed, while native validation is blocked by the laptop's Application Control signing policy. The tracker records current evidence and remaining gates.
Deliver a locally runnable Windows desktop editor **with offline AI installed and able to edit**, from this checkout, with an executable and, if native packaging succeeds, an unsigned installer. This scope was explicitly selected by the owner. Readiness requires a real import/edit/save/reopen/export smoke test and a real local-model edit. A successful build or model download alone does not establish readiness. Record actual results in STATUS and the project log. Task state and evidence live in [the task tracker](../../DEVELOPMENT-TASKS.md).

The two-hour target covers the existing product's core workflow. It does not imply completion of the full roadmap or production certification. Never replace a failed native build with a browser and call it a desktop release.

The owner subsequently requested all dependencies inside one installer. ADR 0012 adds the verified model/CPU runtime, Microsoft C++ app-local release DLLs, licence/provenance files and offline WebView2 installer. LM Studio remains an optional external endpoint, with no redistribution assumed. Windows native launch requires policy-authorized or trusted-signed binaries on this laptop.

## Starting evidence

- Source branch: `claude/exciting-lamport-1k91fh`, baseline `82f1d24`.
- Full Git history is present locally; baseline source backup is `artifacts/dax-editor-source-82f1d24.zip`.
- The 12 application/library packages and browser frontend compile. Lint, documentation validation, and dead-code checks passed in the initial laptop check.
- Default tests encountered sandbox rename denials, a Windows port-owner test failure, and Windows FFmpeg filter-path errors. These require isolation before reporting code defects or a green baseline.
- Rust and Microsoft C++ Build Tools were absent from the available toolchain. WebView2 exists.
- Tauri points to `shell-placeholder/web`, and the packaging script bundles the bare server rather than the fully wired engine launcher. Both prevent the intended product experience.
- Native save-dialog permission is missing although the frontend invokes it. Any capability change must have a narrow purpose and documented rationale.
- The saved handoff archive-security patch fails an apply check, but inspection found its chain-containment implementation and matching tests already in the baseline. Do not duplicate the patch. The Windows archive tests pass with POSIX-only cases explicitly skipped; Linux/macOS symlink behavior remains outside this laptop's verification.

## Local files and dependency layout

| Location | Contents | Recovery |
|---|---|---|
| Repository root | All tracked source, docs, templates, playbooks, lockfiles, Git history | Git origin plus baseline ZIP |
| `node_modules`, package `node_modules` | Installed locked JavaScript dependencies | pnpm 10.28.0 and frozen lockfile |
| `.local-tools/pnpm-store` | Project-owned package cache | Fetch/install from lockfile |
| `.local-tools/downloads` | Rust/MSVC installers and downloaded tool archives | Official publisher URLs |
| `.local-tools/cargo`, `.local-tools/rustup` | Rust toolchain and Cargo cache | rustup with project-specific homes |
| `.local-tools/vs-buildtools` | Requested C++ Build Tools install location | Microsoft installer; Windows components may still live outside this folder |
| `apps/desktop/.cache/sidecars` | Pinned Node and LGPL FFmpeg download archives | `sidecars.lock.json`; SHA-256 validation |
| `apps/desktop/src-tauri/binaries` | Prepared Windows Node, FFmpeg, ffprobe executables | Sidecar preparation script |
| `apps/desktop/src-tauri/resources` | Bundled engine, fonts, templates, skills, third-party notices | Build/preparation scripts |
| `artifacts` | Source backup, test logs, installer/portable output, generated smoke media | Rebuild; never commit media, tokens, or user projects |

Do not copy system credentials, personal configuration, or unrelated home-directory content. Installers, caches, generated binaries, and runtime data remain ignored. Verify their presence rather than assuming downloaded means installed. Windows SDK, WebView2, and installer services are system components and cannot truthfully be described as wholly portable.

## Work sequence and time boxes

### 0–20 minutes: toolchain and reproducibility

1. Keep the clean baseline source ZIP and note the commit.
2. Install project-local Rust; install Microsoft C++ desktop build workload and SDK without restarting automatically.
3. Download and SHA-256-verify the lockfile's Windows Node/FFmpeg artifacts. Use Node 22 and pnpm 10.28.0 locally, not an unrelated global version.
4. Populate the project-owned pnpm store and Cargo cache. Provide a PowerShell environment entry point and repeatable build/launch commands.
5. Verify Rust, linker/SDK, Node, pnpm, FFmpeg and ffprobe versions; record any installer elevation/reboot blocker immediately.

Gate: dependencies present and native compiler invocation works. Start downloads early; continue independent source inspection while they run.

### 20–45 minutes: connect the real desktop product and prepare offline AI

1. Configure Tauri to build and load the React frontend, preserving its CSP and loopback token authentication.
2. Package `@dax/engine` rather than bare `@dax/server`, so chat/provider/local-model services exist in the app.
3. Include fonts, templates, and editing playbooks in resources; resolve them without relying on the development directory.
4. Grant only the native save-dialog capability needed for user-chosen export paths; retain all existing process/filesystem restrictions.
5. Verify shell-to-frontend server-info shape, native dialog contracts, startup timeout, and engine shutdown on window close.
6. Build a debug native executable as soon as the compiler is ready. Avoid waiting for release optimization to discover integration errors.
7. Verify the small Qwen model's pinned publisher revision, SHA-256 and licence evidence, and the Windows llama.cpp CPU runtime digest. Download verified bytes into the project-local cache. Select CPU settings appropriate for this laptop's 16 GB RAM, with a bounded context and thread count.

Gate: actual native window opens the real editor, authenticates to its engine, and shows a usable connection.

### 45–80 minutes: repair Windows core workflow

1. Re-run the failed tests with a workspace-owned temporary folder and, where necessary, outside the restrictive test sandbox. Separate permission failures from implementation failures.
2. Reproduce and correct FFmpeg Windows drive-letter/path escaping for overlay/caption files using regression tests plus a real render.
3. Validate import, proxy generation, playback, thumbnail/waveform loading, timeline trim/split, undo/redo, and user-selected export path.
4. Verify project persistence across an app restart. Add a minimal save/open entry point only if the existing app cannot expose the server's project persistence reliably.
5. Complete the archive symlink-chain patch separately if downloading local-model runtimes is enabled; do not bypass archive integrity or containment checks to meet the deadline.

Gate: synthetic local video can be imported, previewed, edited, saved/reopened, exported, and probed successfully. Source input remains unchanged.

### 80–105 minutes: offline AI, package and test

1. Install the verified CPU runtime and small model for the native app's engine. Start it, verify the listener belongs to the spawned process, and select the local provider in Settings. Keep a copy of downloaded bytes and provenance in this folder.
2. Run a real prompt through the app's agent, such as adding a title, then verify the command result and timeline. Export that edit. Stop/restart the app and confirm the installed model is recognized. No cloud API key may be required for this acceptance test.
3. Run meaningful focused tests for modified behavior and the full `pnpm check` with recorded output. Fix required gate failures; do not silently skip or weaken assertions.
4. Build a Windows executable and NSIS installer using bundled pinned runtimes. If release compilation is too slow, finish and explicitly label the debug developer build while release packaging continues.
5. Run the built application from its output folder with development-only environment overrides removed. Confirm resources and engine startup still work.
6. Verify real native file dialogs, successful export, restart persistence, and process cleanup, including the local model. Capture evidence if available; distinguish automated API tests from manual native UI checks.

Gate: concrete runnable artifact with validated manual and offline-AI behavior; report unsigned status and all remaining failing checks.

### 105–120 minutes: handover

1. Put launch/build entry points and artifact locations in this folder.
2. Update STATUS, the project log, touched concepts, and generated documentation indexes. Validate the knowledge base.
3. Record exact tool versions, observed test outcomes, reproducible failures, and the next issue. Keep commits small and separate fixes from refactors.
4. Supply the executable/installer link, detailed run instructions, and an evidence-based READY / NOT READY decision for the core workflow.

## Acceptance checklist

- [ ] Native app opens the actual editor without a manually started terminal/server.
- [ ] Import through native dialog and drag/drop works for a supported local file.
- [ ] Preview plays both video and audio; timeline manipulation remains undoable.
- [ ] Text overlay export works with Windows drive-letter paths and spaces.
- [ ] Project edits survive closing/reopening the application.
- [ ] User can choose an export destination and receive a playable output with expected duration and streams.
- [ ] Closing the app stops its engine and supervised child processes.
- [ ] Packaged app uses bundled Node/FFmpeg and resources, not source-checkout paths.
- [ ] Verified local model and CPU inference runtime are installed and available without a cloud key.
- [ ] A real local-model prompt changes the project through the command registry, and the result exports correctly.
- [ ] Restart recognizes the installed model; closing the app cleans up inference processes.
- [ ] Required lint/build/docs/dead-code/test checks pass, or remaining failures are explicitly disclosed as release blockers.
- [ ] Toolchain caches, source backup, and reproduction instructions exist locally.

## AI and remaining roadmap

Offline AI is required for this delivery, while manual editing must remain usable during model startup or failure. First verify the packaged engine reports honest provider status. A user-configured API endpoint/key can be supported by existing settings; never copy keys into this checkout. The selected small local model needs a verified runtime, verified model bytes, enough memory, archive containment, Windows process identity, and an actual chat/edit test before being called working. Speech setup needs installation routes and UI, with explicit downloads and cancellation; captions/filler removal must clearly report unavailable until setup succeeds. Speech installation is tracked as a stretch item for this two-hour build, not silently included in offline text-model readiness.

After the core desktop gate: stable timing tests; remaining FFmpeg protocol restrictions; real-model evaluation; speech install controls; external-agent draft/approve; effects preview/timeline parity; B-roll; recording; connectors; plugins. Signing and public distribution require their own release work.

## Contingencies

- Toolchain install denied or reboot required: retain downloaded installers and exact diagnostics, finish unaffected preparation, and report the native build blocker. Do not claim an installer exists.
- Release packaging exceeds time box: provide an actually tested developer executable, clearly label it, and record packaging status.
- AI cannot be verified in time: report the requested combined delivery NOT READY, while separately describing any usable manual-editor build. Do not silently reduce the agreed scope.
- Security regression remains: do not enable the affected download/import path by weakening containment or validation.
- Missing native UI automation: state exactly which native checks still require user verification; API success is not a substitute.

Reference: [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/), [Windows installer documentation](https://v2.tauri.app/distribute/windows-installer/), [handoff](handoff.md).
