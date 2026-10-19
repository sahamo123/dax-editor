---
type: Research
title: Tauri sidecar field notes
description: Real problems other projects hit shipping Tauri 2 external binaries (Node, FFmpeg) on macOS, Windows and Linux, with symptom, cause, fix and a concrete verdict on whether our sidecar plan changes.
tags: [tauri, sidecar, notarization, entitlements, codesigning, smartscreen, appimage, nodejs, packaging]
status: draft
generated:
  by: process:scribe
  at: 2026-10-19T00:00:00Z
---

# Tauri sidecar field notes

Companion to [Tauri sidecar packaging](tauri-sidecar-packaging.md). That note covers the design and the official docs. This note records what broke for other people, and what each finding means for our plan.

Verdict codes: **CHANGE** (edit the plan), **KEEP** (no change), **CHECK** (add a test or a spike before release).

## Method and limits

- The GitHub REST and search API returned 403 for tauri-apps repositories in this session (the repository is not attached), so evidence comes from web search and from fetching github.com issue pages. Issue states are as seen on the fetched page and can be stale.
- Items marked **(search only)** come from search snippets and were not opened. Treat them as leads.
- The Apple notarisation pages returned only their titles to the fetch tool. Apple rules stated below as general practice are **(unverified here)**.
- Reporter usernames are left out on purpose.

## Summary

| # | Problem (source) | Status seen | Verdict |
|---|---|---|---|
| 1 | Sidecars inherit the app's entitlements; a restricted one kills the sidecar at launch (tauri #16211) | Closed "not planned" by the reporter, 2026-10-05; no option added | CHANGE: minimal app entitlements; per-binary CI check |
| 2 | Notarisation rejects a bundle with an `externalBin` nested binary (tauri #11992) | Open since 2024-12-17, no maintainer reply | CHECK: notarised spike with one sidecar before release work |
| 3 | Stale sidecar shipped; same-version reinstall keeps the old one (tauri #15134) | Open since 2026-03-21, no maintainer reply | CHANGE: clean staging, hash checks, version bump |
| 4 | Target-triple naming (tauri #3355) | Closed, fixed 2022-02-08 | KEEP: `binaries/<name>-<triple>` as source name |
| 5 | AppImage launcher mode 0770 (tauri #16155) | Closed "completed" 2026-09-28; fix contested | CHANGE: pin Tauri 2.12 or later; assert modes in Linux CI |
| 6 | `tauri dev` sidecar fails after rebuild, signal 9 on macOS (tauri #4134) | Closed 2022-05-19 | CHANGE: dev script re-copies the sidecar |
| 7 | Sidecar broken inside the AppImage (tauri #5445) | Closed 2022-10-20 as duplicate of #5189 | CHECK: run the engine from the extracted AppImage |
| 8 | `node --build-sea` segfaults on macOS x64 (node #65479) | Open since 2026-08-22, conflicting reports | KEEP: SEA stays out of the default path |
| 9 | Any write after signing breaks the code seal (search only) | Various | CHANGE: sign last, verify after |
| 10 | Our SEA snippet ends in an ad-hoc signature | Own plan text | CHANGE: ad hoc is for local tests only |
| 11 | pkg-built Windows binaries flagged by Defender ML (vercel/pkg #350, #1493; search only) | Unclear | CHECK: Defender scan and false-positive submission |
| 12 | SignPath Foundation eligibility (fetched) | Terms as fetched | CHANGE: first release unsigned; signing needs a released project and per-release approval |
| 13 | SmartScreen reputation (fetched, Microsoft) | Current doc | KEEP: ship unsigned first with a documented warning |
| 14 | esbuild and `.node` addons (search only) | Various | KEEP: no native addons today; add a CI guard |
| 15 | "pkgxdev" is not the pkg bundler (fetched) | n/a | Naming only: the bundler is `@yao-pkg/pkg` |

## 1. Sidecars inherit the app's entitlements (tauri #16211)

**Symptom.** A sidecar declared in `externalBin` is killed at launch (exit 137) when the app's entitlements file contains a restricted key. The reporter's example is `com.apple.developer.associated-domains`. The AMFI log shows error -413 under Developer ID and -427 under ad-hoc signing. `codesign --verify --deep --strict` and notarisation both pass, so the build reports nothing.

**Cause.** The bundler signs every external binary with the app's one entitlements file. `SignTarget` has no field for per-binary entitlements. The reporter confirmed with `codesign -d --entitlements -` that the sidecar carries the app's keys.

**Fix.** None upstream. The proposed `sidecarEntitlements` option has no pull request. The workaround in the thread: build with `--bundles app`, re-sign each sidecar with its own entitlements, re-sign the `.app`, notarise, then build the DMG outside Tauri. That gives up Tauri's notarisation, updater artifacts and DMG step.

**Impact on us.**
- Node needs JIT. The reporter notes that a no-entitlements default would break Node, Bun and Deno sidecars. So the app's entitlements must include `com.apple.security.cs.allow-jit`. A forum answer (search only) says these exceptions need no special grant for Developer ID code.
- FFmpeg will then inherit JIT too. That widens FFmpeg's attack surface a little. Either accept it and record it, or re-sign `ffmpeg` and `ffprobe` after Tauri with a no-JIT entitlements file (the workaround path). This is a decision for a human.
- Keep the app entitlements file to the minimum needed. Do not add restricted keys while sidecars exist.

**Verdict: CHANGE.** Add a macOS CI step that, for each file in `Contents/MacOS`, runs `codesign -d --entitlements :-` and fails if any key is outside an allow-list. Also launch each sidecar from the built `.app` (`node --version`, then the `ENGINE_READY` line), because the failure appears only at launch.

## 2. Notarisation fails when an externalBin is present (tauri #11992)

**Symptom.** Apple's log reports status "Invalid", "Archive contains critical validation errors" and "The signature of the binary is invalid" on the nested sidecar (`Contents/MacOS/<sidecar>`). The same app notarises when `externalBin` is removed. Opened 2024-12-17, still open, labelled needs-triage.

**Cause.** Not confirmed. The reporter's local `codesign` run reports the nested sidecar as modified or invalid. The reporter links a similar report in electron/osx-sign (search only).

**Claimed workaround.** Set the signing certificates and keychain to "Always Trust" for codesigning and timestamping; notarisation then passed. This is a local trust setting on one machine. It is not a fix for CI or for end users.

**Impact on us.** The plan's core choice, a real Node binary as `externalBin`, has never been notarised in our repo. This is the highest-risk unknown for macOS.

**Verdict: CHECK.** Before any release work, spike a minimal Tauri app with one `externalBin` (a copy of the official Node binary). Build on a macOS runner with a Developer ID certificate, notarise, staple, then run `spctl -a -vvv -t exec` on the `.app`. Save the notary log for the result. If it fails, the options are: sign nested binaries explicitly before Tauri's own signing, or sign and notarise outside Tauri (section 1's workaround).

The DMG is a related open point. A search snippet (not verified) says Tauri notarises only the `.app`, and projects notarise and staple the DMG as a separate step. The official macOS signing page does not say either way. The spike should notarise and staple the DMG explicitly.

## 3. Stale sidecar and same-version reinstall (tauri #15134)

**Symptom (Windows 11, NSIS, PyInstaller sidecar).** After rebuilding the sidecar (71 MB), `tauri build` shipped the old 188 MB copy. Reinstalling the same version replaced the main exe and left the sidecar unchanged, with no error.

**Cause (reporter's explanation, unconfirmed).** The first build copies the sidecar to `target/release` with the triple stripped, and later builds reuse that copy when no source change is detected. The NSIS installer may skip an unversioned sidecar because it has no version resource.

**Status.** Open, labelled `ai-slop`, no maintainer reply. Treat it as a bug report with a plausible mechanism.

**Verdict: CHANGE.**
- Before `tauri build`, delete the copies in `target/release` and the staged files in `src-tauri/binaries`, then copy in the freshly downloaded, SHA-256 checked sidecars.
- After the build, compare the sidecar hash inside each artifact with the downloaded hash: the `.app` on macOS, the AppImage and deb on Linux, and the NSIS installer's contents on Windows.
- Bump the version on every release tag, and test a same-version reinstall on Windows.

## 4. Target-triple naming (tauri #3355)

**Symptom (2022).** With `--target universal-apple-darwin`, the sidecar file carried the triple in its name and the runtime lookup failed. The maintainer agreed to rename. The fix is commit 3035e45 (2022-02-08, "Remove target triple from sidecar bin paths"). The commit title was seen in search results; the diff was not opened.

**Current behaviour.** Source files in `src-tauri` keep the triple (`<name>-<triple>`, `.exe` on Windows). The installed file is named without it, and runtime lookup uses the plain name (`app.shell().sidecar("node")`). This matches our plan. Tauri's own docs (already in the packaging note) say the source name includes the triple. The installed name is worth one check in the spike.

**Verdict: KEEP.** Keep `binaries/node-<triple>` as the source name. Add a CI check that the staged file list contains the host triple (`rustc --print host-tuple`) for native builds.

## 5. AppImage launcher mode 0770 (tauri #16155)

**Symptom.** An x86_64 AppImage stored `AppRun.wrapped` as `-rwxrwx---`. A second user (for example `firejail --appimage`, or after a root extraction) got "Permission denied". The owner's own runs work because FUSE shows files as owned by the user who mounted them. ARM64 builds were `0755`.

**Cause (reporter's reading of the source, unconfirmed).** The bundler's `write_and_make_executable` sets `0o770` on the downloaded tools, and that mode carries into the AppDir through `fs::copy` in the linuxdeploy handling.

**Status.** Closed "completed" on 2026-09-28. The maintainer said it "should be fixed in 2.12" and linked no commit. Another contributor said they could not verify it. A reporter who read a 2.12.0 AppImage found `AppRun.wrapped` at `0755`, but tested in WSL and a CI runner, not on macOS or bare-metal Linux. The thread also says the development branch still had `0o770` when reported.

**Sidecar relevance.** The bug is about `AppRun`, not sidecars under `usr/bin`. I found no report of a sidecar losing its execute bit in an AppImage or deb. A related updater bug (tauri-apps/plugins-workspace #1608, AppImage update lost the execute bit, closed) is search only.

**Verdict: CHANGE (small).** Pin `@tauri-apps/cli` and the Rust crates to 2.12.x or later. In the Linux CI job, list the AppImage with `unsquashfs -l` and the deb with `dpkg-deb -c`, and fail unless `AppRun` and every sidecar are executable (0755). This check runs on Linux CI and needs no Apple or Windows machine.

## 6. Dev-mode sidecar after rebuild (tauri #4134)

**Symptom (macOS, 2022).** After any change to a PyInstaller sidecar, `tauri dev` failed with signal 9. The binary ran from the terminal and under `tauri build`. Deleting the file and copying it in again fixed it, and so did a reboot.

**Fix.** The maintainer's fix is "delete existing sidecar file" in PR #4167, which closed the issue. The root cause (a macOS cache or a signing issue) is not confirmed.

**Verdict: CHANGE.** Add a dev script (for example `pnpm dev:sidecar`) that removes the old copy, copies the sidecar into `src-tauri/binaries` with the triple, and only then runs `tauri dev`.

Two related points:
- Tauri #15134 says `externalBin` resolves from `src-tauri/`, and that the docs do not say so clearly. In the Rust code, use `sidecar("node")` in both modes and never hardcode a path. Dev and release locations differ (the expected location is next to the built binary in each mode; not verified here).
- Search only: tauri #15849 reports a dependency crate with the same name as a sidecar clobbering the copied binary in `tauri dev`. **Verdict: CHANGE (cheap).** Prefix our sidecar names, for example `dax-node` and `dax-ffmpeg`.

## 7. Sidecar broken inside the AppImage (tauri #5445)

**Symptom (Linux, Tauri 1.1.1, 2022).** A sidecar worked under `tauri dev` but not from the AppImage. The bundled `pkg` sidecar failed with a `SyntaxError` in `pkg/prelude/bootstrap.js`. The reporter found the AppDir copy's checksum differed from other outputs, and saw linuxdeploy rewrite the RPATH (`$ORIGIN/../lib`) on that ELF file.

**Status.** Closed 2022-10-20 as a duplicate of #5189, which I did not open.

**Impact on us.** This is the main risk for the `pkg` fallback. `pkg` appends a payload to its binary, so any later step that rewrites the ELF (RPATH, strip, copy) can break it. Our default (a real Node binary plus a separate bundle file) is less exposed, but the same tooling touches the Node ELF and the FFmpeg ELF.

**Verdict: CHECK.** Smoke test the engine from the built AppImage (extract with `--appimage-extract`, run the bundled `node` against the bundle, check the `ENGINE_READY` line and `/health`) on each target image. Compare the sidecar hash with the downloaded one. This runs on Linux CI.

## 8. `node --build-sea` on macOS x64 (node #65479)

**Symptom.** Executables from `node --build-sea` (Node v26.7.0, official x64 tarball) crash with SIGSEGV before `main`, during dyld static initialisers. Even a one-line hello world crashes. The `--experimental-sea-config` plus postject path runs on the same runtime. Removing the signature does not fix the crash.

**Status.** Open since 2026-08-22, unassigned, no fix linked. Two follow-up reports conflict: one says current nightlies build a working SEA and suspects a commit (causation unproven); the other reproduces on a main build and says SEA on macOS x64 is unsupported.

**Verdict: KEEP.** SEA stays out of the default path. If we ever use SEA, use the postject route only, and test on macOS x64 and arm64 with the signed app.

## 9. Changes after signing (search only)

Several projects report the same failure: a write after signing breaks the seal, and the binary is then killed at launch on Apple Silicon (exit 137). The fix in those reports is to sign as the last step and verify with `codesign --verify --deep --strict`. The cases are Cline #14215, opencode #46313 and Happier #230 (search snippets; not opened).

**Verdict: CHANGE.** Add a rule to the packaging note: nothing modifies a file in `Contents/MacOS` after the signing step, and the release job verifies the signature as its last step.

## 10. Our own SEA snippet is not notarisable

The packaging note's SEA snippet ends with `codesign --sign -`, an ad-hoc signature. An ad-hoc signature is not Developer ID, has no secure timestamp, and fails notarisation (general Apple rule, **unverified here**). The snippet also strips the Node binary's original signature, which carries the hardened-runtime and JIT settings, so the replacement needs its own entitlements.

**Verdict: CHANGE (documentation).** Mark the ad-hoc step as local-test only. Release signing must be Developer ID with the hardened runtime and entitlements, applied by Tauri or by an explicit step (section 2). SEA is not the default, so this does not change the design.

## 11. Defender false positives on pkg binaries (search only)

- vercel/pkg #350: a pkg-built `.exe` quarantined as a virus.
- vercel/pkg #1493: a pkg build flagged as `Trojan:Win32/Sabsik.FL.A!ml`. A commenter said zipping the file avoided detection.
- yao-pkg/pkg #167 "Binary detected as a virus" (2025-07-30) appears only in an issue listing. Its body was not read.

Microsoft's guidance (fetched) is to submit false positives through its file submission page.

**Verdict: CHECK.** The default plan (an unmodified official Node binary plus a JS bundle) is less exposed than a pkg binary, but the risk is not zero. Add to the Windows release checklist: scan the installer and sidecars with Defender before publishing, and submit any false positive. This needs a Windows environment to be meaningful.

## 12. Windows signing: SignPath Foundation (fetched)

The SignPath terms (fetched) say:
- every component must use an OSI-approved licence, and there must be no proprietary components;
- the project must be actively maintained and **already released in the form to be signed**;
- its functionality must be described on the download page;
- the signing team must own and maintain the source repository;
- binaries must be built from source in a verifiable way;
- there is no stated paid tier, and the terms do not restrict eligibility to Windows;
- each release needs manual approval.

**Impact on us.** The repository has no release yet, so the first release must ship unsigned, and SignPath can be applied for after it. Each release then needs a human to approve. The bundled components (Node MIT, esbuild, zod, and the LGPL FFmpeg build) need to be checked as OSI-approved; FFmpeg's LGPL status is very likely fine but was not checked against the page.

**Verdict: CHANGE.** Rewrite the packaging note's "SignPath offers free signing" as: apply after the first release; approval per release; requires a human.

## 13. SmartScreen (Microsoft, fetched)

The Microsoft page (fetched) says Defender SmartScreen checks downloaded files against lists of known-bad programs and of files that are well known and frequently downloaded. A file not on the list gets a warning. Reputation can come from the file's digital signature. The page does not discuss EV certificates. A search snippet says EV certificates lost instant reputation in 2024 (search only, unverified); do not rely on it.

**Verdict: KEEP.** Ship unsigned first, document the SmartScreen warning and how to continue in the release notes. Expect warnings to continue for a while after signing; confirming how long needs a real Windows download test.

## 14. esbuild and `.node` addons (search only)

esbuild fails with "No loader is configured for .node files" (evanw/esbuild #3900). Marking the package external fixes the build but can break the runtime. The `file` and `copy` loaders have had bugs (#4154, #3582). A `require` inside try/catch still breaks the build because esbuild resolves it statically (opennextjs-cloudflare #1226).

The engine has no native addons today (only `zod`, per the packaging note).

**Verdict: KEEP.** Add a CI guard: after the esbuild step, fail if the bundle contains a `require` of a `.node` file, so a future native addon fails loudly instead of at runtime.

## 15. Naming trap: "pkgxdev"

The `pkgxdev` organisation (fetched) hosts pkgx, a package runner with repositories such as `pkgm`, `dev`, `pantry`, `mash` and `brewkit`. It is not the Node.js bundler. The bundler the packaging note means is `@yao-pkg/pkg` (`github.com/yao-pkg/pkg`).

**Verdict: no plan change.** Recorded so no one searches the wrong organisation.

## What needs a real Apple or Windows environment

| Step | Why Linux CI cannot verify it | What is needed |
|---|---|---|
| Developer ID signing of each sidecar, hardened runtime, timestamp | Needs `codesign` and the Apple keychain | macOS runner with a Developer ID certificate in CI secrets (human to provision) |
| Notarisation (`notarytool`) and stapling of `.app` and `.dmg` | Apple's service and tools | macOS runner, App Store Connect API key (human) |
| Gatekeeper assessment (`spctl`) and first launch with the quarantine attribute | macOS only | macOS runner or a Mac |
| Sidecar killed at launch by a restricted entitlement (section 1) | Only shows under AMFI with a signed binary | Signed build run on macOS |
| arm64 versus x64 sidecars, Rosetta behaviour | Needs both CPU types | macOS arm64 and x64 runners |
| Windows Authenticode via SignPath or another certificate | Windows tooling and approval | SignPath project and per-release approval (human) |
| SmartScreen warnings and reputation build-up | Needs Windows and real internet downloads over time | Windows machine; reputation takes time |
| Defender scan and false-positive behaviour (section 11) | Windows Defender | `windows-latest` scan is possible; real-user behaviour is not |
| Same-version NSIS reinstall (section 3) | Windows installer | `windows-latest` CI can test it |
| Process-tree kill with a Job Object (packaging note) | Windows API | `windows-latest` CI test |

**Verifiable on Linux CI, no Apple or Windows needed:** AppImage and deb modes (section 5); the sidecar smoke test from an extracted AppImage (section 7); process-group kill on POSIX; the hash checks (section 3); H.264 playback in WebKitGTK under `xvfb-run` with GStreamer plugins installed.

GitHub-hosted macOS runners can run `codesign` and `notarytool`, so several macOS items can be checked in CI. They still need signing secrets, and AGENTS.md says agents do not touch secrets or CI settings without a human.

## Plan changes, consolidated

1. App entitlements: JIT only, no restricted keys, plus a per-binary entitlements CI check (section 1).
2. Notarisation spike with one nested sidecar before release work (section 2).
3. Clean staging, SHA-256 checks on each artifact, version bump per tag (section 3).
4. Prefix sidecar names (`dax-node`, `dax-ffmpeg`) to avoid collisions (section 6).
5. Dev script that re-copies sidecars (section 6).
6. Pin Tauri to 2.12 or later; assert AppImage and deb modes in Linux CI (section 5).
7. Smoke test the engine from an extracted AppImage on each target image (section 7).
8. SEA snippet: ad hoc is for local tests only (section 10).
9. Sign as the last step and verify after (section 9).
10. Windows release checklist: Defender scan and false-positive submission (section 11).
11. SignPath: first release unsigned; apply after release; approval per release (section 12).
12. CI guard against `.node` requires in the bundle (section 14).

## Open questions

- Does Tauri notarise the DMG, or only the `.app`? The official page is silent.
- Will a per-sidecar entitlements option land? #16211 has no pull request.
- Which entitlements does current Node need? Start with `allow-jit`; test whether `allow-unsigned-executable-memory` is needed in the spike.
- Is the 2.12 fix for #16155 real? The thread is contested.
- Is `node --build-sea` fixed on main for macOS x64 (#65479)? The reports conflict.
- Is yao-pkg #167 a false positive? Not read.
- Does FFmpeg's LGPL licence meet SignPath's OSI rule? Very likely; not checked.

## Local state

`apps/desktop` in this repository is a browser (Vite) build with no `src-tauri` directory, so there is no sidecar or entitlements configuration yet. A worktree under `.claude/worktrees` pins `@tauri-apps/cli` 2.12.3.

## Sources

Fetched:
- https://github.com/tauri-apps/tauri/issues/16211
- https://github.com/tauri-apps/tauri/issues/11992
- https://github.com/tauri-apps/tauri/issues/15134
- https://github.com/tauri-apps/tauri/issues/16155
- https://github.com/tauri-apps/tauri/issues/3355
- https://github.com/tauri-apps/tauri/issues/4134
- https://github.com/tauri-apps/tauri/issues/5445
- https://github.com/nodejs/node/issues/65479
- https://v2.tauri.app/distribute/sign/macos/ (no sidecar or entitlement content on the page)
- https://developer.apple.com/documentation/security/customizing-the-notarization-workflow (title only)
- https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution (title only)
- https://signpath.org/terms
- https://learn.microsoft.com/en-us/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/
- https://github.com/pkgxdev

Search only (not opened):
- https://github.com/tauri-apps/tauri/issues/15849
- https://github.com/tauri-apps/tauri/commit/3035e4581c161ec7f0bd6d9b42e9015cf1dd1d77 (title only)
- https://github.com/tauri-apps/plugins-workspace/issues/1608
- https://github.com/vercel/pkg/issues/350
- https://github.com/vercel/pkg/issues/1493
- https://github.com/yao-pkg/pkg/issues (listing)
- https://github.com/cline/cline/issues/14215
- https://github.com/anomalyco/opencode/issues/46313
- https://github.com/happier-dev/happier/issues/230
- https://github.com/nodejs/node/pull/31459
- https://github.com/evanw/esbuild/issues/3900, /4154, /3582
- https://github.com/opennextjs/opennextjs-cloudflare/issues/1226
- https://github.com/electron/osx-sign/issues/131 (linked from #11992; not opened)
