---
type: Guide
title: Desktop release guide (signing, notarization, updater)
description: What a maintainer must do once to ship signed desktop installers, what users see without signing, and how the release workflow, sidecars and the Tauri updater fit together.
tags: [maintainers, desktop, release, signing, tauri, ffmpeg]
status: draft
generated:
  by: process:implementer
  at: 2026-10-18T20:15:00Z
---

# Desktop release guide

Everything here was written against Tauri 2.12 and checked against the Tauri documentation, but **only the Linux build has been run**. macOS and Windows installers, code signing, notarization and the updater have never been executed. Treat the first release on each OS as a test and expect small fixes.

## How a release is built

1. Push a tag `desktop-vX.Y.Z` (or run **Desktop release** manually from the Actions tab). The workflow is `.github/workflows/desktop-release.yml`; it builds macOS (Apple Silicon and Intel), Linux x64 and Windows x64.
2. Each job installs dependencies, builds `@dax/server`, runs `apps/desktop/scripts/prepare-sidecars.mjs --release`, then runs `tauri-action`. A tag run creates a **draft** release with the installers; a manual run only keeps workflow artifacts.
3. `prepare-sidecars.mjs` downloads the pinned Node runtime and FFmpeg (checksums in `apps/desktop/sidecars.lock.json`), verifies them, proves FFmpeg is LGPL-only, and bundles the server into one file. See [ADR 0009](/adr/0009-desktop-sidecar-packaging.md) for the reasoning and `apps/desktop/src-tauri/AGENTS.md` for the contract with the server.
4. Review the draft release, add the changelog, test the installers on real machines, then publish.

The version number comes from `apps/desktop/package.json` (`tauri.conf.json` reads it). Bump it before tagging.

## Where each FFmpeg comes from (all LGPL, never committed)

| OS | Source | How it is verified |
|---|---|---|
| Linux x64/arm64 | BtbN/FFmpeg-Builds static `lgpl` build, pinned to a dated release tag | SHA-256 in `sidecars.lock.json` (copied from the release's `checksums.sha256`) plus the flag scan |
| Windows x64/arm64 | BtbN/FFmpeg-Builds static `lgpl` build, same tag | same |
| macOS arm64/x64 | Built in CI from `ffmpeg.org/releases/ffmpeg-<ver>.tar.xz` by `scripts/build-ffmpeg-lgpl.sh` (VideoToolbox, no GPL) | Source SHA-256 pinned in the script (also checked against the FFmpeg release signing key `FCF9 86EA 15E6 E293 A564 4F10 B432 2F04 D676 58D8`), plus the flag scan |

To upgrade FFmpeg or Node: change the version/tag and the hashes in `sidecars.lock.json` (and the version/hash in `build-ffmpeg-lgpl.sh` for macOS), run `pnpm --filter @dax/desktop shell:test`, then a manual workflow run. Never point the lock file at a `gpl` build; the test suite and the build both reject it.

BtbN's build is a third party's binary: prefer replacing it with our own minimal LGPL build (see the ADR follow-up). Shipping FFmpeg obliges us to ship its licence text and say where the source is; the app does both (`licenses/`). If you modify FFmpeg, you must publish your changes.

## macOS: one-time steps

You need a paid **Apple Developer Program** membership (about 99 USD per year). Without it you cannot notarize, and every user will see Gatekeeper warnings.

1. In Apple Developer, Certificates, create a **Developer ID Application** certificate (not "Apple Distribution"). Export it from Keychain Access as `.p12` with a password.
2. Base64-encode the file (`base64 -i cert.p12`) and add repository secrets:
   - `APPLE_CERTIFICATE` (the base64 text), `APPLE_CERTIFICATE_PASSWORD`
   - `APPLE_SIGNING_IDENTITY` (for example `Developer ID Application: Your Name (TEAMID)`; list with `security find-identity -v -p codesigning`)
3. Notarization, one of:
   - Apple ID: `APPLE_ID`, `APPLE_PASSWORD` (an **app-specific password** from appleid.apple.com), `APPLE_TEAM_ID`; or
   - App Store Connect API key: `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_PATH` (needs an extra workflow step that writes the key file; not wired yet).
4. The workflow already passes the first set to `tauri-action`. Tauri signs the app **and every `externalBin` sidecar** (`dax-node`, `dax-ffmpeg`, `dax-ffprobe`) with the hardened runtime and `src-tauri/entitlements.plist`, then notarizes and staples.
5. **Verify on a clean Mac** (not the build machine): download the `.dmg` from the draft release in a browser, open it, and confirm there is no warning; run `spctl -a -vv /Applications/Dax\ Editor.app` and `codesign --verify --deep --strict -vv` on the app. Then start a project and make sure the server starts: the bundled Node needs the `allow-jit` and `allow-unsigned-executable-memory` entitlements and crashes at launch without them (this is the most likely first-release failure; if it happens, check `Console.app` for a `codesign`/`SIGKILL (Code Signature Invalid)` message and that the sidecars carry the entitlements: `codesign -d --entitlements - <path to dax-node>`).

**Unsigned experience** (no secrets set): the config uses ad-hoc signing (`signingIdentity: "-"`), which Apple Silicon requires to run at all. Downloaded apps are quarantined; the first launch shows "cannot be opened because Apple cannot check it for malicious software" (or "is damaged"). Users must open **System Settings, Privacy & Security** and click **Open Anyway**; on older macOS, control-click and Open works. Advanced users can run `xattr -dr com.apple.quarantine "/Applications/Dax Editor.app"`. Document this in the README until you have a certificate. The app works normally afterwards.

## Windows: signing options

Unsigned installers work but show **Microsoft Defender SmartScreen**: "Windows protected your PC". Users click **More info, Run anyway**. Signing removes this for browser downloads once reputation exists; since 2024 EV certificates no longer give instant reputation, so even signed new releases may warn for a while. Sign every release with the same certificate to build reputation.

Options, cheapest first (check current prices and eligibility; none has been tried here):

1. **SignPath Foundation**: free code signing for qualifying open-source projects, integrates with GitHub Actions. Apply; approval is not guaranteed and requires a public repository and a build that runs on GitHub.
2. **Azure Artifact Signing** (formerly Azure Trusted Signing / Azure Code Signing): low monthly fee, certificates held by Azure, needs identity validation. Configure `bundle.windows.signCommand` with `artifact-signing-cli` and the secrets `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID` (see the Tauri Windows signing guide).
3. **A commercial OV/EV certificate**: since June 2023 the private key must live on a hardware token or a cloud HSM, so use the vendor's cloud-signing service with `bundle.windows.signCommand`; the older PFX-in-secrets recipe in the Tauri docs only applies to certificates issued before June 2023.

After choosing, add the secrets, set `signCommand` (or the certificate keys) in `tauri.conf.json`, and re-run the workflow. Verify with `signtool verify /pa /v "Dax Editor_x64-setup.exe"` and by downloading the file in a browser on a clean Windows VM. The NSIS installer installs per user (no admin rights); WebView2 is bootstrapped from Microsoft if missing.

## Linux

`.deb` and `.rpm` recommend the GStreamer plugin packages the web view needs for H.264/AAC; without `gst-libav` or equivalent, MP4 playback can fail on some distros. The AppImage bundles the media framework (`bundleMediaFramework`) and is the safest download for unknown distros. Packages are not signed; add GPG signing if you publish an apt/rpm repository.

## Updater (not enabled yet)

Do this after the first signed releases work:

1. `pnpm --filter @dax/desktop exec tauri signer generate -w ~/.tauri/dax-editor.key`; keep the private key and its password in a password manager. **Losing it means existing installs can never be updated.** Add them as secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` and pass them to `tauri-action`.
2. Add `tauri-plugin-updater` (Rust and JS), set `bundle.createUpdaterArtifacts: true`, `plugins.updater.pubkey` (the key text) and `plugins.updater.endpoints` (for example `https://github.com/<org>/dax-editor/releases/latest/download/latest.json`; `tauri-action` can generate `latest.json`).
3. Grant `updater:default` in `capabilities/main.json` and add an "Update available" prompt in the UI. Keep it opt-in; the project promises no required network service.
4. macOS and Windows updates need signed builds to be trusted by the OS; the updater signature is separate and always required.

## One-time repository decisions

- Replace the app identifier `org.daxeditor.desktop` (`tauri.conf.json`) with one under a domain or GitHub namespace you control **before the first public release**; it names the app-data folder and the updater identity.
- Replace the placeholder icon (`apps/desktop/src-tauri/icon-source.png`, then `pnpm --filter @dax/desktop exec tauri icon src-tauri/icon-source.png -o src-tauri/icons`, and delete the mobile folders and Windows Store logos it generates).
- Linux ARM, macOS universal binaries and Windows ARM are not built; add matrix rows once someone can test them (`sidecars.lock.json` already pins ARM Linux and Windows builds).
