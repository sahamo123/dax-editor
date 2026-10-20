---
type: Research
title: Screen, webcam and microphone recording for the desktop app
description: Compares FFmpeg, webview and native-helper ways to record screen, webcam, microphone and system audio in a Tauri 2 app on macOS, Windows and Linux (X11 and Wayland), with licence checks of OBS, Cap, Screenity, Kap and BlackHole and an engine plan.
tags: [recording, screen-capture, webcam, audio, ffmpeg, tauri, wayland, licensing, roadmap]
status: draft
generated:
  by: process:scribe
  at: 2026-10-18T21:30:00Z
---

# Screen, webcam and microphone recording for the desktop app

Gap: ROADMAP item "Screen and mic recording". Goal: record the screen, webcam and microphone inside the Tauri desktop app on macOS, Windows and Linux, free and open source only. This is research, not a decision. Items marked **(unverified)** were not checked against a primary source. Items marked **(snippet)** come from search results that were not fetched.

## Recommendation

- **v1: native capture from the engine, not the webview.** The engine already runs FFmpeg as a child process (`packages/core/src/exec.ts`) and the desktop app will ship the LGPL FFmpeg sidecar ([packaging](/research/tauri-sidecar-packaging.md), ADR 0002). Add one typed capture module with one argument builder per OS: `avfoundation` on macOS, `gdigrab` on Windows, `x11grab` plus `pulse` on Linux X11. No shell, no free-form FFmpeg arguments.
- **Simplest path that covers the most users:** one code path (argument builder, session manager, device parser) for macOS, Windows and Linux X11. **Wayland has no FFmpeg path today** (section 2). Ship v1 with Wayland detected and reported as unsupported, and choose a portal helper as a separate, human-approved step.
- **One file per source.** Record screen, microphone and webcam as separate fragmented MP4 files with a shared start timestamp. Combine them later with the existing render pipeline (the roadmap's second video layer), so a crash or a bad camera does not lose the screen take.
- **Crash safety:** write fragmented MP4 (`movflags=hybrid_fragmented`, documented as readable after an unclean abort), and keep a session manifest on disk. On engine start, list unfinished sessions and offer to keep them.
- **System audio is phase 2.** macOS: a small ScreenCaptureKit helper (macOS 13+) written from our own source. Windows: WASAPI loopback, route to be chosen. Linux: the PulseAudio/PipeWire monitor source works through `pulse` in v1. Do not bundle BlackHole (GPL-3.0 source, driver).
- **Do not adopt code from OBS (GPL-2.0), Cap (AGPL-3.0 main code), Screenity (GPL-3.0) or any GPL recorder.** Learn product ideas only (section 7).
- **Keep recording off the external MCP surface** until the draft/approve flow exists ([ADR 0006](/adr/0006-draft-approve-for-external-agents.md)). A tool that starts a screen capture must not run silently for an external agent.

## Scope and method

Fetched in this session: FFmpeg device and filter docs, the FFmpeg `vsrc_ddagrab.c` source, FFmpeg format docs (partly), MDN and caniuse pages, Tauri issues #2338 and #13143, WebKit bug 210926, a Hopp engineering post, licence files for Cap, Screenity, OBS (COPYING) and BlackHole, the Kap and scap repository pages, and the scap and Cap commit feeds. Search results were used as leads and are marked (snippet). Reddit could not be fetched from this session. Hacker News was searched through the Algolia API.

## 1. Options compared

| Approach | macOS | Windows | Linux X11 | Linux Wayland | Licence | Verdict |
|---|---|---|---|---|---|---|
| **Engine-owned FFmpeg capture** (`avfoundation`, `gdigrab` or `ddagrab`, `x11grab`, `pulse`) | Yes; needs Screen Recording permission | Yes | Yes | No (no FFmpeg path, section 2) | FFmpeg LGPL build we already ship | **ADOPT for v1** |
| Webview `getDisplayMedia` + `MediaRecorder` | Unreliable in WKWebView under Tauri (issue #2338, no fix found) | Needs WebView2 `ScreenCaptureStarting` handling (snippet; not verified in Tauri) | Depends on the WebKitGTK build (section 3) | Depends on the distro's WebKitGTK PipeWire backend | Built in | **REJECT as the primary path.** Keep as a Wayland probe only |
| ScreenCaptureKit helper (Swift, our source) | Yes, macOS 13+, video and system audio | n/a | n/a | n/a | Apple SDK | **ADOPT for phase 2** (system audio). Needs a human test |
| WASAPI loopback helper | n/a | Yes, system audio | n/a | n/a | Depends on the library chosen | MAYBE, phase 2 |
| PipeWire portal helper (GStreamer `pipewiresrc` with a portal client, or a Rust crate) | n/a | n/a | n/a | Yes | GStreamer is LGPL; any crate licence unchecked | **MAYBE. Human decision** (new capability, needs an ADR) |
| `scap` Rust crate (CapSoftware) | Yes (ScreenCaptureKit) | Yes (Windows.Graphics.Capture) | Yes (PipeWire, per README) | Yes, per README | MIT (LICENSE and README) | **MAYBE, escalate.** Newest commit seen is 2025-08-05, which fails the 12-month maintenance gate |
| OBS Studio | Yes | Yes | Yes | Yes (portal) | GPL-2.0 (COPYING fetched; "or later" unverified) | **REJECT for code.** Ideas only; users may install it separately |
| Cap | Yes | Yes | Not listed in README | No | AGPL-3.0 for main code, MIT for `cap-camera*` and `scap-*` | **REJECT for code.** Ideas only |
| Screenity | Chrome extension only | Chrome extension only | Chrome extension only | Chrome extension only | GPL-3.0 | **REJECT.** Not a desktop option |
| Kap | Yes, macOS only | No | No | No | MIT (repo page label; LICENSE fetch returned 503) | MAYBE for ideas. Re-check the LICENSE file |
| BlackHole (macOS virtual audio driver) | Via user-installed driver | No | No | No | GPL-3.0 source (LICENSE fetched) | **REJECT for bundling.** Escalate if we ever document it |

The policy's rubric scores plugins. Engine capture is core code, so the verdicts above are not policy scores. The policy in [open-source radar](/research/open-source-radar.md#intake-policy) still applies to any new binary or library.

## 2. FFmpeg capture inputs per OS

Verified from the [FFmpeg devices page](https://ffmpeg.org/ffmpeg-devices.html) unless marked.

**macOS, `avfoundation`**
- Input is `-i "[VIDEO]:[AUDIO]"` by index or name. `-list_devices true` lists indices, names and UIDs. Prefer `-video_device_index` and `-audio_device_index`, since indices change between machines.
- `-capture_cursor` (default 0) and `-capture_mouse_clicks` (default 0). Set `capture_cursor` explicitly.
- `-framerate` defaults to `ntsc` (30000/1001). Set it explicitly.
- `-pixel_format`: if unsupported, FFmpeg lists the formats and uses the first one. Pick a format from the list and test it.
- Screen permission is checked for the app that launches FFmpeg (snippet from a CircleCI thread). Terminal launches get the grant, not our app. Test from a signed app bundle.
- Known problem: a mid-recording resolution change makes the stream repeat the last frame with no error (FFmpeg trac #9423, snippet).

**Windows, `gdigrab`**
- `-i desktop` captures the whole desktop, or `-i title=<window>` / `hwnd=` captures one window.
- `draw_mouse` (default 1), `framerate` (default `ntsc`), `video_size`, `offset_x`/`offset_y` from the top-left of the primary monitor. Negative offsets select monitors to the left or above it.
- `show_region` cannot be used with a single-window capture.
- GDI capture is CPU-heavy at 60 fps (unverified; measure on a real machine).

**Windows, `ddagrab` (filter, Desktop Duplication API)**
- Verified from the source file `libavfilter/vsrc_ddagrab.c` (fetched from the FFmpeg master branch). Options: `output_idx` (0), `draw_mouse` (1), `framerate` ("30"), `video_size`, `offset_x`, `offset_y`, `output_fmt` (`auto`, `8bit`, `10bit`, `16bit`), `allow_fallback` (0), `force_fmt` (0), `dup_frames` (1).
- It outputs **D3D11 hardware frames**, so the encoder must accept D3D11 frames or the stream must be downloaded first. Requires a D3D11VA device.
- Without `IDXGIOutput5` it falls back to the 8-bit legacy API. Errors: `DXGI_ERROR_NOT_CURRENTLY_AVAILABLE` (too many duplication sessions, EBUSY) and `E_ACCESSDENIED`. `DXGI_ERROR_ACCESS_LOST` is not handled, so the session must be restarted on any acquire error (from source).
- Cursor shapes are drawn by the filter when `draw_mouse` is on.
- Recommendation: start with `gdigrab` (simpler, verified options). Move to `ddagrab` only after measuring CPU on a real Windows machine. The license header of `vsrc_ddagrab.c` was not checked (unverified; check it is LGPL-compatible).

**Linux X11, `x11grab`**
- Input `[host]:display.screen[+x,y]`. `DISPLAY` sets the default. `follow_mouse` (`centered` or a pixel margin), `select_region`, `grab_x`/`grab_y`, `window_id`, `draw_mouse` (1), `framerate` (`ntsc`).
- X11 only. Under a Wayland session, `x11grab` sees only XWayland surfaces, so native Wayland windows come out blank or partial (widely reported; unverified here).

**Linux audio, `pulse`**
- Needs FFmpeg built with `--enable-libpulse`. The filename is a source name, or `default`. List sources with `pactl list sources`; monitor sources give system audio.
- Options: `sample_rate` (48000), `channels` (2), `fragment_size` (about 50 ms), `wallclock` (1).
- Works through `pipewire-pulse` on PipeWire systems (unverified here; common setup).
- `alsa` input is also documented (`hw:CARD,DEV`) and is a fallback when Pulse is absent.

**Wayland: no FFmpeg path**
- FFmpeg trac #10742 ("Add Wayland/Pipewire support for Screen Recording") was still open in the most recent snapshot found. The mailing-list patches from 2024 moved the design to a libavfilter source that uses the ScreenCast portal to get a PipeWire file descriptor (snippet). I found no evidence of a merge.
- Portal consent is required on Wayland. Programs must use the portal; FFmpeg cannot do it alone (snippets from the FFmpeg ticket, Fedora and NixOS threads).
- `kmsgrab` is not a substitute (snippet quoting the ticket).
- Options for a human to choose from: (a) a GStreamer pipeline (`pipewiresrc`) fed by a portal client (LGPL GStreamer as a separate process, unverified licence of each plugin); (b) the `scap` PipeWire path, after the maintenance check; (c) the webview route on a WebKitGTK build that has the PipeWire `getDisplayMedia` backend (section 3). WebKit bug 210926 implemented that backend in 2021 (fetched; resolved fixed). Whether a given distro's WebKitGTK ships it is **unverified**.

**Encoders.** The LGPL build must not use `libx264` or `libx265` (ADR 0002). Candidate H.264 encoders to check with `ffmpeg -encoders`: `h264_videotoolbox` (macOS), `h264_mf` or the NVENC/QSV/AMF encoders (Windows), `h264_vaapi` (Linux) and `libopenh264` as software fallback (encoder names are **unverified** here, except `libopenh264`, which the packaging note already lists).

## 3. Webview route: `getDisplayMedia` and `MediaRecorder` in Tauri

- **Spec basics (MDN, fetched):** `getDisplayMedia` shows the browser's own picker, the user chooses the source, and the page cannot list sources. Capturing audio is optional, and the returned stream may have no audio track. The `display-capture` Permissions-Policy applies to iframes.
- **`MediaRecorder` support (caniuse, fetched):** Chrome 49, Edge 79, Safari desktop 14.1, Safari iOS 14.5, Firefox 29. caniuse did not show WebKitGTK or MIME types such as `video/mp4`. Check `MediaRecorder.isTypeSupported()` at runtime.
- **macOS (WKWebView):** Tauri issue #2338 (fetched) reports `navigator.mediaDevices` missing in a release build and then a `NotAllowedError` on WebKit. Maintainers pointed to Info.plist usage strings. A 2022 comment says the picker does not show in Wry while Safari works. The issue was closed as completed in 2021, and no fix is visible in the thread. A WebKit bug from 2024 (snippet) says a media-capture permission delegate can break `getDisplayMedia` on Sonoma; a fix landed in May 2024 (snippet). **Unverified in our build.**
- **Linux (WebKitGTK):** Tauri issue #13143 (fetched) was closed as not planned on 2025-04-05. Maintainers said WebRTC sits behind an experimental build flag and does not work properly. Hopp's engineering post (fetched) says the default WebKitGTK build lacks WebRTC, that a custom build is needed, and that they plan to move screen-share streaming to a Rust backend to escape browser codec limits (a stated plan, not a finished change). The `enable-media-stream` setting defaults to off (snippet from WebKitGTK docs). Bug 210926 added a PipeWire `getDisplayMedia` backend (fetched; resolved fixed 2021).
- **Windows (WebView2):** Microsoft's docs (snippet) say `getDisplayMedia` raises `CoreWebView2.ScreenCaptureStarting`, and that the event can be deferred. Denial returns `NotAllowedError`. Whether Tauri or Wry exposes this event is **unverified**.
- **WebM output:** `MediaRecorder` WebM files lack a duration and seek index until remuxed (snippet from a Chrome recording writeup). `ffmpeg -c copy -cues_to_front 1` fixes this for VP8/VP9/AV1 and Opus only (snippet). H.264 in WebM will not remux.
- **Conclusion:** the webview route fails or depends on build flags on two of three OSes at the level of the webview engine itself. It is not the v1 path. It may still serve as a probe on a Wayland desktop with a known WebKitGTK build.

## 4. System audio

- **macOS:** ScreenCaptureKit can capture system audio on macOS 13+ by setting `capturesAudio` (snippet from Apple's WWDC22 notes and sample code). No virtual driver needed. Screen recording consent covers it. Known issue (snippet, Apple forums): corrupted output when the microphone is captured with system audio. Plan a helper binary built from our source, and test it on macOS 13, 14 and 15.
- **macOS, drivers:** BlackHole is GPL-3.0 (LICENSE fetched). Do not bundle it.
- **Windows:** WASAPI loopback records what a render endpoint plays (Microsoft docs, snippet). Shared mode only. FFmpeg does **not** appear to have a WASAPI input: ticket #9408 is an open feature request (snippet), and a 7.1 full build was reported without WASAPI (ticket #11270, snippet). Check `ffmpeg -devices` on our build (**unverified**). Plan a small helper or a dependency chosen by a human.
- **Linux:** the `pulse` monitor source (section 2). PipeWire monitor sources through `pipewire-pulse` (unverified here).
- **Per-app audio:** ScreenCaptureKit filters per application (snippet). WASAPI has per-process loopback in newer Windows versions (unverified here). Out of scope for v1.

## 5. Cursor capture

- In-frame cursor: `draw_mouse` in `gdigrab`, `ddagrab` and `x11grab`; `capture_cursor` in `avfoundation` (all verified above). Default on for the first three, off for avfoundation.
- Cursor as data: to drive zoom-follow or cursor effects, sample the pointer position at 60 Hz in the engine and store it next to the video as a JSON track in source time. Sources: Windows `GetCursorPos`, X11 `XQueryPointer`, macOS `NSEvent` (permissions **unverified**). Wayland has no general pointer position without the portal's cursor metadata (unverified).
- Cap and Screenity both offer cursor highlight and click effects (fetched product pages). These are UX ideas to copy in our own code, not code to reuse.

## 6. Crash-safe recording

- **Fragmented MP4:** the FFmpeg format page (fetched) says `hybrid_fragmented` writes a fragmented file that can be read during writing, including after an unclean abort, then converts to a normal MP4 when writing ends. A fragmented file is decodable even if writing is interrupted, while a normal MP4 is not decodable until it is finished. `frag_keyframe` starts a fragment at each keyframe, and `frag_duration` (microseconds) sets the fragment length (fetched). Use 1 to 2 s fragments.
- **Segments:** the segment muxer (`segment_time`, `reset_timestamps`, `segment_list`) limits loss to one segment and keeps files small. Its options were not fetched (**unverified**; check `ffmpeg -h muxer=segment`).
- **Stop:** send `q` on FFmpeg's stdin for a clean finish, wait a few seconds, then kill the process tree (the process-tree rule in the [packaging note](/research/tauri-sidecar-packaging.md#1-sidecar-mechanics-tauri-2)). The `q` behaviour is standard FFmpeg but was not fetched (unverified).
- **Manifest:** write `session.json` (sources, start wall-clock time, sizes, last fragment time) every 5 s. On start-up, a session with no `finished` flag is listed for recovery.
- **Clock sync:** separate FFmpeg processes start at slightly different times. Store a per-source start offset from the wall clock and measure drift over 30 minutes on each OS (**unverified**, needs a human).

## 7. Reference apps: what to learn, what not to copy

- **OBS Studio (GPL-2.0, COPYING fetched).** Uses ScreenCaptureKit on recent macOS and a PipeWire portal source on Linux (snippets; the OBS docs were not fetched). Learn the source model and the portal flow. Do not link or copy.
- **Cap (AGPL-3.0 main code; MIT for `cap-camera*` and `scap-*` per its LICENSE).** Tauri v2 plus Rust. README (fetched) lists macOS and Windows and describes Instant Mode (upload while recording) and Studio Mode (record locally, then open the editor). `packaging/linux` (fetched) has AppImage, DEB and RPM targets, but the README does not list Linux as supported. Learn the two-mode split. Do not copy code, because the main code is AGPL.
- **Screenity (GPL-3.0).** Chrome extension (fetched). Offers tab, area, desktop, window and camera capture, microphone and system audio, click and cursor highlight, and export to mp4, gif and webm. Learn the UX. No code reuse.
- **Kap (MIT per repo page).** macOS only, described as "an open-source screen recorder built with web technology". The capture method is not on the page. Repo page fetched; LICENSE file returned 503, so re-check it before any reading.
- **Rackast (Show HN, 2026-08-22, 2 points).** A Tauri screen recorder with a built-in editor (HN listing, not fetched). Shows the same stack is being tried by others. Not evaluated.

## 8. Real-world developer problems

| Problem | Where it shows up | Status |
|---|---|---|
| `getDisplayMedia` throws `NotAllowedError` in WKWebView under Tauri | [tauri #2338](https://github.com/tauri-apps/tauri/issues/2338) (fetched) | Closed as completed 2021; the 2022 WebKit failure has no visible fix |
| WebRTC not available in WebKitGTK; `RTCPeerConnection` missing | [tauri #13143](https://github.com/tauri-apps/tauri/issues/13143) (fetched) | Closed as not planned, 2025-04-05; user still asking 2026-09 |
| Browser codec and WebRTC limits push screen share toward a native Rust backend | [Hopp, "hate webkit"](https://gethopp.app/blog/hate-webkit) (fetched) | A stated plan in the post; not verified as shipped |
| FFmpeg Wayland recording gives a black screen; no PipeWire support | [FFmpeg trac #10742](https://trac.ffmpeg.org/ticket/10742) (snippet) | Open |
| PipeWire negotiation fails after the portal dialog ("no more input formats") | vokoscreenNG issue on niri (snippet) | Unknown |
| FFmpeg avfoundation repeats the last frame after a resolution change | [FFmpeg trac #9423](https://trac.ffmpeg.org/ticket/9423) (snippet) | Open |
| macOS permission attributed to Terminal, not the app | CircleCI thread (snippet) | Known behaviour |
| `getDisplayMedia` shows a black preview in WebKit GTK | [WebKit bug 227479](https://bugs.webkit.org/show_bug.cgi?id=227479) (snippet) | Not checked for later fixes |
| WebM from `MediaRecorder` has no duration or seek index | Addpipe writeup (snippet) | Known fix by remux |
| WASAPI missing from an FFmpeg 7.1 Windows build | [FFmpeg trac #11270](https://trac.ffmpeg.org/ticket/11270) (snippet) | Closed as duplicate |

Reddit could not be fetched from this session, so community threads are not covered. The Hacker News search returned few screen-recording threads, mostly Show HN posts with little discussion.

## 9. Implementation plan (v1)

**Core (`packages/core/src/capture/`, no UI):**
- `types.ts`: `RecordingRequest` and `DeviceList`, with TSDoc contracts. Times in seconds, source time for media.
- `devices.ts`: parse the device listing per OS. macOS: `ffmpeg -f avfoundation -list_devices true -i ""` (stderr). Windows: dshow listing (**verify syntax**). Linux: `pactl list short sources`. Parsers are pure functions over captured text.
- `args.ts`: pure builders, `buildCaptureArgs(platform, request, devices)`. Every device must match an entry from `DeviceList`, so no user text reaches argv. Output is always fragmented MP4 (`-movflags hybrid_fragmented`, `-frag_duration`).
- `session.ts`: spawn through the existing `exec.ts` pattern, keep the child in a map, write the manifest, stop with `q` then kill.
- `recover.ts`: list unfinished sessions from manifests.
- Commands in the registry: `start_recording`, `stop_recording`, `import_recording` (adds finished files as source media, with durations in seconds).

**Engine server (`@dax/server`, when merged; bearer token, 127.0.0.1 only):**
- `GET /recording/devices` returns screens, windows, cameras, microphones, Pulse sources, and a `wayland: true` flag with reason.
- `POST /recording/sessions` takes a `RecordingRequest`, returns `{ id, startedAt, tracks }`.
- `GET /recording/sessions` lists active and unfinished sessions. `GET /recording/sessions/:id` returns state, bytes and last fragment time.
- `POST /recording/sessions/:id/stop` and `.../cancel`. Cancel keeps the partial file and marks it cancelled.

**Desktop app:** a permission preflight panel (macOS: Screen Recording and microphone; Windows: microphone and camera privacy settings), a recording indicator, and a clear "not supported on Wayland yet" state.

**Sidecar:** no new binary for v1. Confirm that the LGPL FFmpeg build lists `avfoundation`, `gdigrab`, `x11grab`, `pulse` and `dshow` (`ffmpeg -devices`) and that `ddagrab` appears in `ffmpeg -filters`. Record the build's configure line in the packaging notes.

**Tests (no network, no committed video):**
- Unit: argument builders for each OS, device parsers from text fixtures.
- Offline FFmpeg smoke test: `-f lavfi -i testsrc` writes a `hybrid_fragmented` file; kill the process mid-write, then `ffprobe` the partial file. This runs on Linux CI without a display.
- Linux X11: an `x11grab` smoke test under `xvfb-run -a` (Xvfb's licence not checked, unverified).
- macOS and Windows: a manual checklist (section 10) plus a non-blocking CI check that the devices list runs.

**Docs (scribe step):** update ROADMAP and STATUS, add a log entry, and add the ADR for the capture approach (new capability type, so an ADR is needed under the intake policy).

## 10. Needs a human to test on real machines

1. **macOS 13, 14 and 15:** Screen Recording and microphone prompts; whether the grant attaches to our signed app or to a terminal; device indices for the screen and the microphone; `capture_cursor` output; 1080p at 30 and 60 fps CPU use; sleep and wake; display connect and disconnect (repeated-frame issue).
2. **Windows 10 and 11:** `gdigrab` against `ddagrab` CPU use at 60 fps; multi-monitor offsets, including negative ones; DPI scaling; microphone and webcam device names; 30-minute A/V drift.
3. **Linux X11:** `x11grab` on multiple screens; `pulse` monitor source; behaviour under XWayland.
4. **Linux Wayland (GNOME and KDE):** confirm no FFmpeg path works; test `getDisplayMedia` on the target distro's WebKitGTK build; then decide the helper.
5. **Signing:** whether signing and notarization of the nested FFmpeg sidecar changes macOS grants.
6. **Privacy:** recording indicators, consent for other people on webcam or microphone, and what leaves the machine (answer: nothing, by design).

## 11. Needs a human decision

- **Wayland helper** (GStreamer `pipewiresrc` plus portal client, or `scap` PipeWire path): a new dependency and capability. Requires an ADR. Check each licence and the GStreamer plugin set first.
- **`scap` crates (MIT):** the newest commit on the repo feed is 2025-08-05 (fetched), which fails the 12-month maintenance gate. The crates may now live in Cap's AGPL repo. Escalate before any use.
- **Native helpers (Swift for ScreenCaptureKit, a Windows audio helper):** built from our source, so not downloads, but they add a second language to the build. Needs an ADR, and the Tauri Rust side should stay small ([ADR 0001](/adr/0001-tauri-desktop-shell.md)).
- **BlackHole and any virtual audio driver:** GPL-3.0 and a kernel-level install. Human decision if it is ever documented.
- **Kap:** MIT per the repo page, but the LICENSE file could not be fetched (503). Re-check before any use.
- **OBS, Cap, Screenity:** copyleft, ideas only. Any code reuse is a human decision and would likely be rejected.
- **Webcam and microphone recording of other people:** a product and privacy review, not a licence issue.

## 12. Open questions (unverified)

- Whether this FFmpeg build has `ddagrab` and `dshow` compiled in, and its licence header.
- H.264 encoder names per OS in our build (`h264_videotoolbox`, `h264_mf`, `h264_vaapi`).
- Segment muxer options and FFmpeg's `q` stop behaviour (fetch the muxer and CLI pages).
- Whether WebKitGTK on the target distros ships the PipeWire `getDisplayMedia` backend.
- Whether WebView2 in Tauri raises `ScreenCaptureStarting` in our setup.
- macOS: the exact TCC behaviour for a nested sidecar in a signed bundle.
- Windows: whether FFmpeg has a WASAPI input in any released version.

## Sources

Fetched (primary unless noted):

- https://ffmpeg.org/ffmpeg-devices.html
- https://raw.githubusercontent.com/FFmpeg/FFmpeg/master/libavfilter/vsrc_ddagrab.c
- https://ffmpeg.org/ffmpeg-filters.html (ddagrab not reached; the page is too long to read here)
- https://ffmpeg.org/ffmpeg-formats.html (partial: movflags only)
- https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API/Using_Screen_Capture
- https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder (no compatibility data on the page)
- https://caniuse.com/mediarecorder
- https://github.com/tauri-apps/tauri/issues/2338
- https://github.com/tauri-apps/tauri/issues/13143
- https://bugs.webkit.org/show_bug.cgi?id=210926
- https://gethopp.app/blog/hate-webkit
- https://github.com/CapSoftware/Cap (README) and https://github.com/CapSoftware/Cap/blob/main/LICENSE
- https://github.com/CapSoftware/Cap/blob/main/packaging/linux
- https://github.com/CapSoftware/scap (README and LICENSE statement) and https://github.com/CapSoftware/scap/commits/main.atom
- https://github.com/alyssaxuu/screenity (README) and https://github.com/alyssaxuu/screenity/blob/master/LICENSE
- https://github.com/obsproject/obs-studio/blob/master/COPYING
- https://github.com/wulkano/Kap (repo page; LICENSE file returned 503)
- https://github.com/ExistentialAudio/BlackHole/blob/master/LICENSE
- https://hn.algolia.com/api/v1/search (Hacker News search, two queries)

Search results only (snippet, not fetched; treat as leads):

- https://trac.ffmpeg.org/ticket/10742, https://trac.ffmpeg.org/ticket/9423, https://trac.ffmpeg.org/ticket/9408, https://trac.ffmpeg.org/ticket/11270
- https://ffmpeg.org/pipermail/ffmpeg-devel/2024-May/327113.html
- https://bugs.webkit.org/show_bug.cgi?id=227479
- https://webkitgtk.org/reference/webkit2gtk/stable/property.WebView.display-capture-state.html
- https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2screencapturestartingeventargs
- https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording
- https://developer.apple.com/forums/thread/805892
- https://docs.rs/crate/screencapturekit/8.0.1/source/examples/22_tauri_app/README.md
- https://obsproject.com/kb/window-capture-sources
- https://blog.addpipe.com/duration-in-webm-videos-produced-by-chrome/
- https://bbs.archlinux.org/viewtopic.php?id=291201
- https://github.com/zcanann/scap and https://github.com/helmerapp/scap (forks; not checked)
