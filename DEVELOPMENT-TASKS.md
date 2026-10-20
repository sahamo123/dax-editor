# Dax Editor laptop delivery tracker

Plan: [Windows implementation plan](docs/engineering/windows-desktop-plan.md).
GitHub delivery tracking: [issue #2](https://github.com/sahamo123/dax-editor/issues/2).

Owner-selected target: **Windows desktop editor + installed offline AI**.
Original time box: October 20, 2026, 07:52–09:52 Pacific. The deadline was missed; offline AI passes its bundled-engine smoke test and an installer has built, but native validation is blocked. Initial source: `82f1d24`.

Packaging decision: include the model and inference runtime in one installer (ADR 0012). LM Studio remains an optional external endpoint.

Statuses: DONE means verified evidence exists; RUNNING means work/check is active; TODO means not started; BLOCKED means a concrete unmet dependency; STRETCH is outside the minimum delivery gate. Update this file after each meaningful result. Do not mark a build as application readiness.

## Phase 1: prepare this laptop and folder

| ID | Task | Status | Dependency / evidence |
|---|---|---|---|
| P01 | Read source, AGENTS rules and latest passdown | DONE | Current branch checked out; handoff commit `82f1d24` pulled |
| P02 | Preserve baseline source and full Git history | DONE | `artifacts/dax-editor-source-82f1d24.zip`; local `.git` |
| P03 | Record detailed plan, scope, task tracker and acceptance criteria | DONE | Owner selected offline AI; linked plan and this tracker |
| P04 | Install pinned Node 22 and pnpm 10.28.0 locally | DONE | `.local-tools/node/node.exe` reports 22.23.3; local pnpm reports 10.28.0 |
| P05 | Install locked JS dependencies and project-owned cache | DONE | Frozen lockfile install; `.local-tools/pnpm-store` populated |
| P06 | Download verified LGPL FFmpeg/ffprobe | DONE | Sidecar SHA-256 and LGPL checks passed |
| P07 | Install Rust and download locked Cargo dependencies | DONE | Rust/cargo 1.99.1; `cargo fetch --locked` completed |
| P08 | Install Microsoft C++ Build Tools and Windows SDK | DONE | Installer log records completed install; native compilation succeeded |
| P09 | Download pinned Playwright Chromium | DONE | `.local-tools/playwright/chromium-1194` |
| P10 | Provide repeatable environment/build/launch entry points | DONE | Build and real-model development preview verified; native launch still subject to V07 |

## Phase 2: native app integration and Windows fixes

| ID | Task | Status | Dependency / evidence |
|---|---|---|---|
| N01 | Fix Windows FFmpeg filter paths | DONE | Failure reproduced before fix; 13 filter tests + 4 real render tests pass after fix |
| N02 | Point Tauri at the actual React editor | BLOCKED | Frontend builds and frozen-prototype startup regression passes; native recheck requires an authorized/signed build |
| N03 | Bundle the fully wired engine, fonts, skills and templates | DONE | Corrected resources included in rebuilt NSIS installer; bundled-engine smoke test passes; installed native validation remains V03 |
| N04 | Enable user-mediated native export save dialog | BLOCKED | Narrow capability added with ADR 0011; native picker test requires V07 |
| N05 | Build the native Windows executable | DONE | Native build completed in 6m39s; executable launched with bundled resources |
| N06 | Confirm archive hardening state and Windows listener detection | DONE | Current baseline already contains saved-patch logic; 28 tests pass, 11 POSIX cases skipped |
| N07 | Verify import, proxy media, preview, timeline edits and undo/redo | TODO | Requires N05 for native evidence; real-engine browser test also running |
| N08 | Verify autosave and reopening after restart | TODO | Existing server implements persistence; requires native smoke test |
| N09 | Verify native export and probe playable output | TODO | Requires N01/N04/N05/N07 |
| N10 | Verify process cleanup on window close | TODO | Requires running native app and later local inference |
| N11 | Fix native startup compatibility defects | DONE | Windows path regression passes; minimal Zod patch preserves frozen Object.prototype; 4 browser/real-engine tests pass |
| N12 | Wait for media/export workers and file cleanup during engine shutdown | DONE | Windows browser teardown exposed a live FFmpeg writer; regression failed before fix, passes after. 40 pipeline/server tests pass in `artifacts/shutdown-final-tests.log` |

## Phase 3: required offline AI

| ID | Task | Status | Dependency / evidence |
|---|---|---|---|
| A01 | Select small CPU model and verify upstream licence/hash/runtime provenance | DONE | Qwen Apache-2.0 licence checked; Windows CPU runtime digest matches GitHub API and source pin |
| A02 | Download verified model/runtime into this folder | DONE | Model/runtime hashes pass; licences/provenance and Microsoft release DLLs included |
| A03 | Install and start local model for the native engine | DONE | Bundled engine cold-start passed from a fresh data directory with external fetches refused; native UI still blocked |
| A04 | Select local provider and make a real prompt-driven edit | DONE | Qwen added the requested title through the registry; AI history verified |
| A05 | Export AI edit; verify offline restart and inference cleanup | DONE | Playable video/audio, preserved edit on restart and model process exit verified by bundled-engine test |

## Phase 4: validation and handover

| ID | Task | Status | Dependency / evidence |
|---|---|---|---|
| V01 | Required lint/build/docs/dead-code/tests | DONE | `pnpm check` exits 0: `artifacts/check-windows-verified.log`. Added preview launcher subsequently passes lint/dead-code and its real-model smoke |
| V02 | Real-engine frontend end-to-end tests | DONE | 3/3 real-engine tests pass; `artifacts/desktop-e2e.log` |
| V03 | Native UI smoke test with real dialogs | BLOCKED | Initial window blank; path and frozen-prototype defects isolated. Current unsigned executable is blocked by Windows Application Control event 3077 |
| V04 | Portable executable and unsigned Windows installer | DONE | Updated 1.53 GiB build includes shutdown fix; `artifacts/offline-installer-build-verified.log` exits 0. Native install validation remains blocked |
| V05 | Update STATUS, project log, docs indexes and version/evidence manifest | DONE | Source saved in logical commits on `codex/windows-offline-desktop`; STATUS, log, handoff, ZIP and delivery receipt refreshed for this checkpoint |
| V06 | Final delivery decision and exact launch instructions | DONE | NOT READY for native release; development preview works. Checks pass, but native install/dialog/playback gates remain blocked by Smart App Control |
| V07 | Obtain policy-authorized native build for this laptop | BLOCKED | Windows Code Integrity event 3077; no code-signing certificate found in personal/machine stores. Owner clarified no certificate is available. Requires policy-trusted signing or administrator-approved development workflow |
| V08 | Run all browser editor workflows | DONE | 32/32 Playwright tests pass: `artifacts/desktop-all-e2e-verified.log` |
| V09 | Provide a usable development preview with offline AI | DONE | `Start Development Preview.cmd`; frontend/authenticated engine/local model smoke passes. Live data is ignored `.dax-data/`; native features remain separate |

## Explicit follow-up / stretch work

| ID | Task | Status | Notes |
|---|---|---|---|
| S01 | Speech-runtime/model installation controls and live transcription | STRETCH | Needed for captions/filler-word removal; distinct from offline text-model editing |
| S02 | New/open/save-as project UI if autosave proves insufficient | STRETCH | Current server already persists and restores the latest project |
| S03 | B-roll, effects timeline parity, recording, connectors and plugins | STRETCH | Full-roadmap work after core desktop/offline-AI delivery |
| S04 | Signed public release and macOS/Linux validation | STRETCH | Windows developer build first; certificates and other platforms separate |
| S05 | Resolve remaining Windows test portability and bridge support | DONE | Bridge: 106 passed, 1 POSIX permission-bit skip. Server 127, MCP 53, engine 59, CLI 24 passed (1 POSIX signal-forwarding skip), before the additional shutdown regressions. Fixture adapter changes test spawning only; full check is V01 |

## Latest verified results

- Windows overlay render regression: reproduced before fix; real rendering passes after path escaping correction.
- Persistence/overlay operation tests: 27 passed outside the restrictive sandbox.
- Archive/listener tests: 28 passed, 11 POSIX-only cases skipped. This does not validate Linux/macOS symlink behavior.
- Native developer executable built and initially opened a blank window. Startup fixes pass targeted regressions, but Windows Application Control blocks the native recheck. Native contents/dialogs remain unverified; bundled-engine offline AI has separate passing evidence.
- Deterministic local-model lifecycle checks: 39 passed, 5 POSIX-only cases skipped (`artifacts/runtime-lifecycle-tests.log`).
- Real-engine frontend checks: 3 passed (`artifacts/desktop-e2e.log`).
- Real offline AI smoke test: PASS (`artifacts/offline-smoke-1792517191814/result.json`); this is bundled-engine evidence, not native-dialog validation.
- Windows path normalization: 1 Rust regression passed. Offline seed checks: 6 tests passed, including byte tampering and respecting model uninstall.
- LGPL portrait export regression: 220 fitting/template tests pass after switching from unavailable `boxblur` to `gblur` (`artifacts/blur-render-regression.log`). Windows source/path protection: 6 tests pass with junction fixtures (`artifacts/windows-path-safety.log`).
- Desktop unit tests: 303 passed; agent tests: 172 passed; script tests: 14 passed. Full required check now exits 0. Native readiness still requires the remaining native gates.
