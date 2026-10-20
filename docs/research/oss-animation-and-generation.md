---
type: Research
title: Open-source animation and generation options
description: Ranks free, redistributable tools for motion graphics, sketch animation, characters, lip sync and AI video by licence and feasibility, and proposes a plugin contract that returns transparent media for dax-editor to composite.
tags: [research, animation, licensing, motion-graphics, plugins, generation]
status: stable
stale_after: 2027-01-18T00:00:00Z
generated:
  by: process:scribe
  at: 2026-10-18T19:25:00Z
---

# Research: open-source animation and generation options

Written 2026-10-18 for the plan in [ADR 0004](../adr/0004-free-only-no-remotion.md): FFmpeg built-ins first, then optional overlay plugins. Builds on the [landscape research](landscape.md).

**Method and limits.** The GitHub API refused every request in this session ("GitHub access to this repository is not enabled"). Star counts are rounded values read from repo pages, so treat them as unverified. Release dates come only from the npm and PyPI registries. Licence text was read from raw files or Hugging Face model cards unless marked. Reddit is blocked for the search tool, so the community experience below comes from Hacker News threads and blogs. Items marked **(unverified)** still need checking.

## Recommendation

1. **Primary renderer plugin: HyperFrames** (Apache-2.0). A scene is HTML and CSS with anime.js or WAAPI animation, rendered by headless Chrome and encoded by FFmpeg. Its producer README documents true alpha for `webm` (VP9, yuva420p), `mov` (ProRes 4444, yuva444p10le) and `png-sequence`. This is the overlay path ADR 0004 already reserves.
2. HyperFrames risks: pre-1.0 (npm `hyperframes` 0.8.172, published 2026-10-18), needs Node 22+, FFmpeg and a Chromium download, and one reviewer reported local renders slow (about 3 minutes for 30 s at 1080p, secondhand).
3. Alternate if HTML is the wrong model: **Revideo** (MIT, TypeScript scenes, headless render API, `@revideo/core` 0.11.0 on 2026-07-10).
4. **Lottie is an input format, not a renderer.** Preview with dotLottie-web (MIT). No maintained open tool exports Lottie to alpha video today: thorvg's CLI writes GIF only, and the puppeteer-lottie packages were last published in 2020.
5. **Sketch animation: build it on top of the renderer, do not adopt a product.** Stroke-dashoffset, rough.js (MIT), vtracer (MIT) and optionally potrace (GPL, separate process). We found no open-source whiteboard video generator.
6. **Characters:** 2D cutout or SVG rigs first. Blender runs only as a separate process (GPL). Rhubarb Lip Sync (MIT) gives mouth cues from audio.
7. **AI video and images:** optional GPU plugin only. Wan 2.2 (Apache-2.0 weights) for video and FLUX.1 [schnell] (Apache-2.0) for images, run in a child process through diffusers (Apache-2.0) or stable-diffusion.cpp (MIT). CPU video generation is not realistic.
8. **Licence traps:** `@theatre/studio` is AGPL-3.0-only on npm; PyPI `lottie` is AGPL-3.0+; FLUX.1 [dev] and Wav2Lip are non-commercial; HunyuanVideo excludes the EU, UK and South Korea; LTX-2 needs a paid licence above $10M annual revenue; GSAP's "no charge" licence is Webflow-owned and revocable; Spine and Live2D need paid editors; Mixamo raw files cannot be redistributed.

## 1. Motion graphics engines

| Tool | Licence (checked) | Activity | Runtime | Verdict |
|---|---|---|---|---|
| HyperFrames | "Apache 2.0", README: "no per-render fees or commercial-use thresholds" | npm 0.8.172, 2026-10-18; stars 23k to 67k across sources (conflicting) | Node 22+, FFmpeg, Chrome via Puppeteer | **ADOPT** (primary) |
| Revideo | MIT (LICENSE) | `@revideo/core` 0.11.0, 2026-07-10; about 4k stars | Node, headless browser, FFmpeg | MAYBE (alternate) |
| Motion Canvas | MIT (LICENSE) | `@motion-canvas/core` 3.17.2, 2024-12-14 (stale); about 19k stars | browser canvas | MAYBE; Revideo is its more recent fork |
| Manim Community | MIT (LICENSE) | PyPI 0.22.0, 2026-10-08; about 42k stars | Python, Cairo, optional LaTeX; `-t` flag per docs | MAYBE for math or explainer scenes |
| dotLottie-web | MIT (LICENSE) | npm 0.81.0, 2026-10-06 | browser, WebGL/WebGPU, ThorVG | **ADOPT** for preview playback |
| lottie-web | MIT (LICENSE.md) | npm 5.13.0, 2025-05-21; about 32k stars | browser | MAYBE (legacy) |
| ThorVG | MIT (LICENSE, "2020 - 2026") | `@thorvg/lottie-player` 1.1.3, 2026-10-16; about 2k stars | C/C++ library, headless; `tvg-lottie2gif` writes GIF only | MAYBE: candidate native frame exporter (effort unverified) |
| rlottie | "basically comes with MIT license ... but some parts of shared code are covered by different licenses" (FreeType, pixman, Skia-derived, rapidjson) | no registry; about 1.4k stars | C++ | MAYBE; ship its notice files |
| rlottie-python | LGPL-2.1 (PyPI licence text) | 1.3.8, 2025-08-23 | Python wrapper | MAYBE, separate process only |
| puppeteer-lottie(-cli) | MIT | last published 2020-07-18 / 2020-03-29 | headless Chrome | REJECT (stale) |
| lottie (PyPI) | AGPL-3.0-or-later (PyPI metadata) | 0.7.2, 2025-05-01 | Python | **REJECT** (AGPL) |
| lottie-node | MIT | 2.0.0, 2021-04-07; archived (unverified) | node-canvas | REJECT |
| Rive runtimes | MIT (rive-runtime LICENSE; `@rive-app/canvas` 2.45.0, 2026-10-17) | Editor exports moved to paid plans from Oct 2025 (vendor blog, unverified now) | browser, native | MAYBE: runtime fine, `.riv` terms to check |
| anime.js | MIT (LICENSE.md) | npm 4.5.0, 2026-06-22 | browser | **ADOPT** as the in-composition animation library |
| Theatre.js | core Apache-2.0 (`@theatre/core` 0.7.2, 2024-05-19); studio published as "AGPL-3.0-only" | stale since 2024 | browser | core MAYBE; **REJECT studio** |
| Skia / CanvasKit | BSD-3-Clause (`canvaskit-wasm` npm) | 0.42.0, 2026-08-18 | WASM, browser | MAYBE (preview only) |
| GSAP | "Standard 'No Charge' GSAP License" (effective 2025-04-30). Grant covers use "on any website, web application, or digital interface". Webflow "may terminate this GSAP License ... in its discretion" (WebFetch summary) | npm 3.15.0, 2026-04-13 | browser | **REJECT** as a vendored dependency |

**The render-then-composite pattern (ADOPT).** The overlay renderer writes a transparent clip, and FFmpeg places it over the base video. FFmpeg is LGPL-2.1-or-later by default and becomes GPL only if GPL parts are enabled ([FFmpeg legal](https://ffmpeg.org/legal.html)). Our rule against `libx264` still applies.

```sh
# Overlay a WebM alpha clip, 40 px from the left and 80 px from the bottom
ffmpeg -i base.mp4 -c:v libvpx-vp9 -i overlay.webm \
  -filter_complex "[0:v][1:v]overlay=40:H-h-80:shortest=1[v]" \
  -map "[v]" -map 0:a? -c:a copy out.mp4
# PNG frames to ProRes 4444 with alpha
ffmpeg -framerate 30 -i frames/%05d.png -c:v prores_ks -profile:v 4444 \
  -pix_fmt yuva444p10le overlay.mov
```

The `-c:v libvpx-vp9` decoder flag is needed to keep WebM alpha (common gotcha, unverified here).

## 2. Sketch and whiteboard animation

| Piece | Licence (checked) | Activity | Verdict |
|---|---|---|---|
| Stroke draw-on (`pathLength="1"`, `stroke-dasharray: 1`, animate `stroke-dashoffset` 1 to 0) | technique, no licence | n/a | **ADOPT** |
| vivus | MIT (LICENSE) | npm 0.4.6, 2021-04-17 (stale) | MAYBE; hand-rolling is about 40 lines |
| rough.js | MIT (LICENSE) | npm 4.6.6, 2023-11-20; about 21k stars (unverified) | **ADOPT**; seeded output is deterministic for seeking |
| Excalidraw | MIT (LICENSE); `@excalidraw/excalidraw` 0.18.1, 2026-04-20 | large bundle | MAYBE as an authoring tool, not a runtime |
| Excalifont font | "SIL Open Font License 1.1" per Excalidraw's page (unverified in repo) | n/a | MAYBE; check the font file's own licence |
| vtracer (colour raster to SVG) | MIT (LICENSE) | repo only; no registry date | **ADOPT** |
| potrace (bitmap to path) | GPL-2.0-or-later ("either version 2, or (at your option) any later version", [potrace site](https://potrace.sourceforge.net/)); commercial non-GPL version sold separately | repo only | MAYBE: CLI in a separate process only |
| Whiteboard video generator on GitHub | none found in our searches (absence unverified) | n/a | build our own |

**Minimal recipe (implementable).**
1. Input spec: `{"strokes":[{"svg":"<path d=...>","startMs":0,"durMs":1200}],"hand":"builtin:pen","durationMs":8000,"size":[1920,1080],"fps":30,"format":"mov"}`.
2. Generate one HTML file. Every path gets `pathLength="1"` and `data-start`, `data-dur` attributes. No real-time CSS animation.
3. Expose a seek function that HyperFrames calls for each frame. Set each path's offset from its progress, and move the hand to the path end with `getPointAtLength(len * progress)`:

```js
// Called by the renderer for every frame time t (seconds). Paths use pathLength="1".
window.setTime = (t) => {
  for (const p of document.querySelectorAll('path[data-dur]')) {
    const k = Math.min(Math.max((t - +p.dataset.start) / +p.dataset.dur, 0), 1);
    p.style.strokeDashoffset = String(1 - k);
  }
};
```

4. Render with `hyperframes render --format mov` (alpha overlay) or `--format webm`.
5. Composite over the base clip with the FFmpeg command above.
6. Golden-frame test at t = 0, the midpoint of the duration, and the end.

Cartoon Studio (a Show HN project that renders 2D cartoon scenes with HyperFrames) shows the same stack works. Its licence was not checked, so do not copy code from it.

## 3. Characters, 2D and 3D, and lip sync

| Option | Licence (checked) | Notes | Verdict |
|---|---|---|---|
| Blender (headless) | GPL: Blender's SPDX list includes GPL-2.0-or-later and GPL-3.0-or-later | `blender -b -P script.py` as a child process | **ADOPT** as a separate process |
| bpy (PyPI 5.2.2, 2026-09-15) | GPL-3.0 (PyPI metadata) | Python 3.13 module | MAYBE; import only in a child process |
| MakeHuman | source "released under AGPL"; assets "released under CC0 1.0 Universal" | output carries no MakeHuman licence | MAYBE: use exported assets only, never bundle the AGPL code |
| Blender Studio rigs (Spring, Alpha, Huginn, Snow, Rain, One) | CC-BY, attribution required (page summary) | check each page | MAYBE, with credit |
| Mixamo | Adobe community FAQ (2022): "really the only thing you can't do is distribute the raw character and animation files" | current Terms unverified | REJECT for bundling |
| VRoid / VRM | per-model commercial flags; some UV License, some CC-BY | VRM spec licence not verified (unverified) | MAYBE: per-asset check |
| Godot 2D (Skeleton2D) | MIT per Godot's LICENSE.txt (only the copyright header was read) | cutout puppets, frames exported | **ADOPT** for 2D characters |
| DragonBones | runtimes listed as MIT by registries (unverified); editor and Pro terms unresolved | | MAYBE |
| Spine | runtime use requires that "each user of the Products must obtain their own Spine Editor license" | paid editor | **REJECT** |
| Live2D | Cubism Editor FREE for "annual sales under 10 million yen" (official page; 2026 terms unverified) | proprietary | **REJECT** |
| Rhubarb Lip Sync | MIT ("released under the MIT license") | audio to mouth-shape cues | **ADOPT** |
| Wav2Lip | "any form of commercial use is strictly prohibited" (README) | | **REJECT** |
| SadTalker | code Apache-2.0, "except for the third-party components listed below" (LICENSE); uses a 3DMM library file (BFM). Basel Face Model 2009 is non-commercial research only (search summary, unverified) | | REJECT until the BFM version is confirmed |
| MuseTalk | code MIT; "The trained model are available for any purpose, even commercially" (README). Test data is non-commercial; other models (whisper, dwpose, S3FD) keep their own licences | GPU plugin | MAYBE: check each dependency |
| LivePortrait | code and weights MIT (LICENSE); InsightFace detector models non-commercial (community sources) | | MAYBE: swap in a permissive detector (MediaPipe) |

**Feasibility.** A realistic character feature is an HTML or SVG 2D rig rendered by HyperFrames, with Rhubarb mouth cues and our own or CC-BY assets. Blender is worth it only for one-off 3D scenes, as a child process. Commenters on the Cartoon Studio thread said lip-sync on static characters looked limited, and asked whether a richer mouth-shape set was needed. Use more than open and closed mouth shapes.

## 4. AI video and image generation (optional GPU plugins)

| Model | Weights licence (quoted) | Commercial | Hardware (secondhand, conflicting) | Verdict |
|---|---|---|---|---|
| Wan 2.2 (TI2V-5B, T2V-A14B) | "licensed under the Apache 2.0 License" (Hugging Face README) | yes | 5B: about 8 to 12 GB with offload (blogs); 720p 5 s clip in about 9 min on a 24 GB card (blog) | **ADOPT** (optional GPU) |
| Mochi 1 preview | Apache-2.0 (model card metadata) | yes | high, unverified | MAYBE |
| LTX-2 / 2.5 | LTX-2 Community License: "entities with annual revenues of at least $10,000,000 ... are required to obtain a paid commercial use license" | free below $10M revenue | 16 to 32 GB+ (sources disagree) | MAYBE |
| HunyuanVideo / 1.5 | "THIS LICENSE AGREEMENT DOES NOT APPLY IN THE EUROPEAN UNION, UNITED KINGDOM AND SOUTH KOREA"; extra terms above 100M monthly users | excluded in EU | 1.5: about 14 GB with offload (secondhand) | **REJECT** (EU excluded) |
| CogVideoX-5B | code Apache-2.0; weights: commercial use "must register and obtain a basic commercial license", capped at 1 million visits a month; PRC law | conditional | not checked | **REJECT** as default |
| FLUX.1 [schnell] | Apache License 2.0 (model licence file) | yes | modest | **ADOPT** (images) |
| FLUX.1 [dev] | "freely available for your non-commercial and non-production use" | no | | **REJECT** |
| SDXL base 1.0 | CreativeML Open RAIL++-M (model card metadata) | yes, with use restrictions | not checked | MAYBE (image fallback) |
| Stable Diffusion 3.5 | Stability AI Community License: free under "USD $1,000,000 in annual revenue" | above threshold needs a licence | not checked | MAYBE |

Runtimes: **diffusers** (Apache-2.0, LICENSE) in a Python child process is **ADOPT**. **stable-diffusion.cpp** (MIT, LICENSE; README lists Wan 2.1 and 2.2 and LTX-2.3 and 2.5) is **ADOPT** for quantised or CPU attempts (CPU speed unverified). **ComfyUI** is GPL-3.0 (LICENSE): MAYBE, only as a user-installed separate program, never bundled.

**Verdict.** GPU-only optional plugins. On a 24 GB card, blogs report minutes per short clip, and CPU video generation is not realistic. Images may run on CPU with stable-diffusion.cpp, but we have not measured it. Weights download at runtime, so the plugin shows the weight licence before download. Revenue caps and territory limits bind whoever runs the model.

## 5. Plugin contract

An overlay, character or generator plugin takes a JSON spec and returns media files. dax-editor imports them as assets and places them on the timeline.

Manifest fields (`dax-plugin.json`):

```json
{
  "id": "dax.overlay.hyperframes",
  "version": "0.1.0",
  "kind": "overlay | character | generator",
  "license": "Apache-2.0",
  "weights": [{"name": "...", "license": "...", "commercial": "allowed | revenue-cap | territory | none", "url": "..."}],
  "command": ["node", "bin/render.js"],
  "spec": "schema/spec.v1.json",
  "outputs": ["webm-alpha", "mov-prores4444", "png-sequence", "wav"],
  "requires": {"node": ">=22", "ffmpeg": ">=6", "gpu": {"vramGb": 8, "optional": true}},
  "network": "none",
  "timeoutSec": 600
}
```

Protocol:
- dax validates the spec against `spec`, then starts `command` as an argv array (never a shell, never free-form FFmpeg arguments) in a fresh job directory.
- The plugin prints one JSON line on stdout: `{"ok":true,"outputs":[{"path":"overlay.webm","kind":"video","alpha":true,"w":1920,"h":1080,"fps":30,"durationMs":3000,"sha256":"..."}]}`.
- dax treats every output as untrusted: it runs ffprobe, imports the file as an asset, and caches by hash of spec and plugin version.
- GPL or AGPL tools run as child processes, and their licences are listed in the manifest.

Example plugins:
1. **`dax.overlay.hyperframes`** (primary). Spec `{"template":"lower-third","params":{"title":"...","sub":"..."},"durationMs":3000,"size":[1920,1080],"fps":30,"format":"webm"}`. Output: WebM with alpha. Needs Node, Chromium and FFmpeg.
2. **`dax.sketch.whiteboard`** (own code with rough.js and vtracer; potrace optional as a GPL child process). Spec from the recipe in section 2. Output: MOV with alpha.
3. **`dax.generator.wan`** (optional GPU; Wan 2.2 weights through stable-diffusion.cpp or diffusers in a child process). Spec `{"prompt":"...","seconds":5,"width":832,"height":480,"seed":42}`. Output: MP4 with no alpha, or a PNG sequence. Its weight licence is recorded in the manifest.

## Pitfalls

- H.264 has no alpha. Use WebM VP9 (decode with the libvpx-vp9 decoder) or ProRes 4444, and confirm with ffprobe (`yuva420p` or `yuva444p10le`).
- Preview and export must agree. Preview uses dotLottie or anime.js in the browser, export uses HyperFrames. Golden-frame tests guard the gap.
- Pre-1.0 churn: HyperFrames is at 0.8.x on npm and ships frequent releases. Pin exact versions.
- Chromium redistribution terms are unverified. Prefer a download on first use over bundling.
- Star counts and VRAM figures disagree across sources. Benchmark on our target hardware before publishing numbers.
- Lottie files each carry their own licence. LottieFiles' default "Lottie Simple License" covers free animations, but creator terms vary (search summary, unverified). Record the licence per file.
- Rive: exports may need a paid plan (vendor blog). Check before shipping `.riv` files.
- Mixamo and VRoid assets are per-asset. Raw files cannot be redistributed.
- Revenue caps (LTX-2, SD 3.5) and territory limits (HunyuanVideo) apply to whoever runs the model. Show the limit in the UI before download.
- Plugin manifests and spec JSON are untrusted input. Use argv, no network by default, and a job directory.
- Never import bpy or potrace in-process. Keep GPL and AGPL code out of our process.

## Sources

Fetched (URLs opened in this session):
- Licences (raw files): [lottie-web](https://raw.githubusercontent.com/airbnb/lottie-web/master/LICENSE.md), [dotlottie-web](https://raw.githubusercontent.com/LottieFiles/dotlottie-web/main/LICENSE), [rlottie](https://raw.githubusercontent.com/Samsung/rlottie/master/COPYING), [thorvg](https://raw.githubusercontent.com/thorvg/thorvg/main/LICENSE), [thorvg README](https://raw.githubusercontent.com/thorvg/thorvg/main/README.md), [rive-runtime](https://raw.githubusercontent.com/rive-app/rive-runtime/main/LICENSE), [Manim](https://raw.githubusercontent.com/ManimCommunity/manim/main/LICENSE), [Motion Canvas](https://raw.githubusercontent.com/motion-canvas/motion-canvas/main/LICENSE), [Revideo](https://raw.githubusercontent.com/redotvideo/revideo/main/LICENSE), [Revideo README](https://raw.githubusercontent.com/redotvideo/revideo/main/README.md), [HyperFrames LICENSE](https://raw.githubusercontent.com/heygen-com/hyperframes/main/LICENSE), [HyperFrames README](https://raw.githubusercontent.com/heygen-com/hyperframes/main/README.md), [HyperFrames producer README](https://raw.githubusercontent.com/heygen-com/hyperframes/main/packages/producer/README.md), [HyperFrames render command](https://raw.githubusercontent.com/heygen-com/hyperframes/main/packages/cli/src/commands/render.ts), [anime.js](https://raw.githubusercontent.com/juliangarnier/anime/master/LICENSE.md), [Theatre.js](https://raw.githubusercontent.com/theatre-js/theatre/main/LICENSE), [vivus](https://raw.githubusercontent.com/maxwellito/vivus/master/LICENSE), [rough.js](https://raw.githubusercontent.com/rough-stuff/rough/master/LICENSE), [Excalidraw](https://raw.githubusercontent.com/excalidraw/excalidraw/master/LICENSE), [vtracer](https://raw.githubusercontent.com/visioncortex/vtracer/master/LICENSE), [Blender COPYING](https://raw.githubusercontent.com/blender/blender/main/COPYING), [Blender SPDX list](https://raw.githubusercontent.com/blender/blender/main/doc/license/SPDX-license-identifiers.txt), [MakeHuman LICENSE](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/LICENSE.md), [Wav2Lip README](https://raw.githubusercontent.com/Rudrabha/Wav2Lip/master/README.md), [SadTalker LICENSE](https://raw.githubusercontent.com/OpenTalker/SadTalker/main/LICENSE), [SadTalker README](https://raw.githubusercontent.com/OpenTalker/SadTalker/main/README.md), [MuseTalk README](https://raw.githubusercontent.com/TMElyralab/MuseTalk/main/README.md), [LivePortrait LICENSE](https://raw.githubusercontent.com/KwaiVGI/LivePortrait/main/LICENSE), [Rhubarb LICENSE](https://raw.githubusercontent.com/DanielSWolf/rhubarb-lip-sync/master/LICENSE.md), [Godot LICENSE](https://raw.githubusercontent.com/godotengine/godot/master/LICENSE.txt), [ComfyUI LICENSE](https://raw.githubusercontent.com/comfyanonymous/ComfyUI/master/LICENSE), [diffusers LICENSE](https://raw.githubusercontent.com/huggingface/diffusers/main/LICENSE), [stable-diffusion.cpp LICENSE](https://raw.githubusercontent.com/leejet/stable-diffusion.cpp/master/LICENSE), [stable-diffusion.cpp README](https://raw.githubusercontent.com/leejet/stable-diffusion.cpp/master/README.md), [LTX-2 LICENSE-2](https://raw.githubusercontent.com/Lightricks/LTX-2/main/LICENSE-2), [LTX-2.x license](https://raw.githubusercontent.com/Lightricks/LTX-2/main/LICENSE-2_x), [HunyuanVideo LICENSE](https://raw.githubusercontent.com/Tencent-Hunyuan/HunyuanVideo/main/LICENSE.txt), [HunyuanVideo-1.5 LICENSE](https://raw.githubusercontent.com/Tencent-Hunyuan/HunyuanVideo-1.5/master/LICENSE), [Wan 2.1 LICENSE](https://raw.githubusercontent.com/Wan-Video/Wan2.1/main/LICENSE.txt), [CogVideo LICENSE](https://raw.githubusercontent.com/THUDM/CogVideo/main/LICENSE), [FLUX.1 [dev] licence](https://raw.githubusercontent.com/black-forest-labs/flux/main/model_licenses/LICENSE-FLUX1-dev), [FLUX.1 [schnell] licence](https://raw.githubusercontent.com/black-forest-labs/flux/main/model_licenses/LICENSE-FLUX1-schnell).
- Model cards and weight licences: [Wan 2.2 TI2V-5B](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B/raw/main/README.md), [Wan 2.2 T2V-A14B](https://huggingface.co/Wan-AI/Wan2.2-T2V-A14B/raw/main/README.md), [Wan 2.1 T2V-1.3B](https://huggingface.co/Wan-AI/Wan2.1-T2V-1.3B/raw/main/README.md), [LTX-Video](https://huggingface.co/Lightricks/LTX-Video/raw/main/README.md), [LTX-Video open-weights licence](https://huggingface.co/Lightricks/LTX-Video/raw/main/LTX-Video-Open-Weights-License-0.X.txt), [LTX-2](https://huggingface.co/Lightricks/LTX-2/raw/main/README.md), [HunyuanVideo](https://huggingface.co/tencent/HunyuanVideo), [HunyuanVideo-1.5](https://huggingface.co/tencent/HunyuanVideo-1.5), [CogVideoX-5b licence](https://huggingface.co/zai-org/CogVideoX-5b/raw/main/LICENSE), [Mochi 1 preview](https://huggingface.co/genmo/mochi-1-preview/raw/main/README.md), [SDXL base 1.0](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/raw/main/README.md), [MuseTalk model card](https://huggingface.co/TMElyralab/MuseTalk/raw/main/README.md).
- Web pages (WebFetch): [GSAP standard licence](https://gsap.com/standard-license), [GSAP README](https://raw.githubusercontent.com/greensock/GSAP/master/README.md), [Potrace](https://potrace.sourceforge.net/), [Stability AI Community License](https://stability.ai/community-license-agreement), [thorvg CLI tools](https://github.com/thorvg/thorvg.cli-tools), [FFmpeg legal](https://ffmpeg.org/legal.html), [Hacker News: HyperFrames Show HN](https://news.ycombinator.com/item?id=47902856), [Hacker News: Cartoon Studio](https://news.ycombinator.com/item?id=47871828), [GitHub repo pages for star counts](https://github.com/airbnb/lottie-web) (and the other repos named in this file).
- Registries: npm (`lottie-web`, `@lottiefiles/dotlottie-web`, `@thorvg/lottie-player`, `@rive-app/canvas`, `@revideo/core`, `@motion-canvas/core`, `hyperframes`, `animejs`, `gsap`, `@theatre/core`, `@theatre/studio`, `@excalidraw/excalidraw`, `roughjs`, `vivus`, `canvaskit-wasm`, `puppeteer-lottie`, `puppeteer-lottie-cli`, `lottie-node`, `@lottiefiles/lottie-player`), PyPI (`manim`, `bpy`, `lottie`, `rlottie-python`, `pyrlottie`).

Search results only (not opened): Rive licence and pricing blog and forum; VRoid Hub conditions of use; Mixamo community FAQ; Blender Studio Spring page; Live2D help and licence pages; DragonBones licence (not found); LottieFiles licence help pages; Basel Face Model licence PDF; Wan, LTX and HunyuanVideo VRAM guides; HyperFrames and Cartoon Studio Hacker News threads.
