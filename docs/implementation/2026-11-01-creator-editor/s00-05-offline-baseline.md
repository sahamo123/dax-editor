---
type: Guide
title: S00.05 fresh offline editing baseline receipt
description: Fresh browser and isolated manual editing evidence, export decoding, errors and native acceptance boundaries.
tags: [implementation, baseline, browser, offline, evidence]
status: draft
generated:
  by: process:implementer
  at: 2026-11-01T12:55:00Z
---

# S00.05 fresh offline baseline

**State: IN_PROGRESS.** [Issue #129](https://github.com/sahamo123/dax-editor/issues/129). Before entry, [issue #127](https://github.com/sahamo123/dax-editor/issues/127), [PR #128](https://github.com/sahamo123/dax-editor/pull/128), tested head `90e5cc604f64ac189d879dcd1db15541f3fe9668` and clean source ancestry were rechecked. Previous step reviews were self-reviews; independent stage review remains required.

## Browser suite

On November 1, 2026, `pnpm --filter @dax/desktop test:e2e` passed **39 browser tests**, with the opt-in performance and offline walkthrough tests skipped in the default suite. The final run used Edge 156 on Windows and explicit system FFmpeg/ffprobe; its engine and media fixtures were isolated. Screenshots and logs are under the unique ignored `artifacts/s00-05-browser-final-cf2fcb063f3f422293c369c8374eae88/` run directory. The new opt-in offline walkthrough ran separately below. Browser success does not verify the packaged renderer or native WebView2.

## Separate manual walkthrough

An opt-in Playwright walkthrough created a fresh temporary engine and generated six-second source video. No assistant/provider was configured; browser requests to non-loopback hosts were blocked. OS-level networking was not disabled, so this is not a network-disconnected-system claim. It verified empty and invalid-media states, imported the video through the UI, added a title manually, applied two reversible operations as one manual-origin batch, verified one Undo reverted the batch while retaining the title, and verified Redo restored it. It saved a browser project copy, created a separate project and reopened the saved copy.

The review command's returned revision matched the active project revision and the review video loaded without changing that revision. The UI export produced a 6.0-second 640×360 video with audio; ffprobe inspected the streams and FFmpeg decoded the complete output. Six private screenshots capture empty, error, import, edit, review and export states.

Final strict-decode run: `artifacts/s00-05-offline-8b6fcee155f34a55959d16792523266e/`. Result JSON SHA-256 `d9c61d26f2650762fe9b975065b0f1f1cfedfb7cbef2987363250ab679fbdf1c`; source video `6705dc7eebdd6cbb7b5233f618d9f724829dd65c5d590a8ef9fe334be440650c`; project copy `6e124eb46b74a6271c4c1c06db0a6b1b158930c551c85113db59e5a263cd3f79`; exported video `30eca0a9b69af32c422456ee7b52c2c89464f435357c5bebcc94e7b4152a5439`. The decoder used `-xerror` and explicitly mapped both streams. The project copy references the now-closed temporary engine's media paths; relink it to the preserved synthetic source before reopening outside that session. Hashes are evidence of these specific artifacts, not a portability claim.

The first attempt was stopped when the test assumed a closed side panel at a wide viewport. The second timed out because an open Project menu intercepted the review click. A third run at 1024×700 with the menu closed passed; a fourth repeated it with strict audio/video decoding. Earlier artifacts remain private. The invalid-video toast showed a verbose raw ffprobe error and local paths; this separate UX defect is tracked in [issue #130](https://github.com/sahamo123/dax-editor/issues/130).

Visual review also found that the empty-chat card implies Codex and Gemini CLI chat backends are supported even though the bridge reports them unavailable. This is distinct from external MCP client configuration and is tracked in [issue #131](https://github.com/sahamo123/dax-editor/issues/131). No actual external assistant inference was tested in this walkthrough.

The opt-in test can be repeated with `DAX_OFFLINE_BASELINE=1`, `DAX_OFFLINE_RESULT_DIR` and `SHOTS_DIR` set to new private directories, system media tools explicitly selected, and `PW_CHROMIUM` set if needed, followed by `pnpm --filter @dax/desktop test:offline-baseline`. It refuses to reuse output files. Port 4173 must be free; the dedicated configuration does not reuse an existing server. Do not put tokens, recordings or screenshots in Git.

## Remaining checks and native boundary

The fresh normal-host `pnpm check` passed with system FFmpeg/ffprobe: 1,801 package tests and 17 script tests passed; 68 package tests were skipped. One earlier attempt was stopped before completion to strengthen the export decoder; it was not counted as a pass. Run final docs/whitespace checks, then review and publish the step receipt and tested PR before S00.06. Packaged FFmpeg returned `spawn UNKNOWN` on this laptop; no system-FFmpeg or Edge run resolves that. Prior native installer evidence remains tied to its original source and host in [STATUS](../../STATUS.md); no current owner-laptop native or clean-install acceptance is claimed.
