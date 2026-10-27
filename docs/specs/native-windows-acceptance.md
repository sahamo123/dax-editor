---
type: Spec
title: Native Windows candidate acceptance
description: "Validate the installed candidate on an isolated Windows runner without changing the owner's application-control policy."
tags: [desktop, windows, testing]
status: draft
generated:
  by: process:implementer
  at: 2026-10-27T00:00:00Z
---

# Native Windows candidate acceptance

The owner's laptop blocks unsigned executables. A successful build is insufficient, so exercise the exact current installer on an isolated Windows runner with an appropriate execution policy. The workflow reads a fixed successful candidate artifact; it does not sign, publish or change security policy. It uses existing locked Playwright dependencies and immutable-pinned official artifact actions, with contents/actions read only.

The CLI test is gated to GitHub Actions. It silently installs into RUNNER_TEMP, launches the actual installed Tauri executable, and attaches to its WebView2 using the [official Playwright method](https://playwright.dev/docs/webview2). CDP is restricted to loopback and enabled only in that test child's environment, never in the production app or registry. Child environments exclude CI credentials. Generated footage stays in an isolated home-directory test folder, within the app's normal allowed roots.

Acceptance covers native startup, bundled renderer import/proxy, manual title/undo/redo, complete-effects review playback, MP4 export, saved project, graceful window-close/engine shutdown, same-version reinstall/reopen and project preservation after uninstall. Only generated screenshots and a non-secret result record are uploaded.

Native open/save dialogs, cross-version upgrades, signing, the owner's laptop policy and actual hosted/client connections remain separate checks. A same-version reinstall must not be labelled as a cross-version upgrade. CI success cannot establish that the owner's laptop permits the executable.

Native diagnostic run 40510678442 confirms a responding installed app, engine and WebView2 with an active native window; the environment-only CDP connection still times out. [Microsoft's runtime 150 explanation](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5645) identifies elevated-host filtering of environment debugging switches. A Limited scheduled-task trial still received an admin token and correctly refused to run. The harness now uses Windows' built-in `runas /trustlevel:0x20000` [Basic User launch](https://devblogs.microsoft.com/premier-developer/how-to-force-vista-to-not-elevate-an-application/), retaining its non-admin token assertion and completion timeout. There are no scheduled tasks, new accounts, passwords, stored credentials or registry/policy/production-code changes. The helper refuses ordinary local invocation.

The Basic User token can retain High integrity. The CI worker lowers only its own token's mandatory integrity label to Medium before creating child processes, using fixed Windows APIs; the non-admin assertion remains mandatory. Separate native stdout/stderr files avoid Windows PowerShell treating diagnostic stderr as a terminating pipeline error before the JavaScript harness can preserve its result. These are test-host changes, not application permissions or security-policy changes.
