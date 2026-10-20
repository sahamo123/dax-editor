---
type: Research
title: Motion preset and easing sources
description: Checks free, permissively licensed easing libraries, CSS animation libraries, transition packs and Lottie packs for dax-editor's motion-graphics gap, with ADOPT, MAYBE and REJECT verdicts under the intake policy and the exact licence text location for each ADOPT.
tags: [research, motion-graphics, easing, licensing, intake, presets, transitions]
status: stable
stale_after: 2027-01-19T00:00:00Z
generated:
  by: process:scribe
  at: 2026-10-19T01:40:00Z
---

# Research: motion preset and easing sources

Written 2026-10-19 for the gap "drag-and-drop pre-built motion graphics for an FFmpeg-based editor, with a licence that allows free use". It does not repeat [animation and generation options](oss-animation-and-generation.md), [effects and transitions](oss-effects-and-transitions.md) or [FFmpeg animation recipes](ffmpeg-animation-recipes.md). Those cover HyperFrames, Revideo, the Lottie runtimes, gl-transitions, `xfade` and the tested filter fragments. Intake rules are in [the open-source radar](open-source-radar.md#intake-policy).

**Method and limits.** GitHub HTML pages and the API returned HTTP 403 from this session, so newest-commit dates for GitHub-only repositories are **(unverified)**. Where a row says "npm" or "PyPI", the maintenance score uses the newest registry publish date as a proxy for the newest commit, and the row says so. Licence text is quoted from a raw LICENSE file or from the LICENSE inside the npm or PyPI tarball. Those tarballs were downloaded to a scratch directory and read only, never installed or run. Items marked **(unverified)** came from search snippets or were not opened.

## Recommendation

1. **The gap is not filled by a verified permissive source.** No open motion-preset pack with a checked licence (titles, lower thirds, callouts or transitions as ready templates) turned up. The usable free sources supply easing curves and CSS keyframe data. Presets built on that data would be ours to author and license.
2. **ADOPT Open Props (MIT)** as vendored easing and animation token data. Its published CSS holds named `cubic-bezier` curves. Score 90.
3. **ADOPT bezier-easing (MIT)** as a vendored 74-line cubic-bezier solver for user-defined curves. Score 91. Install with `--ignore-scripts` if it is ever a dependency.
4. **Transitions:** the CC0 Universal Transition Shader is a MAYBE spike, because it is Godot GDShader code and would need a GLSL port with its own runtime. Stock FFmpeg cannot run it. cut-fx (MIT) is a MAYBE spike, blocked on two transitive licences.
5. **Lottie:** no CC0 or MIT motion pack found. The CC BY 4.0 lottie-docs samples are test fixtures at most. LottieFiles' free animations use a custom licence and must not be bundled.
6. **Rejected for licence:** easings.net (GPL-3.0 LICENSE), animate.css (Hippocratic License 2.1 on the repo default branch, while npm says MIT) and the Carbon motion package (install-time telemetry).

## 1. Verdict table

Licence "file" means a LICENSE file was read. "npm" or "PyPI" means only registry metadata was read. Gate numbers refer to the intake policy's hard gates in section 1.

### 1.1 Easing and animation libraries

| Source | Licence (how checked) | Newest publish | Verdict | Reason |
|---|---|---|---|---|
| Open Props 1.7.23 | MIT (npm tarball `package/LICENSE`, file read) | 2026-01-31 | **ADOPT** | Named easing and animation tokens as CSS, no dependencies, no install scripts. See section 2. |
| bezier-easing 3.2.0 | MIT (GitHub LICENSE and npm tarball, both read) | 2026-10-07 | **ADOPT** | Cubic-bezier solver for custom curves. Pure, tiny, no network. See section 2. |
| motion 14.3.0 (Motion, formerly Framer Motion) | MIT (LICENSE.md, file read; `framer-motion` dependency also MIT, npm) | 2026-10-15 | MAYBE | Rubric 83, which is intake-eligible by score. Held because it is a second in-composition animation engine beside anime.js, which is already chosen. Needs a human (section 5). Transitive dependencies not scanned for telemetry. |
| d3-ease 3.0.1 | BSD-3-Clause (LICENSE, file read; includes Robert Penner's copyright line) | 2021-06-05 | REJECT | Gate 6: no commit or publish within 12 months. The formulas are short and may be rewritten with tests, without the package. |
| @tweenjs/tween.js 25.0.0 | MIT (LICENSE, file read; Penner equation notice included) | 2024-07-26 | REJECT | Gate 6. Stale. |
| easings.net (repo `ai/easings.net`) | **GPL-3.0** (LICENSE, file read) | n/a | REJECT | Gate 1: strong copyleft. The curve values are standard, but do not copy the code. |
| Carbon motion 11.54.0 (`@carbon/motion`) | Apache-2.0 (LICENSE, file read) | 2026-10-07 | REJECT | Its `postinstall` runs `ibmtelemetry` with a `telemetry.yml` that posts to a remote endpoint. Gates 2 and 3 fail. |
| @motionone/easing and utils 10.18.0 | MIT (npm) | 2024-06-02 | REJECT | Gate 6. Stale. |
| popmotion 11.0.5 | MIT (npm) | 2022-08-15 | REJECT | Gate 6. Superseded by motion, same author. |
| easing-utils 1.0.0 | MIT (npm) | 2023-03-02 | REJECT | Gate 6. Stale. |
| eases 1.0.8 | MIT (npm) | 2015-10-07 | REJECT | Gate 6. Stale. |
| mo-js 0.288.2 | MIT (npm) | 2017-08-30 | REJECT | Gate 6. Stale. |
| @formkit/auto-animate 0.10.0 | MIT (npm) | 2026-07-10 | REJECT | Passes the gates but animates DOM list changes in the editor UI. It does not render video. Fit fails. |

### 1.2 CSS animation libraries

| Source | Licence (how checked) | Newest publish | Verdict | Reason |
|---|---|---|---|---|
| animate.css 4.1.1 | **Contradictory.** npm tarball LICENSE: MIT (file read). Repo `main` LICENSE: Hippocratic License 2.1 (file read) | 2020-09-07 | REJECT, escalate | Policy section 3: a mismatch between file and metadata escalates. Hippocratic 2.1 is not on the allow-list. Stale as well. |
| Motion UI 2.0.8 (zurb) | MIT (repo master LICENSE, file read) | 2024-09-26 (npm) | REJECT | Gate 6 on the npm proxy. GitHub activity **(unverified)**. Its CSS presets duplicate Open Props tokens. |
| AOS 2.3.4 | MIT (npm) | 2018-10-03 | REJECT | Gate 6. Stale. Scroll reveals, not video motion. |
| hover.css 2.3.2 | No licence in npm metadata | 2018-06-11 | REJECT | Gates 1 and 6. No licence means all rights reserved. |

### 1.3 Transition packs and shaders

| Source | Licence (how checked) | Newest publish or commit | Verdict | Reason |
|---|---|---|---|---|
| Universal Transition Shader (`cashew-olddew/Universal-Transition-Shader`) | **CC0-1.0** (LICENSE on master, file read) | **(unverified)**; 24 commits (page) | MAYBE, spike | Single Godot shader file `transition.gdshader`. It needs a GLSL port and a GL runtime, which stock FFmpeg lacks. Duplicates the gl-transitions plugin tier already in the effects note. Score about 64. |
| cut-fx 0.1.5 (PyPI) | MIT (repo LICENSE, file read) | PyPI upload 2026-07-04 | MAYBE, spike blocked | Claims 559 named transitions across four backends (PyPI description, **unverified** count). Transitive packages: `video-arrange` and `web-overlay` have no licence field (classifier only); the `lyrics` extra pulls `lyric-sync`, which is marked **Proprietary**. Stock `xfade` already covers 58 names. Score about 67. |
| ffcreatorlite 2.5.1 | MIT (repo `master` LICENSE, file read) | 2023-03-04 (npm) | REJECT | Gate 6. Stale. Its FFmpeg-driven transitions are a reference only. |
| gl-transitions and xfade-easing | Covered in the [effects note](oss-effects-and-transitions.md) | n/a | (not repeated) | |

### 1.4 Lottie and motion-preset packs

| Source | Licence (how checked) | Newest publish | Verdict | Reason |
|---|---|---|---|---|
| lottie-docs example animations | **CC BY 4.0** per the Qt documentation page (fetched) and the repo README (WebFetch). The repo root LICENSE returned 404 on `main` and `master` | (unverified) | MAYBE | Attribution-licence asset class allowed in the policy, but no LICENSE file was found. Use only as test fixtures for the Lottie preview, with credit. Confirm each file's licence first. |
| LottieFiles free animations | "Lottie Simple License": custom, not SPDX (help-center page and licence wording differ; the help centre says no standalone redistribution, the licence text says the same terms must travel with any distributed file; creator terms vary) **(search-result summary, unverified)** | n/a | REJECT for bundling, escalate for use | Gate 1 (non-SPDX licence). See section 5. |
| Fluent Emoji animated (`microsoft/fluentui-emoji-animated`) | MIT (LICENSE, file read; "Copyright (c) Microsoft Corporation") | (unverified) | MAYBE, subset only | Animated 256 px PNGs, not Lottie. Stored in Git LFS. The full set is about 5 GB **(search-result summary, unverified)**, far above the 500 MB download cap. A small curated subset could pass. Low value for a title or lower-third editor. |
| Premation (open-source motion editor) | **Not verified** (search summary only) | n/a | REJECT (unverified) | An editor application, not a preset library. |
| LottieFiles Motion Presets | Product inside a proprietary creator tool | n/a | REJECT | Not open source. Useful only as a list of preset categories (in, highlight, out). |
| pixi-after-effects; lottie-interactive | MIT per search summary **(unverified)** | 2023-01 and 2022-12 per search summary **(unverified)** | REJECT | Gate 6. Stale runtimes, not packs. |

### 1.5 Stale or rejected, grouped

| Source | Reason |
|---|---|
| @lottiefiles/lottie-player 2.0.12 (MIT, npm, 2024-11-04) | Gate 6. Playback only. Already covered by dotLottie-web in the animation note. |
| lowerthird 0.0.3 (Apache-2.0, LICENSE file read; npm 2022-06-05) | Gate 6. Its `record-page` dependency (MIT, npm 2020-03-17) starts headless Chrome. Output is a green-screen video, which duplicates the HyperFrames overlay plan. |
| hermes (JosephusPaye) | MIT per search summary, but no LICENSE at `main` or `master` (404 both). Gate 1: no verifiable licence file. |

## 2. ADOPT: licence text and vendoring

Neither ADOPT candidate needs a runtime plugin. Both are data or pure functions, so each is vendored into the repository with its licence kept. Engine integration is the lead's decision and is not written here.

### 2.1 Open Props 1.7.23

- **Licence text, exact location:** the LICENSE file at the root of the npm tarball `https://registry.npmjs.org/open-props/-/open-props-1.7.23.tgz`, path `package/LICENSE`. Its content is "MIT License, Copyright (c) 2021 Adam Argyle". The GitHub raw path `main/LICENSE` and `master/LICENSE` returned 404, so the tarball is the only copy read.
- **Hashes:** LICENSE SHA-256 `fed3aa342094f6bb33701d09133c159a4c124e509ede255a889dd2c28ec3ab6e`. Tarball SHA-256 `b251723ca5b16660b4c97980b17b39d7c8cb6c8df6c39a6deaf439362027437f`. npm integrity `sha512-+xyrJmxV9QUBFbSwPROYhOg/FLXry+uuPr4R+B5EaE4556Oc18/8ZC/fL5A+/lbRSwNvA0Alh+C0KpyFWLmLZg==`.
- **Content used:** `easings.min.css` defines `--ease-1` to `--ease-5`, `--ease-in-*`, `--ease-out-*` and `--ease-in-out-*` as `cubic-bezier` values, for example `--ease-out-3: cubic-bezier(0,0,.3,1)`. `animations.min.css` and `durations.min.css` are present but were not read in full.
- **Security:** no lifecycle scripts, no dependencies. The compiled `dist/open-props.js` has no `fetch`, XHR or `eval`. The source files `src/props.colors.src.js` and `src/props.gradients.src.js` fetch remote JSON at build time. Do not run the build. Vendor only the published CSS.
- **Score:** licence 20, maintenance 12 (npm publish 2026-01-31, within 12 months, not within 6; repo commits **unverified**), security 20, footprint 15 (two CSS files), fit 15 (named easing set is a real gap), quality 8 (versions, tests script, README, install docs; no reproducible-build evidence). Total **90**.
- **Use:** CSS values are the source for named easing presets. They do not run in FFmpeg. Converting a `cubic-bezier` to an expression is a separate step (section 4).

### 2.2 bezier-easing 3.2.0

- **Licence text, exact location:** `https://raw.githubusercontent.com/gre/bezier-easing/master/LICENSE` (fetched), and the tarball `https://registry.npmjs.org/bezier-easing/-/bezier-easing-3.2.0.tgz` at `package/LICENSE`. Both read "MIT License, Copyright (c) 2014 Gaëtan Renaudeau".
- **Hashes:** tarball LICENSE SHA-256 `32bfd1097d45b41ca6792bf07b389b26ee4045e7f7db28349f4199eef889c516`. Tarball SHA-256 `5a34c0659363b49e13e9322a556622ee84856c61758e29e42f5199a182703658`. npm integrity `sha512-QOKIYCgHd06gsQg0G9k1/JnzzZ+PT99qqUmgRHQ+r5PI/gsjCn0l7LXW6gtXoPhVJviIjP01xg9E7eNime9fVw==`.
- **Security:** no runtime dependencies. One `prepublish` script builds `dist/` and runs at publish time, so install with `--ignore-scripts` and use the prebuilt `dist/`. `src/index.js` (74 lines) contains no `fetch`, XHR or `eval`.
- **Score:** licence 20, maintenance 20 (npm publish 2026-10-07), security 15 (one script present), footprint 15, fit 15 (custom curves are a gap), quality 6 (versions, test script, README). Total **91**.
- **Use:** vendoring the 74-line source with its LICENSE is simpler than a dependency. Solver results feed the UI curve preview, and the export side needs the expression step in section 4.

## 3. MAYBE: detail and what would decide each

- **motion (MIT).** Licence MIT (LICENSE.md, read). npm 14.3.0, 2026-10-15. Rubric about 83: licence 20, maintenance 20, security 15 (transitive `framer-motion` and `tslib` not scanned for telemetry), footprint 15 (about 900 KB `dist`), fit 5 (second in-composition engine beside anime.js), quality 8. The score is intake-eligible, but choosing between two animation engines is a design decision (AGENTS.md: decide before building). Decision needed: keep anime.js only, or adopt motion for React-side previews.
- **Universal Transition Shader (CC0).** The CC0 LICENSE is read. Maintenance is unknown because the commit date is **(unverified)**. Score about 64, spike band. A spike would port `transition.gdshader` to GLSL, run it in a test harness outside the repo, and measure it. Its output would be a plugin, not stock FFmpeg.
- **cut-fx (MIT).** Only the top-level LICENSE is read. Blockers before any spike: confirm the licences of `video-arrange` and `web-overlay` (classifier says MIT, licence field empty), do not install the `lyrics` extra (`lyric-sync` is Proprietary on PyPI), and count the transitions **(unverified)**. Score about 67, spike band.
- **lottie-docs examples (CC BY 4.0).** Read the repo's LICENSE file before any use. The root file returned 404. Use the files as preview test fixtures only, with attribution in a NOTICE.
- **Fluent Emoji animated (MIT).** Subset only. Any subset needs a size check against the 500 MB cap and a human decision on whether emoji suit the product.

## 4. Gap that remains for the renderer (not solved here)

- FFmpeg has closed-form ease-out for cubic curves (the [recipes note](ffmpeg-animation-recipes.md), section 1.2). It has no built-in `cubic-bezier` function. The Open Props curves and the bezier-easing solver need a sampled form, for example a piecewise-linear table compiled into a nested `if()` or a `lerp` chain. That approach is **unverified** here. A sample-accurate test against the solver would be needed before shipping.
- A preset library of our own (JSON presets that reference named curves and existing overlay filters) avoids third-party licence terms entirely. This is the most practical route to the gap.

## 5. Needs a human

1. **Motion or not (section 3).** Adopt motion, or keep anime.js alone. A scout cannot make this choice under AGENTS.md.
2. **animate.css licence contradiction.** The repo's `main` LICENSE is Hippocratic License 2.1, and npm 4.1.1 says MIT. Escalate if anyone wants this library. Current verdict is REJECT.
3. **LottieFiles free animations.** The "Lottie Simple License" is not SPDX. Its terms on redistribution differ between the help centre and the licence wording, and creator terms vary per file. Escalate before any runtime use of LottieFiles files.
4. **cut-fx transitive licences.** Two packages lack a licence field and one extra is Proprietary. A human or the next scout must resolve these first.
5. **Premation.** Licence not verified. Escalate only if the project considers it.
6. **Fluent Emoji subset.** Needs a product decision and a measured size.

## Sources

Fetched (raw or direct):
- https://raw.githubusercontent.com/ai/easings.net/master/LICENSE (GPL-3.0)
- https://raw.githubusercontent.com/animate-css/animate.css/main/LICENSE (Hippocratic License 2.1)
- https://raw.githubusercontent.com/d3/d3-ease/main/LICENSE (BSD-3-Clause)
- https://raw.githubusercontent.com/motiondivision/motion/main/LICENSE.md (MIT)
- https://raw.githubusercontent.com/zurb/motion-ui/master/LICENSE (MIT)
- https://raw.githubusercontent.com/tweenjs/tween.js/main/LICENSE (MIT)
- https://raw.githubusercontent.com/carbon-design-system/carbon/main/LICENSE (Apache-2.0)
- https://raw.githubusercontent.com/gre/bezier-easing/master/LICENSE (MIT)
- https://raw.githubusercontent.com/cashew-olddew/Universal-Transition-Shader/master/LICENSE (CC0-1.0)
- https://raw.githubusercontent.com/tomastimelock/cut-fx/main/LICENSE (MIT)
- https://raw.githubusercontent.com/drawcall/ffcreatorlite/master/LICENSE (MIT)
- https://raw.githubusercontent.com/ciberado/lowerthird/master/LICENSE (Apache-2.0) and `package.json`
- https://raw.githubusercontent.com/microsoft/fluentui-emoji-animated/main/LICENSE (MIT) and `README.md`
- Npm and PyPI registry JSON: open-props, bezier-easing, @carbon/motion, d3-ease, motion, framer-motion, @tweenjs/tween.js, animate.css, motion-ui, hover.css, aos, @formkit/auto-animate, @motionone/easing, @motionone/utils, popmotion, easing-utils, eases, mo-js, @lottiefiles/lottie-player, ffcreatorlite, lowerthird, record-page; PyPI cut-fx, video-arrange, audio-arrange, lyric-sync, web-overlay.
- Npm tarballs downloaded to a scratch directory, read, and not installed: open-props 1.7.23, bezier-easing 3.2.0, @carbon/motion 11.54.0, d3-ease 3.0.1, motion 14.3.0, @tweenjs/tween.js 25.0.0, animate.css 4.1.1.
- WebFetch: https://doc.qt.io/QT-6/qtlottieanimation-attribution-lottiedocs-examples.html (CC BY 4.0 statement); https://github.com/cashew-olddew/Universal-Transition-Shader (24 commits, CC0, file list); https://github.com/LottieFiles/lottie-docs (README "CC-BY 4.0", no LICENSE file read).

Search results only (not opened, cited as pointers):
- LottieFiles help centre pages on the Lottie Simple License and commercial use (https://help.lottiefiles.com/hc/en-us/articles/900002438343-Can-I-use-a-free-animation-on-Lottiefiles-for-commercial-business-use).
- Fluent Emoji animated size (about 5 GB) and Premation licence (summary only).
- pixi-after-effects and lottie-interactive activity dates (summary only).
- Universal Transition Shader and cut-fx were also found by search; their licence and activity claims above were then checked by fetch.
