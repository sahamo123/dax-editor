# Dax Editor laptop delivery tracker

## Current acceptance — October 27, 2026

Additional real-footage MCP gate PASS: actual stdio proxy/SDK client imports a real clip into the visible live editor, makes one grouped trim/title/volume edit, verifies undo/redo and Planning refusal, and exports/fully decodes audio/video plus WebM review. Private result and reopenable test/previous projects: artifacts/real-video-mcp/. Actual Claude/Codex assistant inference remains pending.

Current matrix: [STATUS](docs/STATUS.md), [delivery issue #8](https://github.com/sahamo123/dax-editor/issues/8).

- **Verified:** pnpm check (1,799 package plus 17 root tests), 39 browser workflows, real offline AI editing/export/restart/cleanup, longer synthetic speech/caption/cut/export, and real Linux Blender templates.
- **Implemented:** independent named providers, manual zoom/music/SFX/ducking/images, complete-effects WebM review, shared MCP/task cancellation, and corrected job completion ordering (PR #61).
- **Built:** corrected unsigned installer 40528351026; full archive is 1,705,302,024 bytes. No verified current installer copy is local.
- **Installed-native PASS:** [40532196608](https://github.com/sahamo123/dax-editor/actions/runs/40532196608) verifies actual Open/Save dialogs, import and interactive playback, title/undo/redo, review, MP4 audio/video export, saved restart/shutdown, same-version reinstall and preservation after uninstall. Local evidence is hash-verified under artifacts/native-windows-acceptance/pass-18/.
- **Pending:** owner-laptop Application Control execution and installer transfer; actual hosted calls and external-assistant sessions; cross-version upgrade, display scaling/peak memory and human/hours-long speech acceptance. Experimental macOS remains issue #39.

Development testing is available at http://127.0.0.1:4175/ through Start Development Preview - System FFmpeg.cmd, with .dax-data/ preserved. WebM effects review plays in IAB; its H.264 interactive proxy does not. Actual native Windows WebView2 playback passes. No owner-laptop security policy was changed. Native owner-laptop release remains NOT READY until its execution gate is resolved.

## Autonomous continuation — October 23, 2026

Dependent draft PRs #40–#50 close additional implementation gaps. The older October 22 table below is historical and is superseded by these current acceptance states:

| Work | Current evidence | Remaining |
|---|---|---|
| T03 connections | Named same-family snapshots and Save/Load/Remove; private isolated keys; targeted security/UI/browser checks pass | Real hosted edits require owner-configured credentials |
| T04 manual effects | Zoom/music/SFX/ducking/images exposed manually; actual WAV/PNG picker, undo/redo and playable export pass | Exact effect preview parity; native dialog/scaling verification |
| T06 speech | 143.65 seconds of offline synthetic speech, 318 words/89 caption lines, correction/reviewed cut/trim/export pass | Human recordings, hours-long scaling and native UI acceptance |
| T07 MCP | Active render cancellation, task ownership and Planning exclusion pass; installed Codex CLI parses both configurations | Actual individually verified Claude/Codex assistant editing sessions |
| T08 Blender | Real Linux Blender 4.0.2 passes all three templates, nonblank output, import/regenerate/undo and cancel cleanup | Local Windows executable remains blocked by application control |
| T09 release | Application `pnpm check` passes (1,788 package +14 script tests); all 39 browser workflows pass; final build/type/lint passes; current candidate 39925892009 PASS; transport regression brings root tests to 15, all pass | Current installer local transfer fails even at 64 MiB; policy-authorized native install/upgrade/playback/shutdown and whole-app peak memory |

Evidence: `artifacts/blender-real-evidence/result.json`, `speech-longform/result.json`, `codex-config-acceptance/result.json`, `mcp-cancellation-tests-final.log`, `manual-effects-browser-final.log` and `autonomous-preview-smoke.log` (all under `artifacts/`). The preview preserves `.dax-data/`; native release remains **NOT READY**. No Windows policy or global client configuration has been changed.

## Functional release continuation — October 22, 2026

The owner approved the expanded [functional release contract](docs/specs/functional-desktop-release.md). [Delivery issue #8](https://github.com/sahamo123/dax-editor/issues/8) indexes T01–T09 (issues #9–#17). The connector has no milestone-creation operation; the delivery issue is the tracking index until that capability is available.

Current implementation is published as dependent draft PRs #18–#37. Application source 0d1b7e7 passes `pnpm check` (1,780 package tests plus 14 root tests), all 37 browser workflows and 25 Rust tests. Portable packaging follow-up f42200a passes 13 shell-script tests, dead-code checks and local resource preparation. Final evidence: `artifacts/preservation-final-check.log`, `preservation-final-browser-tests.log`, `functional-rust-tests.log`, `redist-shell-tests.log` and `offline-smoke-1792707259245/result.json`. Historical phases below retain their original evidence and are not final-release certification.

| Stage | State | Remaining |
|---|---|---|
| T01 baseline | VERIFIED | Current-source checks, visual walkthrough and evidence reconciliation recorded |
| T02 tasks/revisions | IMPLEMENTED | Broader native task acceptance; shared queue/recovery/conflict tests pass |
| T03 providers | IMPLEMENTED / PARTIAL | Live hosted credentials and multiple named profiles of the same family |
| T04 projects/manual | IMPLEMENTED / PARTIAL | Native dialogs and complete manual feature parity; laptop project-copy workflow passes |
| T05 UX | IMPLEMENTED / BROWSER VERIFIED | 37 browser workflows; native Windows scaling/dialog acceptance remains |
| T06 speech | IMPLEMENTED / LIVE VERIFIED | Longer edited-speech/native UI acceptance; 23-word narration/caption export passes |
| T07 MCP | IMPLEMENTED / TRANSPORT VERIFIED | Actual Claude/Codex sessions and external cancellation acceptance |
| T08 Blender | IMPLEMENTED / BLOCKED | Real render/regenerate/cancel needs policy-authorized Blender; event 3077 blocks verified official executable |
| T09 release | PARTIAL / BLOCKED | Stronger real offline suite passes; local installer tools blocked; artifact-only CI candidate in PR #37; native install/upgrade and full-app memory acceptance remain |

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

- Browser imports, video attachments, chat queue/steering and enforced Planning mode: implemented under GitHub issue #4. Full check passes (`artifacts/chat-tasks-full-check.log`); subsequent server attachment/drop/control tests pass in final logs. Live browser selection imported and played generated footage; offline Planning chat returned without timeline changes. Native installer refresh/validation remains outstanding.

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
