# Research: landscape, risks and gaps

Written 2026-10-18. Everything below comes from web search snippets and one README fetch, **not** from reading source code. Items marked **(unverified)** are from my own background knowledge or a single secondary source and need checking before we rely on them.

## 1. What already exists

### Closest competitor: OpenChatCut
[OpenChatCut](https://github.com/0xsline/OpenChatCut) is an open-source "conversational AI video editor". It is almost the same product we are describing.

| | OpenChatCut |
|---|---|
| License | **AGPL-3.0+** |
| Shell | Electron 43, React 19, Vite |
| Preview / render | **Remotion** Player + Remotion/FFmpeg export, WebGL effects |
| Agent | Built-in agent (many providers via API key), Agent Skills (26 skills behind a router skill) |
| MCP | Streamable HTTP endpoint; Claude Code / Codex connect to it |
| Edit safety | "Draft session" workflow: client opens a draft, edits, submits; user approves (manual mode) or it auto-applies; one undo step |
| Features | Multitrack timeline, transcript word-cuts, captions, motion templates, AI generation, FCPXML export, social publishing |
| Traction | ~2.5k stars, 1,085 commits, "early builds", macOS unsigned |

What we can learn from it: immutable timeline + command layer (same as our design), the draft/approve flow for external agents, path allowlists for imports, and "skills" as the way to package editing know-how.
What we cannot do: copy its code. It is AGPL and we plan Apache-2.0.

### Other open-source pieces
- **FFmpeg MCP servers** (many, small): [mcp-video / KyaniteLabs](https://github.com/KyaniteLabs) (87 tools, Apache-2.0 per profile), [free-video-edit-mcp](https://github.com/breverdbidder/free-video-edit-mcp) (MIT, 16 tools, stdio + HTTP), [video-audio-mcp](https://github.com/misbahsy/video-audio-mcp) (MIT), [ffmpeg-mcp](https://github.com/Thunderbirdslabs/ffmpeg-mcp) (MIT). Mostly stateless "run one ffmpeg command" tools with no timeline, no undo and no UI. This is the gap a real engine fills.
- **Other OpenCut forks**: [OpenCut-AI](https://github.com/Ekaanth/OpenCut-AI) (transcribe, edit by text, voice clone), [floomhq/opencut](https://github.com/floomhq/opencut) (code-driven, Remotion). One fork notes the original OpenCut was archived and rewritten at `opencut-app/opencut`. Not checked.
- **NLE bridges**: MCP servers exist for [Kdenlive](https://glama.ai/mcp/servers/D-Ogi/mcp-kdenlive) (needs a patched Kdenlive) and [DaVinci Resolve](https://dev.co/ai/mcp/davinci-resolve-mcp) (Resolve Studio scripting API). No Shotcut one found. Takeaway: "also drive other editors" is possible but fragile; export to OTIO/FCPXML/EDL is the cheaper interop story.
- **Programmatic video renderers**: Remotion (React), [HyperFrames](https://themenonlab.blog/blog/heygen-hyperframes-video-as-code) (HeyGen, **Apache-2.0**, HTML + GSAP -> headless Chrome + FFmpeg, ships agent skills), Revideo (MIT, fork of Motion Canvas, per a tool roundup **(unverified)**).
- **Blender**: [BlenderMCP](https://glama.ai/mcp/servers/wenyen-hsu/blender-mcp) (ahujasid) runs a socket server inside Blender; listings warn it executes arbitrary Python.
- **Classic NLEs** (Kdenlive/MLT, OpenShot/libopenshot, Shotcut, Olive): mature C++ engines, but heavy to embed and not designed for programmatic control. I did not find authoritative architecture comparisons; we would be wrapping FFmpeg ourselves rather than embedding one.

## 2. Issues that change the plan

### 2.1 Remotion is a licensing trap
[Remotion's license](https://www.remotion.dev/docs/license/pricing): free only for individuals, nonprofits and for-profit teams of up to 3. Their terms define render automation (`renderMedia()` etc.) as the "Automators" tier: **$0.01 per render, $100/month minimum**, and a video editor / prompt-to-video app is exactly that use. An Apache-2.0 app that depends on Remotion pushes that cost onto every downstream user. **Do not depend on Remotion.**
Alternatives: HyperFrames (Apache-2.0), Revideo (MIT, unverified), or our own renderer. Trade-off: HyperFrames needs headless Chrome, which means shipping or downloading a Chromium (~150 MB+) even though Tauri itself is small. Make it an optional "motion graphics" plugin, not core.

### 2.2 Preview vs export parity
OpenChatCut gets parity cheaply because Remotion does both. We will not. Plan: cuts, concat, audio, scaling, captions burn-in -> FFmpeg only. Animated overlays -> rendered to transparent video (WebM alpha / ProRes 4444) by a pluggable overlay renderer, then composited by FFmpeg. Preview approximates this with a proxy video plus DOM overlays, so we need golden-frame tests comparing preview and export.

### 2.3 Connectors and file size
- I could **not verify** the Composio limit you mentioned. Their docs pages I tried returned 404, and third-party mirrors give no number. What the mirrors do say: Composio uploads files in tool parameters to **its own S3 storage** and passes S3 URLs to the tool, then downloads outputs. Whatever the exact cap, that relay design is a poor fit for multi-GB video: slow, double transfer, a third party holds your footage.
- Recommended split:
  - **Bytes** (video in, rendered video out) move directly between the user's machine and the provider: native Google Drive API (resumable chunked download/upload, HTTP Range) and/or embedded **rclone** (covers Drive, Dropbox, OneDrive, S3, SFTP and many more; MIT) **(unverified: license, provider count, librclone embedding)**.
  - **Actions** (post to YouTube, send Slack message, create a Drive share link) go through an adapter that can be backed by MCP servers or an integration platform. [Activepieces](https://www.activepieces.com/mcp) (MIT core) and [Nango](https://nango.dev/blog/best-open-source-api-integration-platforms-for-ai-agents/) (Elastic License 2.0, so not OSI open source and fine as an optional user-installed dependency, not something to bundle) were the self-hostable options found. Composio stays possible as an optional backend.
- Google Drive OAuth in a desktop app: loopback redirect + PKCE; a desktop client secret cannot be secret. Reading arbitrary user files needs `drive.readonly`, which Google classes as a **restricted scope** (app verification, possibly a paid security assessment) **(unverified, check current policy)**. The narrower `drive.file` scope with the Google Picker avoids that but only sees files the user explicitly picks. Decide early; this is a launch blocker for a public Drive connector.

### 2.4 Embedded local model
- Gemma 4 (released 2026-04-02 per one secondary source) comes in E2B, E4B, 12B, 26B-A4B and 31B; one guide lists the family as **Apache-2.0** **(verify on the model card; earlier Gemmas had custom terms)**; E2B/E4B run in ~5 GB RAM at 4-bit, 12B in ~8 GB. Runs via `llama-server --jinja` for tool calling. See [HF blog](https://huggingface.co/blog/gemma4), [Unsloth guide](https://unsloth.ai/docs/models/gemma-4).
- Warning signs: one April 2026 write-up reports Gemma 4 tool calling broken in Ollama 0.20.0 and needing fix PRs in llama.cpp, and says E4B is much weaker at tool calling than the large models. Treat all of this as **(unverified)** until we test.
- Design consequence: "video editing needs little intelligence" holds only if the heavy lifting is deterministic (silence, scenes, transcript, filler words) and the model picks parameters and sequences coarse tools. Choosing a format, writing a structure for a tutorial, or reasoning over a 40-minute transcript still benefits from a stronger model. So: coarse high-level tools, JSON-schema/grammar-constrained output, plan then execute, validate every call, and recommend a model tier by detected RAM.
- Download the model on first run; do not commit or bundle weights.

### 2.5 Transcription
whisper.cpp: easy to bundle, 99 languages, slower on CPU. NVIDIA Parakeet: faster, good English word timestamps, only ~25 European languages ([comparison](https://pub.towardsai.net/parakeet-vs-whisper-for-local-dictation-speed-accuracy-and-vocabulary-in-2026-f809fcc4271c), secondary source). Put transcription behind an interface; default whisper.cpp, optional Parakeet. Test word-timestamp alignment on real footage before choosing.

### 2.6 Tauri video playback on Linux
The Wails Linux guide (same WebKitGTK stack) says `<video>` needs the distro's `gst-plugins-good` and sometimes more, and the `ended` event may not fire ([source](https://wails.io/docs/guides/linux)). I found nothing specific about H.264 in current WebKitGTK. Mitigation stands: always play our own proxy (VP9/WebM or H.264), feature-detect with `canPlayType` at startup, and ship the GStreamer plugin requirement in the AppImage/deb dependencies.

## 3. Gaps in the plan so far

1. **Recording** ("simply record") is not designed yet. Screen/camera capture should live in a native sidecar, not the webview. Hard parts: macOS screen-recording permission and system-audio capture (needs ScreenCaptureKit or a virtual device), Windows WASAPI loopback, Linux PipeWire portal. Plan v0.1 as screen + mic only.
2. **Security model for agents.** MCP editing tools must not expose arbitrary FFmpeg args or shell. Add import-path allowlists, draft/approve for external agents (like OpenChatCut), confirmation before publish/delete/upload, and treat transcripts, filenames and Drive content as untrusted (prompt injection).
3. **Format "recipes".** Tutorial / explainer / short-form should be data (a markdown or JSON skill: structure, pacing, caption style, animation suggestions), not code, so the community can contribute them.
4. **Single source of truth for state.** The desktop app owns the live project; CLI and MCP must talk to it (local HTTP) or run headless on a project file. Define this before writing the MCP server.
5. **Evals.** An LLM-driven editor needs a regression suite: fixed footage + prompts -> assert on the resulting timeline (duration, cut count, no mid-word cuts). Without it, model changes silently break the product.
6. **FFmpeg LGPL build constraints.** No libx264/x265; use VideoToolbox / NVENC / QSV / AMF, with software fallback via openh264 or VP9/AV1. Dynamic linking, ship source/offer. Matrix of encoders per OS must be tested.
7. **Distribution.** macOS notarization (Apple Developer ID) and Windows code signing cost money; auto-update (Tauri updater); AppImage vs deb/rpm on Linux.
8. **Blender characters.** Blender is GPL (use as a separate process, never link). Free-form LLM-written Python is a security and reliability risk; prefer parameterized scene templates. Character rigging/animation quality is a large project, so keep it phase 2 as decided.
9. **Content licensing** for bundled music, fonts, stock and templates; only include assets whose licenses permit redistribution.
10. **Performance**: proxies, waveform/thumbnail cache, long-file handling, GPU acceleration, cancelable jobs and progress events.
11. **Project format** versioning and migration from day one.

## 4. Proposed engine scope (what "build the engine first" means)

`@dax/core`, usable from CLI and MCP, no UI:
1. Timeline model + undo/redo (written).
2. Probe, silence/scene detection (written, untested).
3. FFmpeg renderer with encoder selection (LGPL-safe) and progress.
4. Proxy generation.
5. Transcript interface + whisper.cpp adapter + filler/word-range logic.
6. Connector interface (`list`, `stat`, `download` with resume/range, `upload`) with Local and URL implementations; Google Drive / rclone next.
7. Eval harness.
