---
type: Guide
title: Continue on another laptop or agent
description: The current continuation branch, fresh Windows setup, private-file transfer boundary, evidence and next tasks for any agent without chat history.
tags: [handoff, agents, windows, setup]
status: stable
generated:
  by: process:scribe
  at: 2026-11-01T08:40:21Z
---

# Continue on another laptop or agent

**November 1 supplement:** the latest full continuation is `codex/impeccable-design-setup`, based on `codex/laptop-agent-handoff` at `2adea8a7d1a3e5a8a37f1713724fb6e24a46387c`. Use that latest branch for UI/UX work; it includes the complete application and [pinned Impeccable setup](impeccable-design.md). The branch/clone example below records the October 31 baseline; substitute `codex/impeccable-design-setup` when cloning the latest continuation. Private-file boundaries and application acceptance gates are unchanged.

## Start here — October 31, 2026

This guide supersedes older branch, readiness and setup instructions in historical checkpoints. No chat history, agent memory, paid provider or particular IDE is required. Read root `AGENTS.md`, this guide, [STATUS](../STATUS.md), the latest [log](../log.md), then the relevant package's `AGENTS.md`, issue and spec. The previous implementation details remain in [handoff](handoff.md).

**Use branch `codex/laptop-agent-handoff`.** It contains the full development tree, not just these docs. Its parent is published `codex/real-video-mcp-acceptance` at `f3a503f436edda4c9e69d364fc845ccaed176105`; that parent's tree is `8fa29c4c3df9cfea76a09f7a5fca268027de0130`, identical to the previous laptop's local `ae3545c`. Commit IDs differ because earlier work was published through the GitHub connector; compare trees before assuming divergence. PRs are stacked and unmerged; **default `main` is older and is not the continuation baseline**. Do not merge or force-push the stack to start development. Tracking: [handoff #66](https://github.com/sahamo123/dax-editor/issues/66), [delivery #8](https://github.com/sahamo123/dax-editor/issues/8), [parent PR #65](https://github.com/sahamo123/dax-editor/pull/65), [last native evidence PR #64](https://github.com/sahamo123/dax-editor/pull/64).

```powershell
git clone --branch codex/laptop-agent-handoff https://github.com/sahamo123/dax-editor.git
Set-Location dax-editor
git status --short
git log -3 --oneline
git switch -c codex/your-next-issue
```

For an existing folder, inspect `git status --short` and preserve changes first; then fetch origin and inspect the continuation branch before switching. Do not reset/clean the folder: ignored files may be the only copy of private media and models. Record the checked-out SHA and test results in the next PR. Once this handoff merges, follow its PR's final branch/base rather than an assumed default.

## Fresh Windows x64 setup

Install Git, Node **22** (`.node-version`), pnpm **10.28.0** (`package.json`) and FFmpeg/ffprobe with drawtext/subtitle support. Native builds also need Rust's MSVC toolchain, Visual Studio C++ Build Tools with Windows SDK, and WebView2. The AI seed preparation needs the C++ release redistributables from those Build Tools (or `DAX_VC_REDIST_DIR`); it discovers them with `vswhere`. Pins, hashes and licences live in `apps/desktop/sidecars.lock.json`, the model/runtime catalogues in `packages/local-llm`, the speech catalogue in `packages/stt`, and `pnpm-lock.yaml` / `apps/desktop/src-tauri/Cargo.lock`.

Use a normal developer PowerShell with these tools on PATH. **Do not dot-source `scripts/Enter-Dev.ps1` on a fresh clone**: it intentionally requires this laptop's ignored `.local-tools/node` and overrides Rust/cache paths. Likewise the root `.cmd` launchers expect that local Node. Use the direct commands below on another laptop. `package.json`/bootstrap permit older Node versions, but the supported continuation baseline is Node 22.

```powershell
corepack enable
corepack prepare pnpm@10.28.0 --activate
node --version
pnpm --version
ffmpeg -version
ffprobe -version
pnpm install --frozen-lockfile
git config core.hooksPath .githooks
$env:DAX_FFMPEG = 'ffmpeg'
$env:DAX_FFPROBE = 'ffprobe'
pnpm check
pnpm --filter @dax/desktop exec playwright install chromium
pnpm --filter @dax/desktop test:e2e
```

Check native-program exit codes after each step; do not continue after a failed install/build. `pnpm bootstrap` is the Bash alternative for tool checks/install/hooks; it does not download system tools. Windows symlink/developer permissions may be needed by pnpm or dev sidecars; diagnose the actual error without disabling assertions or security policy. Model downloads are separate opt-in steps; default tests do not call providers or download models.

## Build and start the actual editor

After the toolchain and checks above, prepare the Windows offline distribution resources:

```powershell
pnpm build
node apps/desktop/scripts/prepare-offline-ai.mjs
node apps/desktop/scripts/prepare-offline-speech.mjs
node apps/desktop/scripts/prepare-sidecars.mjs --release --target x86_64-pc-windows-msvc
node scripts/dev-preview.mjs --system-ffmpeg --smoke
node scripts/dev-preview.mjs --system-ffmpeg
```

Preparation downloads large verified assets; network and disk space are required initially. The final command stays running: open `http://127.0.0.1:4175/`, keep its console open, Ctrl+C to stop. The plain root discovers the current engine session; never copy its token-bearing redirect URL into docs/config. The explicit system-FFmpeg option is for development only; shipped binaries keep the verified LGPL renderer. Omit it only when testing the bundled renderer on a machine allowed to execute it. Rebuild resources after source changes; the preview runs bundled resources, not an automatically refreshed engine source tree.

For an actual native installer, use the same prepared resources and global toolchain:

```powershell
pnpm --filter @dax/desktop exec tauri build --ci --bundles nsis
```

The installer is under `apps/desktop/src-tauri/target/release/bundle/nsis/` unless `CARGO_TARGET_DIR` overrides it. `scripts/Build-Windows.ps1` is this laptop's wrapper; it requires its local environment. The new laptop has not been tested by this handoff. Native install/playback/dialog/export/restart acceptance must be repeated there. Application Control event 3077 blocks unsigned native/renderer execution on the old laptop; administrator access alone did not solve it. Use a policy-authorized machine or trusted signing workflow; do not weaken Windows security or process-ownership checks.

## Connect an external agent to the visible project

Start the editor, then use its MCP connection helpers. For a client supporting stdio MCP, the underlying configuration is:

```json
{
  "mcpServers": {
    "dax-editor": {
      "command": "C:/absolute/path/to/node.exe",
      "args": [
        "C:/absolute/path/to/dax-editor/packages/mcp/dist/editor-proxy.js",
        "--data-dir", "C:/absolute/path/to/dax-editor/.dax-data",
        "--plan"
      ]
    }
  }
}
```

Replace all paths; the Node executable must exist on that machine. `--plan` is enforced read-only. Remove it for an explicitly editable connection. The proxy discovers the running engine's private `live-mcp.json`; never copy that discovery file/token to GitHub or another machine. Use the **live proxy**, not a standalone MCP instance opening the same project file independently. Inspect project/revision, submit bounded edits, poll job status, then check actual timeline/undo/export. Transport tests do not prove an assistant session. Antigravity can work on the repo using the prompt below; its live MCP support/configuration must be verified in that client, not inferred from Claude/Codex examples. External account sign-ins remain machine-local.

## What transfers through GitHub

| Committed and reproducible | Ignored/private; absent after clone |
|---|---|
| Application source, lockfiles, tests, preparation scripts, licences/pins, ADRs/specs | `node_modules/`, `.local-tools/`, generated dist/sidecars/resources/targets |
| Acceptance summaries and public CI run links in STATUS | `artifacts/`: raw logs, screenshots, video exports and local source/history backups |
| MCP proxy and token-free configuration helpers | `.dax-data/`: projects, uploads, task data, models, settings/secrets and discovery tokens |
| Project lifecycle/relink code | `*.dax.json` projects and original media: often absolute path references |

Source development needs only the clone and reinstallation. To continue the same editing projects, stop the old editor, privately copy the chosen `.dax.json` files **and their referenced media** to the other laptop, open the copies and relink missing media. Check duration, timeline, overlays, audio and export after relinking. A project JSON alone is not a portable bundle. Reconfigure provider secrets locally; do not transfer credential stores/live discovery files or commit raw data directories. Regenerate model/runtime caches from the pinned scripts instead of copying stale executables blindly. Keep originals until verification succeeds.

Local creative work is separate from application development: `artifacts/workshop-ad-variations/` holds three 30-second 1080x1920 music-only ads, editable projects in `a/`, `b/`, `c/`, photo credits, scripts and `validation.json`; `instagram-facebook-ads.zip` contains upload MP4s/credits, not portable project media. They used a full opening question on one screen, construction/remodeling stock photos, large text, original 128 BPM music, no narration/top logo, and an offer of AI skills/eight prompts/replay. Their **October 28, 12 noon Pacific event is now past**; obtain a new event brief before reuse. None of these private files is claimed to exist in a fresh GitHub clone or to have been published as ads. `artifacts/real-video-mcp/` holds the earlier private footage test; do not publish its source or identifying details.

## Evidence and next tasks

**October 31 source checkpoint:** full `pnpm check` passes in the normal Windows host: 1,799 package +17 root tests, with 67 explicit platform/opt-in package skips. Docs indexes/OKF, 37 local handoff links and whitespace checks pass. Local log: `artifacts/laptop-handoff-check-authorized.log` (ignored). The initial restricted run hit a symlink-fixture EPERM and was stopped; the normal-host rerun passes that fixture without changing assertions or machine policy. [Handoff PR #67](https://github.com/sahamo123/dax-editor/pull/67) publishes the continuation.

Last runtime/browser/native acceptance remains **October 27**: 39 browser workflows; real offline AI edits/export/restart/cleanup (17–96 s requests), longer synthetic speech, real MCP SDK/live-proxy edits and Linux Blender templates passed. Native installed workflow passed [40532196608](https://github.com/sahamo123/dax-editor/actions/runs/40532196608) using candidate [40528351026](https://github.com/sahamo123/dax-editor/actions/runs/40528351026). Read STATUS for source/artifact hashes and scope. CI artifacts may expire; rebuild pinned source if absent. No current installer transfer or execution on the new laptop is established. Local raw evidence is not promised on GitHub. Rerun checks before changing code.

Continue the release tasks in this order; do not rebuild already implemented features from historical TODOs:

1. [T09 #17](https://github.com/sahamo123/dax-editor/issues/17): verify setup, native install and editing/export/restart on the new machine; then cross-version upgrades, display scaling and whole-app peak memory. Preserve existing projects during upgrade/uninstall.
2. [T07 #15](https://github.com/sahamo123/dax-editor/issues/15): actual assistant-driven live-project session per client; Planning refusal, queue/non-cancelling steer, cancellation, conflict/undo and export. SDK acceptance already passed; client inference remains separate.
3. [T03 #11](https://github.com/sahamo123/dax-editor/issues/11): real hosted edits with locally configured optional credentials. Independent named profiles exist; hosted paths remain mock-tested until live evidence.
4. [T06 #14](https://github.com/sahamo123/dax-editor/issues/14), [T04 #12](https://github.com/sahamo123/dax-editor/issues/12), [T05 #13](https://github.com/sahamo123/dax-editor/issues/13): human-recorded/hours-long speech, missing-media recovery, broader owner-footage and accessibility/scaling walkthroughs.
5. [T08 #16](https://github.com/sahamo123/dax-editor/issues/16): optional Windows Blender template rendering; Linux evidence exists. Experimental macOS failures remain [#39](https://github.com/sahamo123/dax-editor/issues/39). Subject masking/text-behind-a-person, full multitrack and arbitrary Blender/Remotion workflows are not implemented release features.

The shared command/session/task/history engine is authoritative for manual, chat and MCP edits. Planning cannot mutate. Steering continues active work at the next model boundary; Stop cancels. Local AI remains optional for manual editing; keep the tested 2B llama.cpp bundle, not the rejected 0.8B trial. LM Studio is an optional external endpoint, not the packaged runtime. No paid provider is mandatory; Remotion is excluded by repository licensing policy.

The accepted product contract is [functional desktop release](../specs/functional-desktop-release.md); architecture and licensing decisions are under [ADRs](../adr/index.md). Opt-in checks after resources are prepared: `pnpm test:offline`, `pnpm test:speech:acceptance`, `pnpm --filter @dax/desktop shell:test` and `pnpm eval --adapter oracle`. Offline/native checks execute packaged binaries and need an authorized machine; a browser pass cannot substitute for them. Run only the suite relevant to the next issue, and keep credentials out of test fixtures.

## Paste into any agent, including Antigravity

Optional UI/UX guidance added after this baseline: [Impeccable setup and project brief](impeccable-design.md), branch `codex/impeccable-design-setup`, issue #68. Reinstall the pinned skill on a new laptop; ignored copies are not included in a clone. Follow the manual-context restriction in root AGENTS.md.

> Continue dax-editor from branch codex/laptop-agent-handoff (or its reviewed successor). Read AGENTS.md, docs/engineering/laptop-continuation.md, docs/STATUS.md and the latest docs/log.md before editing. Inspect Git status and relevant package instructions. Report the actual commit, implemented features, open acceptance gates and first issue to tackle; do not infer readiness from old checkpoints or chat history. Follow the fresh-machine setup, run pnpm check and relevant browser/native checks, then work on one GitHub issue per branch/PR. Preserve private project/media data, use the live MCP proxy for the running editor, and never expose credentials or weaken security policy. Update STATUS/log/concepts/indexes and leave a pushed, reviewable handoff. Do not merge your own PR.
