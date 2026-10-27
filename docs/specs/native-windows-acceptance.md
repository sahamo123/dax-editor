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

Native diagnostic run 40510678442 confirms a responding installed app, engine and WebView2 with an active native window; the environment-only CDP connection still times out. [Microsoft's runtime 150 explanation](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5645) identifies elevated-host filtering of environment debugging switches. The harness therefore runs through an ephemeral current-user Interactive task with `RunLevel Limited`, verifies its token is not administrative, reports its completion and removes the task in `finally`. This reduces test-process privilege without registry/policy or production-code changes. No password, stored credentials or recurring trigger is used. The helper refuses ordinary local invocation; the task exists only on the isolated opt-in CI runner.
