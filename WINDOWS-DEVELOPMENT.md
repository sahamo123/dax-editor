# Develop Dax Editor on this laptop

The browser preview now supports choosing/dropping video files and chat video attachments. Selected bytes are copied into local `.dax-data/uploads/` (1 GiB per file). Use the chat Mode selector for Planning (read-only) or Edit. Send queues requests while work runs; Steer task continues the active conversation with new guidance at the next model step, without cancelling current work. Attachment/mode changes continue after the active run. Stop remains explicit cancellation. Expand Tasks for statuses, queue positions and cancellation. Task metadata is saved locally; engine restart marks unfinished work interrupted. Planning attachments stay off the timeline until a new Edit request imports them. Non-video attachments are not supported yet. The native installer has not been rebuilt for these latest preview features.

Current delivery status: **development preview works; native release NOT READY**. `pnpm check` and all 32 browser workflows pass. The unsigned native executable remains blocked by Windows Application Control event 3077; registry state reports Smart App Control enforcement. This is a personal laptop with administrator access, which alone does not override that protection. See [Microsoft's Smart App Control overview](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview). No Windows security settings were changed.

- [Implementation plan](docs/engineering/windows-desktop-plan.md)
- [Task tracker](DEVELOPMENT-TASKS.md)
- [Current project status](docs/STATUS.md)

## Files already here

The checkout contains source/history and lockfiles. `artifacts/dax-editor-source-82f1d24.zip` preserves the starting source. `.local-tools` contains the local Node 22 executable, pnpm 10.28.0 and store, Rust toolchain/Cargo cache, C++ Build Tools, test Chromium and temporary files. Some Windows SDK and installer components necessarily live in Windows system locations.

`apps/desktop/src-tauri/resources/local-ai` contains verified Qwen 3.5 2B weights, a pinned Windows CPU llama.cpp archive, licence/provenance records and app-local C++ runtime DLLs. Node and LGPL FFmpeg/ffprobe are prepared under `apps/desktop/src-tauri/binaries`. These large generated files are ignored, not Git source.

## Developer shell and checks

In PowerShell, from this folder:

```powershell
. .\scripts\Enter-Dev.ps1
pnpm --version
node --version
pnpm install --frozen-lockfile --store-dir .local-tools/pnpm-store
pnpm check
```

The environment script changes only that shell. It selects local runtimes, writable temp folders and caches. `pnpm check` bounds package/test concurrency to avoid overloading the laptop; assertions and platform-specific skips remain explicit.

## Build

For a working development preview while native launch is blocked, double-click `Start Development Preview.cmd` (or run `pnpm dev:preview` after entering the local toolchain environment). This opens the same editor in the default browser with the packaged engine and offline AI. It binds to loopback only on port 4175; projects and model data persist in the ignored `.dax-data/` folder. Keep its console open and press Ctrl+C to shut down. The launcher uses Windows' built-in `explorer.exe` to open the browser; no new dependency is required. Browser imports use typed local file paths, and native dialogs/drag-and-drop still need separate validation.

Opening the plain preview address automatically supplies the current engine connection, including in a fresh browser tab or after restarting the launcher. The loopback-only launcher redirects the root page using the existing session-token URL mechanism; the redirect is not cached. Keep the launcher running while editing.

`node scripts/dev-preview.mjs --smoke` verifies the plain-link redirect, frontend, authenticated engine and running local model, then shuts down without opening a browser. This is an explicit real-model check; default tests do not download or start models.

```powershell
.\scripts\Build-Windows.ps1 -Installer
# Optional optimized build after the developer build is verified:
.\scripts\Build-Windows.ps1 -Release -Installer
```

This builds source, verifies/downloads pinned model/runtime bytes, prepares resources and builds a native executable/NSIS installer. The first run requires internet at build time. The finished offline installer is intended to carry its AI model and Windows prerequisites. It does not include Rust or developer tools, which users do not need.

The default is a developer build, explicitly unsigned. Model generation uses the catalogued Qwen model and llama.cpp; it does not require Meta Llama weights, LM Studio, an account or an API key. Model quality and speed remain limited by the CPU and chosen small model.

## Verification evidence

- `artifacts/desktop-final-e2e.log`: 4 passed, including startup with frozen Object.prototype and the real engine workflow.
- `artifacts/offline-live-smoke.log`: real local model, actual title edit through commands, playable export, restart persistence and inference cleanup, with external fetches blocked.
- `artifacts/offline-smoke-1792517191814/result.json`: structured result and generated output path.
- `artifacts/windows-path-tests.log`: Windows verbatim-path normalization regression.
- `artifacts/runtime-lifecycle-tests.log`: deterministic process-crash and lifecycle tests.
- `artifacts/check-windows-verified.log`: full required check passed with exit 0.
- `artifacts/blur-render-regression.log`: 220 fitting/template tests pass with the shipped LGPL FFmpeg's Gaussian blur.
- `artifacts/windows-path-safety.log`: 6 path containment/export safety tests pass with Windows junction aliases.

The full Windows check now passes (`artifacts/check-windows-verified.log`) and all 32 browser workflows pass (`artifacts/desktop-all-e2e-verified.log`). The real-model development preview smoke also passes (`artifacts/development-preview-smoke.log`). No signing certificate is available, so native launch and installation validation remain blocked by Smart App Control.

The opt-in real-model test is `pnpm test:offline`; it uses generated footage and a fresh local data directory. It can take several minutes on the CPU. Default unit tests never download models.

After signing/authorization, `Start Dax Editor.cmd` opens the built app using its bundled engine. Native file dialogs, drag/drop, playback and installed-app shutdown still need validation; browser/API evidence does not replace those checks. Speech runtime installation controls and full-roadmap features remain unfinished.
