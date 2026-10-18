---
type: Research
title: Plugin architecture for dax-editor
description: Recommends separate-process plugins that speak JSON-RPC over stdio, described by a plugin.json manifest with declared permissions, hashed downloads and data-only template packs, based on how other extensible tools handle trust.
tags: [research, plugins, architecture, security, supply-chain, mcp]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T19:14:51Z
---

# Research: plugin architecture for dax-editor

Written 2026-10-18. This is Topic A of the plugin and intake research. The companion file is [open-source radar and intake policy](/research/open-source-radar.md), which holds the licence policy that gates every plugin.

Sources are listed at the end. Each is marked **(fetched)** when the page was read, or **(search result)** when only a search snippet was seen. Claims with no source, or only background knowledge, are marked **(unverified)**.

## 1. Recommendation

Build plugins as **separate OS processes that speak JSON-RPC 2.0 over stdio**, each described by a **`plugin.json` manifest** that the host validates before anything runs.

Five rules follow from that:

1. **No plugin code runs in the UI process.** Plugins start with `spawn` and an argument array, never through a shell. VS Code uses the same idea with its extension host, and it keeps slow extension code away from the UI.
2. **Declare everything; enforce what can be enforced.** Capabilities, binaries, downloads, network hosts, file paths, memory and time limits are declared. The host enforces timeouts, memory ceilings, path checks and env scrubbing from v1. OS-level sandboxing comes later (see section 3).
3. **No install-time or runtime code fetching.** No npm lifecycle scripts, no pip source builds, no `pip install` at runtime. This is the ComfyUI lesson (section 2). Artifacts are pinned by version and SHA-256, and the host refuses bytes that do not match.
4. **Agents reach plugins through typed tools, never through a shell.** Each declared method becomes an MCP tool with a JSON Schema input. Outputs become artifacts inside a draft session, so [ADR 0006](/adr/0006-draft-approve-for-external-agents.md) still applies. Irreversible actions are not plugin tools.
5. **Two package kinds.** `executable` plugins have an `entry`. `data` packs (template-pack, skill-pack) have none, and they cannot declare binaries or network access. The host rejects a manifest that mixes the two.

Why not load plugins in-process like Obsidian, Jellyfin or Blender add-ons? Those models suit trusted code. Most video tools we would wrap are someone else's Python, C++ or Node packages, so we treat them as untrusted by default.

## 2. What other ecosystems do, and what went wrong

| System | How it is structured (source) | Lesson for dax-editor |
|---|---|---|
| VS Code | `package.json` declares `activationEvents`, `contributes`, `extensionKind`; extensions run in an extension host and activate lazily on events (fetched: [manifest](https://code.visualstudio.com/api/references/extension-manifest), [extension host](https://code.visualstudio.com/api/advanced-topics/extension-host)). | Copy lazy activation and declare contributions up front, so the host knows what exists without running code. The extension host docs say nothing about sandboxing, so do not assume it is a security boundary. |
| Obsidian | `manifest.json` with `id`, `version`, `minAppVersion`, `isDesktopOnly` (fetched: [manifest](https://docs.obsidian.md/Reference/Manifest)). The page does not describe permissions or sandboxing. | Simple, but plugins get full Node or Electron access. `isDesktopOnly` is the only capability hint. We do the opposite. |
| Blender extensions | `blender_manifest.toml` with a `license` field. Translated manual pages list optional `permissions` such as `files`, `network`, `clipboard` (search result: [getting started, zh-hans](https://docs.blender.org/manual/zh-hans/dev/advanced/extensions/getting_started.html)). Enforcement was not found. | Declared permissions are right; declared-but-unenforced permissions are not enough. Blender runs add-ons in-process, so GPL add-ons must stay separate programs for us. |
| Tauri v2 | Plugins are crates with `permissions/` files. Commands are blocked from the frontend by default. Capability files grant them per window. Scopes restrict arguments (fetched: [plugins](https://v2.tauri.app/develop/plugins/)). | Best model for the permission vocabulary: default deny, explicit grant, scoped arguments. Copy the idea. |
| Home Assistant | `manifest.json` with `domain`, `codeowners`, `iot_class`, `requirements`, `quality_scale`. Requirements must be pinned to exact versions (fetched: [manifest](https://contributors.home-assistant.io/core/integrations/manifest/)). | Copy exact pinning and quality tiers. Integrations run in-process Python, which we avoid. |
| Jellyfin | Plugins come from catalog repositories added by manifest URL, then load into the server. The docs page has no trust warning (fetched: [plugins](https://jellyfin.org/docs/general/server/plugins/)). | A repository of manifests is good for discovery. Adding any URL with no review is the risk. |
| ComfyUI custom nodes | Arbitrary Python in a folder. A manager installs them from a registry, and requirements install at runtime. Search results report a Manager CVE (CVE-2025-67303, fixed in 3.38), a cryptomining botnet that used the Manager flaw to install a node, and a backdoored fork that impersonated a legitimate node (search results, **secondary sources, unverified**). Comfy's January 2025 security update says custom nodes should not install packages at runtime (search result: [blog](https://blog.comfy.org/p/comfyui-2025-jan-security-update)). | The worst case, and the model to avoid. Our rule 3 exists because of it. |
| MCP | JSON-RPC 2.0 over stdio or Streamable HTTP; tools, resources, prompts; per-request protocol version and capabilities (fetched: [architecture](https://modelcontextprotocol.io/docs/learn/architecture)). | Use MCP as the agent-facing surface. Its stdio framing is a good template for the plugin protocol. Do not make MCP servers the plugin runtime, because the host must gate them. |
| OpenFX | BSD-3-Clause (fetched: [LICENSE.md](https://raw.githubusercontent.com/AcademySoftwareFoundation/openfx/main/LICENSE.md)). Effect plugins are described through a host API. | Mirror its vocabulary (inputs, clips, parameters) for `effect` manifests. Loading native OpenFX plugins into our process is out of scope. The loading model is **(unverified)**. |
| MLT, Shotcut, Kdenlive | MLT is LGPL-2.1 (fetched: [COPYING](https://github.com/mltframework/mlt/blob/HEAD/COPYING)). Shotcut is GPL-3.0 (fetched: [COPYING](https://github.com/mltframework/shotcut/blob/HEAD/COPYING)), and Kdenlive is GPL-3.0 (fetched: [COPYING](https://github.com/KDE/kdenlive/blob/master/COPYING)). Filters are MLT services. | MLT can be used as a library or a separate process, while GPL frontends cannot be linked. Filter internals are **(unverified)**. |
| Node.js permission model | `--permission` with `--allow-fs-read`, `--allow-fs-write`, `--allow-child-process`, `--allow-worker`, `--allow-net`. The docs call it a seat belt against unintended access, not a sandbox, and list known bypasses such as symlinks (fetched: [permissions](https://nodejs.org/api/permissions.html)). | Useful as a guard for our own Node tooling. Not a security boundary for plugins. |
| WebAssembly component model | Components run on a platform and use WASI interfaces; WASI 0.2.0 is stable (fetched: [component model](https://component-model.bytecodealliance.org/)). Capability-based sandboxing is the goal. | The best long-term sandbox for pure-compute plugins. FFmpeg and Python ML stacks do not compile to WASM, so v1 cannot rely on it. |

The recurring failures are: in-process code with full privileges; code fetched at install or run time; registries with no review; and manifests that declare things nobody enforces.

## 3. Process model and enforcement

| Control | v1 (ships with the first plugin) | Later |
|---|---|---|
| Process | Child process per plugin, started with `spawn(cmd, args)`, no shell, lazy start, stop after 5 minutes idle | Pool per capability if startup cost matters |
| Environment | Scrubbed to an allow-list; secrets only if declared and user-approved | — |
| Paths | Plugin gets only `$WORKDIR` (per-call temp dir) and `$PLUGIN_DIR` (its install dir). The host rejects absolute paths and symlinks that escape them in arguments. | OS sandbox |
| Time | `timeoutMs` per method; SIGTERM, then SIGKILL after 5 s | — |
| Memory | Host polls RSS and kills at 1.5 times declared `ramMB` (best effort) | cgroups on Linux |
| Network, plugin process | Denied by declaration. A plugin that declares `network` is labelled unsandboxed and needs user consent. | Enforced by an OS sandbox (network namespaces, sandbox-exec) |
| Network, downloads | Done by the host, only from declared https hosts, verified by SHA-256 before the atomic move into place | — |
| Output | stdout is protocol only; stderr goes to a log capped at 1 MB; a JSON frame is capped at 16 MB, and bigger data is passed as a file path | — |

Be honest about the limit: env scrubbing, path checks and Node-style permissions are guards, not a boundary. A native module can ignore them. In v1 the real boundary is **a separate, unprivileged process plus the install-time review gate in section 8**. That is why the intake policy is strict.

**Protocol (dax-plugin/1).** Newline-delimited JSON-RPC 2.0 on stdin and stdout.

- `dax.hello` returns `{protocol, plugin, version, methods}`. The host checks it against the manifest.
- `dax.invoke` takes `{method, params, workdir}` and returns a result or an error. Progress arrives as `dax.progress` notifications with `{fraction, message}`.
- `dax.cancel` takes the request id. `dax.shutdown` ends the process.
- Crashes restart with backoff. Three crashes in an hour disable the plugin until the user re-enables it.

## 4. Registering tools and panels, and the two package kinds

- **Agent tools.** For each `agentTools` entry the host registers an MCP tool named `plugin.<id>.<tool>`. Its input schema comes from the manifest and is validated before any process starts. Each tool declares `sideEffects`: `"none"` or `"draft"`. Any other value is rejected at install. Results are artifact references inside the draft store, never raw command output.
- **UI panels.** No plugin webviews in v1. Panels are declarative: `form` (rendered from JSON Schema by the host), `preset-list`, or `template-gallery`. This keeps plugin UI code out of the app and avoids a second injection surface. Prompt text from skill packs is also untrusted (see the table in section 4).
- **Presets.** A preset is a data file checked against the timeline schema. Applying it creates a draft.

| | Executable plugin | Data pack (template-pack, skill-pack) |
|---|---|---|
| Contents | Manifest, per-platform artifact, models | JSON templates or presets, Markdown skill text, licensed fonts or images |
| Runs code | Yes, in a child process | No |
| Network | Declared downloads only | None |
| Install review | Full: licence, hashes, scan, contract tests | Licence, schema validation, text scan for injection patterns |
| Trust model | Isolated process | Content only; agent treats it as untrusted text and it cannot grant permissions |

## 5. Manifest fields (summary)

Required: `schema` (`"dax.plugin/1"`), `id` (lowercase, `[a-z0-9-]`, unique in the index), `name`, `version` (semver), `description`, `license` (SPDX expression from the allow-list, see the intake policy), `publisher` (must match the GitHub owner of the source repository), `capabilities` (from `tts`, `stt`, `animation-renderer`, `effect`, `template-pack`, `skill-pack`, `importer`, `generator`, `caption-renderer`, `analysis`), and `permissions`.

Executable plugins also need `entry`, `platforms` (each with an artifact URL and SHA-256), `methods` (each with JSON Schema `input` and `output`), `resources`, and `upstream` (name, URL, pinned version, licence). Optional: `downloads` (models, each with URL, SHA-256, size and `format`), `agentTools`, `settings`.

Angle-bracket values in the examples are filled in at the spike. The examples are not installable as written.

## 6. Example 1: text-to-speech plugin

Kokoro-82M is a good first target because it is small and Apache-2.0 (per its README). Its upstream repository was last updated on 2025-08-06, so the wrapper must pin a tested commit and the spike must confirm the release format (section 1, rule 3).

```json
{
  "schema": "dax.plugin/1",
  "id": "tts-kokoro",
  "name": "Kokoro text-to-speech",
  "version": "0.1.0",
  "description": "Local text-to-speech with Kokoro-82M, run as a separate process.",
  "license": "Apache-2.0",
  "publisher": "dax-editor",
  "licenseFiles": [{ "path": "LICENSE", "sha256": "<computed at spike>" }],
  "upstream": {
    "name": "kokoro",
    "url": "https://github.com/hexgrad/kokoro",
    "pinnedCommit": "<commit at spike>",
    "license": "Apache-2.0",
    "weightsLicense": "Apache-2.0 (per upstream README; verify on the model card)"
  },
  "capabilities": ["tts"],
  "tts": { "outputFormat": "wav", "sampleRate": 24000, "languages": ["en-US"] },
  "entry": {
    "command": "{{pluginDir}}/bin/tts-kokoro",
    "args": ["--serve"],
    "protocol": "dax-plugin/1"
  },
  "platforms": [
    {
      "os": "linux",
      "arch": "x64",
      "artifact": {
        "url": "https://github.com/dax-editor/plugin-tts-kokoro/releases/download/v0.1.0/tts-kokoro-linux-x64.tar.zst",
        "sha256": "<computed at build>",
        "sizeBytes": "<measured>"
      }
    }
  ],
  "downloads": [
    {
      "id": "model-kokoro-82m",
      "url": "https://huggingface.co/hexgrad/Kokoro-82M/resolve/<commit>/<file>",
      "sha256": "<computed at spike>",
      "sizeBytes": "<measured>",
      "format": "safetensors"
    }
  ],
  "methods": {
    "synthesize": {
      "input": {
        "type": "object",
        "required": ["text", "voice", "outFile"],
        "properties": {
          "text": { "type": "string", "maxLength": 5000 },
          "voice": { "type": "string", "enum": ["af_heart", "am_adam"] },
          "speed": { "type": "number", "minimum": 0.5, "maximum": 2.0 },
          "outFile": { "type": "string", "pattern": "^out/[^/].*\\.wav$" }
        }
      },
      "output": {
        "type": "object",
        "required": ["file", "durationSec"],
        "properties": {
          "file": { "type": "string" },
          "durationSec": { "type": "number", "minimum": 0 }
        }
      },
      "timeoutMs": 120000,
      "sideEffects": "workdir"
    }
  },
  "agentTools": [
    {
      "name": "speak_text",
      "method": "synthesize",
      "title": "Generate speech",
      "description": "Turn a short line of text into a WAV file that can be placed on an audio track. The result goes into the current draft.",
      "sideEffects": "draft"
    }
  ],
  "resources": { "ramMB": 1536, "threads": 2, "diskMB": 600, "gpu": "optional" },
  "permissions": {
    "network": false,
    "filesystem": { "read": ["$PLUGIN_DIR", "$WORKDIR/in"], "write": ["$WORKDIR/out"] },
    "env": [],
    "clipboard": false,
    "spawn": []
  },
  "settings": {
    "type": "object",
    "properties": { "device": { "type": "string", "enum": ["cpu", "cuda"], "default": "cpu" } }
  },
  "policy": { "telemetry": false, "networkAfterInstall": false, "runtimeCodeFetch": false }
}
```

Notes on this example:

- The model file format is `safetensors`. A `.pth` or `.bin` file written with pickle can run code on load (established practice, **unverified** in this session). The host refuses pickle formats without a human decision.
- The voice ids are placeholders to confirm at the spike.
- `outFile` is limited by pattern to `out/` under the work directory, so the plugin cannot write elsewhere even if it misbehaves.

## 7. Example 2: template pack (data only)

This pack adds caption presets with word-by-word highlighting. It is rendered by built-in FFmpeg filters, so it fits [ADR 0004](/adr/0004-free-only-no-remotion.md) and needs no code. The name describes the look generically and uses no trademark.

```json
{
  "schema": "dax.plugin/1",
  "id": "captions-bold-word",
  "kind": "data",
  "capabilities": ["template-pack"],
  "name": "Bold word-highlight captions",
  "version": "1.0.0",
  "description": "Caption presets with word-by-word highlight, rendered by built-in FFmpeg filters. No code.",
  "license": "CC0-1.0",
  "publisher": "dax-editor",
  "requires": { "core": ">=0.1 <0.2", "renderer": "ffmpeg-ass" },
  "fonts": [
    {
      "family": "Inter",
      "file": "fonts/Inter-Bold.ttf",
      "license": "OFL-1.1",
      "sha256": "<computed at build>"
    }
  ],
  "templates": [
    {
      "id": "bold-word-highlight-9x16",
      "file": "templates/bold-word-highlight-9x16.json",
      "aspect": "9:16",
      "sha256": "<computed at build>"
    }
  ],
  "ui": [{ "id": "caption-presets", "type": "template-gallery", "source": "templates" }],
  "permissions": { "network": false, "spawn": [], "filesystem": "none" },
  "policy": { "telemetry": false }
}
```

The referenced template file is data only:

```json
{
  "id": "bold-word-highlight-9x16",
  "style": {
    "font": "Inter Bold",
    "sizePct": 6.5,
    "fill": "#FFFFFF",
    "highlightFill": "#FFD400",
    "outline": { "px": 4, "color": "#000000" },
    "position": { "yPct": 72 }
  },
  "animation": { "type": "word-highlight", "timing": "from-transcript" },
  "maxWordsPerLine": 3
}
```

Notes: the `ffmpeg-ass` renderer needs an FFmpeg build with the `ass` filter, so that build's licence must be checked (**unverified**). Fonts ship only with a licence file and hash. The `CC0-1.0` pack licence applies to the template JSON, not to the font.

## 8. Supply-chain risks and realistic mitigations

**Risks, with evidence:**

- **Typosquats that run code at install.** A February 2026 batch of PyPI typosquats (`pydantics`, `opentelematry-api`, `marshmellows`, `nump`) overrode the install command in `setup.py` to run code (search result: [OSV MAL-2026-868](https://osv.dev/vulnerability/MAL-2026-868) and related records). A June 2026 package, `parsimonius`, imitated `parsimonious`, reached 2,474 downloads and carried a backdoor (search result: [threatcluster](https://threatcluster.io/cluster/typosquatting-attack-targets-python-developers-with-maliciou-94c78c8f)). A secondary post attributes 43.6% of attack names to suffix additions such as `-plugin` or `-sdk` (search result: [cipherssecurity](https://cipherssecurity.com/open-source-package-impersonation-beyond/); aggregate figure **unverified**).
- **Lifecycle scripts.** npm runs `preinstall`, `install`, `postinstall` and `prepare` during install (fetched: [npm scripts](https://docs.npmjs.com/cli/v10/using-npm/scripts)).
- **Runtime fetching.** The ComfyUI incidents in section 2.
- **Telemetry by default.** The Revideo README says renders are counted via PostHog, with an opt-out environment variable (fetched: [revideo](https://github.com/redotvideo/revideo)). An opt-out design fails our no-phone-home rule.
- **Pickled models.** Covered in section 6.

**Mitigations that are realistic for a free project:**

1. **One index, reviewed in pull requests.** A `plugins/index.json` (or a companion repo) lists each version with its artifact SHA-256 and licence. CI checks the manifest schema, the licence allow-list, that the downloaded bytes match the hash, that there are no lifecycle scripts, and runs an OSV scan on lockfiles. CI also greps for telemetry SDKs and obfuscation (for example `posthog`, `sentry`, `segment`, `mixpanel`, `google-analytics`, `eval(`, large base64 blobs).
2. **Install from pinned artifacts only.** `npm ci --ignore-scripts`. Python with `pip install --require-hashes --only-binary :all:`. No source builds. No `latest` tags.
3. **Build our own artifacts.** CI builds each plugin from a pinned upstream commit and publishes hashes. Artifact attestations would be better; whether they are free for this repo is **unverified**.
4. **Typosquat check at intake.** A new id or name within edit distance 2, or using confusable characters, of an existing name or a well-known registry name requires a human decision.
5. **Publisher binding.** The `publisher` field must match the GitHub owner that hosts the source. Verified by a person at intake for the first version of each publisher.
6. **Revocation.** The index can mark a version `revoked` with a reason. The host refuses to start it.
7. **User consent for anything unsandboxed.** Plugins that request network access, environment secrets or a third-party publisher show a confirmation with the declared permissions.
8. **Keep the first-party set small.** Installing from a URL is an "unverified" tier with a warning, not a default.

**Not realistic for a free project in v1:** paid code-signing certificates, per-OS sandboxes for every platform, or a review team. Those are later steps, and the design above does not depend on them.

## 9. Open questions

- First OS sandbox: bubblewrap on Linux, sandbox-exec on macOS, or AppContainer on Windows. Needs a spike.
- One MCP tool per plugin method, or one generic `plugin.invoke` tool. The trade-off is discoverability against context size.
- Whether the index lives in this repo (CODEOWNERS review) or a companion repo.
- Whether scout pull requests can auto-merge. AGENTS.md forbids changing CI or security settings from an agent, so auto-merge needs a maintainer-enabled rule and probably its own ADR.

## Sources

Fetched in this session (2026-10-18):

- https://code.visualstudio.com/api/references/extension-manifest
- https://code.visualstudio.com/api/advanced-topics/extension-host
- https://docs.obsidian.md/Reference/Manifest
- https://v2.tauri.app/develop/plugins/
- https://contributors.home-assistant.io/core/integrations/manifest/
- https://modelcontextprotocol.io/docs/learn/architecture
- https://nodejs.org/api/permissions.html
- https://component-model.bytecodealliance.org/
- https://jellyfin.org/docs/general/server/plugins/
- https://docs.npmjs.com/cli/v10/using-npm/scripts
- https://raw.githubusercontent.com/AcademySoftwareFoundation/openfx/main/LICENSE.md
- https://github.com/mltframework/mlt/blob/HEAD/COPYING
- https://github.com/mltframework/shotcut/blob/HEAD/COPYING
- https://github.com/KDE/kdenlive/blob/master/COPYING
- https://github.com/redotvideo/revideo
- https://docs.blender.org/manual/en/latest/advanced/extensions/getting_started.html (navigation only; manifest content not read)

Seen as search results, not opened:

- https://docs.blender.org/manual/zh-hans/dev/advanced/extensions/getting_started.html
- https://blog.comfy.org/p/comfyui-2025-jan-security-update
- https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-workload-exposure-cryptomining-20260408/
- https://osv.dev/vulnerability/MAL-2026-868
- https://threatcluster.io/cluster/typosquatting-attack-targets-python-developers-with-maliciou-94c78c8f
- https://cipherssecurity.com/open-source-package-impersonation-beyond/

Background knowledge, **unverified**: Obsidian plugin internals, OpenFX loading model, MLT filter internals, pickle execution on load, and the FFmpeg `ass` filter licence chain.
