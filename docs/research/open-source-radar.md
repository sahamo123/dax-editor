---
type: Research
title: Open-source radar and intake policy
description: Twenty open-source projects for AI video editing, creator tools and generators, checked against their LICENSE files and commit dates, plus the autonomous intake policy a scout agent must follow before adopting a tool.
tags: [research, open-source, licensing, radar, intake, supply-chain]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T19:14:51Z
---

# Research: open-source radar and intake policy

Written 2026-10-18. Topic C (the radar) comes first, then the intake policy for Topic B under [Intake policy](#intake-policy). The plugin model that these tools would plug into is in [plugin architecture](/research/plugin-architecture.md).

**Method.** Licences come from each repository's LICENSE file (`blob/HEAD/LICENSE`, or COPYING or LICENSE.txt where that was the name), fetched directly. Activity comes from the `commits/<branch>.atom` feed, which gives the newest commit timestamp. GitHub's REST API returned HTTP 403 from this session, so star counts come from the HTML pages and are approximate. Hacker News results come from the Algolia search API. Items marked **(unverified)** were not checked against a primary source. A licence marked "page label" came from the repository page, not from a fetched LICENSE file. The sources are at the end.

## 1. Top 20

| # | Project | Licence (file checked) | Newest commit seen | What to learn or add |
|---|---|---|---|---|
| 1 | [auto-editor](https://github.com/WyattBlue/auto-editor) | Unlicense (LICENSE) | 2026-10-18 | Cuts silence and dead air from the command line. Candidate `analysis` plugin for "remove silences". Public domain, no attribution needed. |
| 2 | [OpenChatCut](https://github.com/0xsline/OpenChatCut) | AGPL-3.0 (LICENSE) | 2026-10-18 | The closest competitor. Learn the draft-approve flow, already summarised in [OpenChatCut learnings](/research/openchatcut-learnings.md). Never copy code. The AGPL network clause makes hosting a modified copy a trap. |
| 3 | [OpenCut](https://github.com/OpenCut-app/OpenCut) | MIT (LICENSE) | 2026-09-24 | A large browser-based CapCut alternative (about 95k stars on the page). The README says it is being rewritten and does not yet accept outside contributions. Watch it; do not depend on it. |
| 4 | [Kdenlive](https://github.com/KDE/kdenlive) | GPL-3.0 (COPYING) | 2026-10-18 | Mature MLT-based editor. Learn the timeline UX and its MLT project format for interchange. GPL: use only as a separate, user-installed program. |
| 5 | [Shotcut](https://github.com/mltframework/shotcut) | GPL-3.0 (COPYING) | 2026-10-18 | Filter and keyframe UI on top of MLT. Same rule as Kdenlive. |
| 6 | [MLT](https://github.com/mltframework/mlt) | LGPL-2.1 (COPYING) | 2026-10-18 | The engine under Shotcut and Kdenlive. LGPL-2.1 allows a dynamic library or a separate process (AGENTS.md). Evaluate as an effects engine beyond FFmpeg filters; do not assume it fits. |
| 7 | [OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO) | Apache-2.0 (LICENSE.txt) | 2026-10-17 | Timeline interchange with format adapters. The natural base for `importer` and `exporter` plugins, so we do not write every NLE format ourselves. |
| 8 | [palmier-pro](https://github.com/palmier-io/palmier-pro) | GPL-3.0 source (LICENSE). Repo page says binaries after v0.7.6 are proprietary. | 2026-10-05 | A macOS AI editor (about 14.6k stars on the page; Apple Silicon, macOS 26 or later). Learn that a GPL source tree with closed binaries is a licence question. The repo no longer accepts code contributions. Intake verdict: reject, escalate. |
| 9 | [Motion Canvas](https://github.com/motion-canvas/motion-canvas) | MIT (LICENSE) | 2026-07-02 | Animations written as TypeScript programs. Candidate animation renderer; learn its player and renderer split. Activity has slowed. |
| 10 | [HyperFrames](https://github.com/heygen-com/hyperframes) | Apache-2.0 (LICENSE) | 2026-10-18 | HTML and GSAP rendered to video. [ADR 0004](/adr/0004-free-only-no-remotion.md) names it as the later optional motion-graphics plugin. It needs headless Chrome, so it is a separate download. |
| 11 | [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | MIT (LICENSE) | 2026-10-12 | Local speech-to-text in C and C++, with a CLI. First `stt` plugin candidate. Model weights need their own licence check (**unverified** here). |
| 12 | [WhisperX](https://github.com/m-bain/whisperX) | BSD-2-Clause (LICENSE) | 2026-10-18 | Word-level alignment, which gives caption timing. Learn the alignment step. Check its PyTorch and alignment-model dependencies at intake, since the footprint is large. |
| 13 | [Piper, now piper1-gpl](https://github.com/OHF-Voice/piper1-gpl) | GPL-3.0 (page label; LICENSE file not fetched, 404 at paths tried) | 2026-10-17 | The successor to rhasspy/piper, which the repo page says was archived read-only on 2025-10-06 (MIT). The MIT line is frozen. Learn that upstream moves can change licence. Use the archived MIT release only if pinned, or run the GPL successor as a user-installed program. |
| 14 | [Kokoro](https://github.com/hexgrad/kokoro) | Apache-2.0 (LICENSE); README says weights are Apache-licensed | 2025-08-06 | A small (82M parameter) local TTS and a good default voice. Stale: the newest commit is about 14 months old. Adopt only with a maintained fork or a pinned, tested release, and check the weight format. |
| 15 | [Chatterbox](https://github.com/resemble-ai/chatterbox) | MIT (LICENSE) | 2026-07-21 | Voice-cloning TTS, an alternative to hosted voice services. Cloning triggers the consent escalation in the policy below. |
| 16 | [F5-TTS](https://github.com/SWivid/F5-TTS) | Code MIT (README); pretrained weights CC-BY-NC (README) | 2026-10-14 | **Licence trap.** The code is fine; the weights are non-commercial. Reject for default install. |
| 17 | [ComfyUI](https://github.com/comfyanonymous/ComfyUI) | GPL-3.0 (LICENSE) | 2026-10-18 | A widely used node-graph runtime for open image and video models. Learn graph-as-data. Do not adopt its custom-node install model (see [plugin architecture, section 8](/research/plugin-architecture.md#8-supply-chain-risks-and-realistic-mitigations)). |
| 18 | [Wan2.1](https://github.com/Wan-Video/Wan2.1) | Apache-2.0 (LICENSE.txt); weights licence not checked (**unverified**) | 2026-03-05 | An open text and image to video generator, a candidate for a local `generator` plugin. Heavy GPU needs. Check the weight licence on the model card before intake. |
| 19 | [OpenFX](https://github.com/AcademySoftwareFoundation/openfx) | BSD-3-Clause (LICENSE.md) | 2026-10-15 | The standard effect-plugin API. Mirror its vocabulary (inputs, clips, parameters) for `effect` manifests. Do not load native plugins into our process. |
| 20 | [Kiwi-Edit](https://github.com/showlab/Kiwi-Edit) | MIT (LICENSE) | 2026-05-13 | Instruction-guided video editing from natural language: the nearest research match to prompt-driven editing. The README does not state a weights licence, so treat the weights as unverified and escalate. |

**Also seen, not in the top 20:**

- [faster-whisper](https://github.com/SYSTRAN/faster-whisper): MIT (LICENSE). Activity not fetched. A second `stt` candidate.
- [OpenShot](https://github.com/OpenShot/openshot-qt): GPL-3.0 (COPYING). Its COPYING adds an exception for non-GPL components including FFmpeg and libopenshot. Hacker News posted version 4.0 on 2026-08-31 (603 points).
- [Revideo](https://github.com/redotvideo/revideo): MIT (LICENSE). Its LICENSE carries a 2022 Motion Canvas copyright line, which fits a fork. **Fails the no-telemetry rule as shipped:** the README says renders are counted via PostHog, opt-out with `DISABLE_TELEMETRY=true`.
- [Coqui TTS](https://github.com/coqui-ai/TTS): MPL-2.0 per the repo page label. Activity not dated. The XTTS model licence is the Coqui Public Model License, which is non-commercial; this is seen only in the Hugging Face docs example for XTTS-v1 (fetched), and the current XTTS version is **(unverified)**.
- [LTX-Video](https://github.com/Lightricks/LTX-Video): Apache-2.0 code (LICENSE). Weight terms not checked (**unverified**).
- HunyuanVideo: its LICENSE.txt was not fetched and the page shows no label. **Unverified**; escalate if considered.
- Hacker News items (search API, fetched): Palmier Pro (2026-07-23, 191 points, the same project as #8); the [fal video starter kit](https://github.com/fal-ai-community/video-starter-kit) (2025-01-23, 268 points), which calls hosted models and whose licence was not checked; and an agentic editor using a hosted LLM API, licence not checked.

## 2. What the radar shows

**2.1 Libraries are permissive; editors are GPL.** Almost every complete editor is GPL-3.0 (Kdenlive, Shotcut, OpenShot, palmier-pro, ComfyUI). Libraries and format tools are MIT, BSD or Apache (OpenTimelineIO, Motion Canvas, OpenFX, whisper.cpp). The plan follows: learn from the editors, depend on the libraries, and never link GPL code.

**2.2 Licence traps found in this pass:**

- Code MIT, weights non-commercial: F5-TTS.
- Source GPL, binaries closed: palmier-pro. The GPL forbids further restrictions (section 10 of the licence text, fetched), so a closed binary of GPL code needs a closer look. Its status is **unverified** until the maintainers say which components are closed.
- Archived MIT project succeeded by a GPL fork: Piper.
- Telemetry on by default with an opt-out: Revideo.
- Code verified permissive, weight terms still open: Chatterbox and Kokoro. Their weight terms need the check in section 4 of the intake policy before intake.

**2.3 Stars are not evidence.** OpenCut has about 95k stars on the page and no outside contributions. Activity and the licence file matter more.

## Intake policy

This section is the rulebook for a scout agent. It implements the AGENTS.md rule that dependencies must be permissive or LGPL used as a separate process, and [ADR 0004](/adr/0004-free-only-no-remotion.md) on free-only dependencies. Where this policy is stricter than those documents, the stricter rule applies.

**Scope.** Applies to any new code, model, font, dataset, template or binary the project would download, bundle or call.

### 1. Hard gates (any failure stops intake)

1. Licence on the allow-list (section 2) for the code **and** for each model, font, dataset and asset it would use.
2. No telemetry or phone-home (section 5).
3. No code fetched or executed at install or run time (section 5).
4. Every artifact pinned by version and SHA-256 (section 5).
5. Within the size and resource caps (section 6).
6. Not archived, not moved to a successor with a different licence, and newest commit within 12 months, or a pinned, small surface with a maintained fork (section 4).

### 2. Licence allow-list (SPDX identifiers)

| Class | SPDX ids | How we may use it |
|---|---|---|
| Permissive | MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, Unlicense, 0BSD | Bundle, link, vendor with the NOTICE kept |
| Public domain or CC0 | CC0-1.0 | Bundle code, data, templates |
| Attribution licences for assets | CC-BY-4.0, OFL-1.1 (fonts) | Bundle with licence file and attribution in the manifest |
| Weak copyleft | LGPL-2.1-only, LGPL-2.1-or-later, LGPL-3.0-only | Dynamic library or separate process only, never statically linked |
| Strong copyleft | GPL-2.0-only, GPL-3.0-only, GPL-3.0-or-later, AGPL-3.0-only | Never bundled or linked. Separate, user-installed program only, and a human decides. AGPL: never run as a network service |
| File-level copyleft | MPL-2.0 | Human decision; may only be used unmodified or in a separate module |
| Review | Anything not listed, or any `LicenseRef-` | Escalate |
| Deny | CC-BY-NC-*, "research only", "non-commercial", OpenRAIL-* and other behavioural use restrictions, community model licences with use restrictions, licences with territory exclusions or user-count limits, BUSL, SSPL, Elastic-2.0, Commons Clause, "no licence" (all rights reserved) | Reject. Do not ask for an exception |

### 3. Verifying a licence

1. Fetch the LICENSE, COPYING or LICENSE.txt file from the default branch. Record its URL and SHA-256 in the radar entry. If the repo page label and the file disagree, escalate.
2. Check package metadata (`package.json` `license`, `pyproject.toml` `license`, Cargo `license`). It must agree with the file. A mismatch escalates.
3. Check for a NOTICE file and any third-party licence list. Copy both into the plugin if the licence requires it.
4. If the licence file is missing, reject. Silence means all rights reserved.

### 4. Model weights, data and assets

- Weights have their own licence. Read the model card YAML `license` field and the model repo's LICENSE file (Hugging Face model cards use `license: other` with `license_name` and `license_link` for custom terms, per fetched [model card docs](https://huggingface.co/docs/hub/model-cards)).
- `gated: true` or "accept the terms" means a person must accept terms on an account. That needs a human (section 9).
- Training data can restrict use even if the weights are permissive. Example: the F5-TTS README ties its CC-BY-NC weights to the Emilia dataset. Treat dataset licences as inherited.
- Unknown weight licence: reject for default install, escalate for an optional one.
- Weight file formats: accept `safetensors` and ONNX. Anything that executes code on load (pickle-based `.pt`, `.pth`, `.bin`, `.ckpt`) escalates. Models that need `trust_remote_code` escalate.

### 5. Security checks

- **Telemetry.** Search the source and dependency tree for `telemetry`, `posthog`, `sentry`, `segment`, `mixpanel`, `google-analytics`, `amplitude`, `datadog`, and for outbound requests made at import. Opt-out telemetry counts as telemetry. Any present or unclear result escalates.
- **Code fetched at run time.** Reject `pip install` or `npm install` at runtime, `git clone` at runtime, custom-node managers, and any `eval` or `exec` of downloaded text.
- **Install scripts.** Reject npm lifecycle scripts beyond what the lockfile pins, and Python source distributions that run `setup.py` code. Install with `npm ci --ignore-scripts` and `pip install --require-hashes --only-binary :all:`.
- **Typosquats.** Compare the new name with existing names and well-known registry names. Edit distance 2 or less, confusable characters, or a suffix such as `-plugin`, `-sdk`, `-cli` on a known name means a human decision.
- **Obfuscation.** Reject minified or encoded code in a repo that presents itself as source, base64 blobs over 1 KB, and binary blobs without a source build.
- **Dependency scan.** Run an OSV scan on the lockfile. Known malicious or critical advisories reject.
- **Downloads.** https only, from declared hosts, SHA-256 checked before the file is moved into place.
- **Run in a separate process** with the permissions in the plugin manifest, as described in the plugin architecture document.

### 6. Size and resource caps

| Resource | Default cap without escalation | Escalate above |
|---|---|---|
| Download per plugin | 500 MB | 500 MB |
| Installed disk per plugin | 1 GB | 1 GB |
| Model weights, total | 2 GB | 2 GB |
| Runtime RAM (CPU) | 2 GB | 2 GB |
| Runtime GPU VRAM (optional) | 8 GB | 8 GB |
| Cold start | 30 s | 30 s |

Measure at the spike on the reference machine and record the numbers in the radar entry. A plugin whose footprint is more than twice the cap is rejected, not escalated.

### 7. Scoring rubric

Score only after all hard gates pass. The score ranks, but never overrides a gate.

| Criterion | Points | Scoring |
|---|---|---|
| Licence clarity | 20 | File and metadata agree, allow-list class, NOTICE present |
| Maintenance | 20 | Newest commit within 6 months: 20. Within 12 months: 12. Otherwise 0. Archived or moved: 0 |
| Security surface | 20 | Start at 20; deduct 5 for each: install scripts, runtime fetch, network at runtime, native binary from a download, pickle model |
| Footprint | 15 | Under half the caps: 15. Under the caps: 8. Otherwise 0 |
| Fit | 15 | Fills a capability gap: 15. Duplicates an existing plugin: 5 |
| Quality | 10 | Release tags, tests, examples, documented install, reproducible build (2 points each) |

Thresholds: 75 or more opens an intake pull request that may auto-merge if no escalation trigger fires. 60 to 74 is a spike only: a draft pull request that needs a human to review. Below 60 is rejected and recorded in the radar.

### 8. Steps

1. **Radar entry.** Add a row to this file or a successor radar document: name, URL, licence file URL and SHA-256, newest commit date, purpose, capability, verdict. Cite every URL fetched.
2. **Spike.** Work in a new empty directory outside the repo, never in the repo itself. Fetch the pinned commit. Read the LICENSE and scan for telemetry. Install with the flags in section 5, with no secrets in the environment. Run the upstream example if it has one. Record size, RAM, cold start and the artifact hash.
3. **Plugin wrapper.** A new folder `plugins/<id>/` with `plugin.json`, the adapter, fixtures and the NOTICE. Do not vendor upstream code unless the licence allows it and the NOTICE is copied.
4. **Tests.** Offline contract tests: manifest schema, handshake, timeout kill, rejected path escape, hash mismatch refused, golden output within a tolerance. Generate media with FFmpeg `lavfi`, never commit video, and never hit the network (AGENTS.md test rules).
5. **Docs.** Update the radar row. Add a concept for a new durable fact. Write an ADR only for a new capability type or a new precedent. Add a log entry, run `pnpm docs:index` and `pnpm docs:okf`.
6. **Pull request.** Title in Conventional Commit form, for example `feat(plugins): add tts-kokoro`. The body gives the reason for the dependency (required by AGENTS.md), the licence evidence with URLs and hashes, scan results, measured footprint and the score. CI runs the hard gates. Merge only through the gates, never by pushing to main.

### 9. Always escalate to a human

- Licence unclear, missing, non-SPDX, contradictory, or any `LicenseRef-`.
- Any non-commercial, research-only, behavioural-restriction or custom model licence, even as an option.
- Network access beyond the declared download hosts, or a request from a plugin for network at runtime.
- Credentials, API keys, accounts, or a gated model that needs someone to accept terms.
- Anything that executes downloaded code: install scripts, custom nodes, `trust_remote_code`, pickle-based model loads, native binaries from a download.
- Telemetry present or unclear.
- Strong copyleft (GPL, AGPL) of any kind, or MPL-2.0.
- Size or RAM above the caps.
- Voice cloning, face or likeness models, or anything that imitates a real person. These need a consent review.
- Typosquat suspicion, a changed publisher, a moved or archived repo.
- Any change to CI, secrets, branch protection, the permissions model, or the core engine. AGENTS.md forbids agents from making these changes.
- Conflicts with [ADR 0004](/adr/0004-free-only-no-remotion.md) or [ADR 0006](/adr/0006-draft-approve-for-external-agents.md).
- Maintainers say they are not accepting contributions, or the project is being rewritten.

### 10. Records

Each intake leaves a radar row, a log entry and, if escalated, an issue link. The log is append-only ([knowledge protocol](/engineering/knowledge-protocol.md)). Rejections are recorded too, so the next scout does not repeat the work.

## Sources

Fetched in this session (2026-10-18):

- https://github.com/WyattBlue/auto-editor and https://github.com/WyattBlue/auto-editor/blob/master/LICENSE
- https://github.com/0xsline/OpenChatCut and https://github.com/0xsline/OpenChatCut/blob/HEAD/LICENSE
- https://github.com/OpenCut-app/OpenCut and https://raw.githubusercontent.com/OpenCut-app/OpenCut/main/LICENSE
- https://github.com/KDE/kdenlive and https://github.com/KDE/kdenlive/blob/master/COPYING
- https://github.com/mltframework/shotcut/blob/HEAD/COPYING
- https://github.com/mltframework/mlt/blob/HEAD/COPYING
- https://github.com/AcademySoftwareFoundation/OpenTimelineIO/blob/HEAD/LICENSE.txt
- https://github.com/palmier-io/palmier-pro and https://github.com/palmier-io/palmier-pro/blob/main/LICENSE
- https://github.com/motion-canvas/motion-canvas/blob/HEAD/LICENSE
- https://github.com/heygen-com/hyperframes/blob/HEAD/LICENSE
- https://github.com/ggml-org/whisper.cpp/blob/HEAD/LICENSE
- https://github.com/m-bain/whisperX/blob/HEAD/LICENSE
- https://github.com/SYSTRAN/faster-whisper/blob/HEAD/LICENSE
- https://github.com/OHF-Voice/piper1-gpl and https://github.com/OHF-Voice/piper1-gpl/commits/main.atom
- https://github.com/rhasspy/piper (archive notice)
- https://github.com/hexgrad/kokoro/blob/main/LICENSE
- https://github.com/resemble-ai/chatterbox/blob/HEAD/LICENSE
- https://github.com/SWivid/F5-TTS
- https://github.com/comfyanonymous/ComfyUI/blob/HEAD/LICENSE
- https://github.com/Wan-Video/Wan2.1/blob/HEAD/LICENSE.txt
- https://github.com/AcademySoftwareFoundation/openfx (LICENSE.md via raw URL)
- https://github.com/showlab/Kiwi-Edit and https://github.com/showlab/Kiwi-Edit/blob/main/LICENSE
- https://github.com/Lightricks/LTX-Video/blob/HEAD/LICENSE
- https://github.com/coqui-ai/TTS
- https://github.com/redotvideo/revideo
- https://github.com/fal-ai-community/video-starter-kit (listed by Hacker News search; repo not opened)
- https://github.com/OpenShot/openshot-qt/blob/HEAD/COPYING
- https://hn.algolia.com/api/v1/search (Hacker News search, read via search API)
- https://spdx.org/licenses/ (identifiers checked; list version 3.29.0)
- https://huggingface.co/docs/hub/model-cards (license and gated metadata)
- https://github.com/motion-canvas/motion-canvas/commits/main.atom and the other `commits/*.atom` feeds listed above

Not fetched, search results only: [OpenShot 4.0 Hacker News item](https://www.openshot.org/blog/2026/08/30/openshot-40-record-edit-color-like-never-before/) and the web search for AI video editor projects.

**Unverified:** Wan2.1 weights licence, LTX-Video weights licence, HunyuanVideo licence, Coqui XTTS-v2 licence, faster-whisper and OpenShot activity, Piper LICENSE file (404 at the paths tried), and the Chatterbox and Kokoro weight terms beyond the README statements.
