---
type: Guide
title: S00.04 performance budgets and baseline receipt
description: Reproducible short browser measurements, proposed targets and resource-monitoring procedures with native and long-session limitations.
tags: [implementation, performance, baseline, evidence]
status: draft
generated:
  by: process:implementer
  at: 2026-11-01T12:30:00Z
---

# S00.04 performance budgets and baseline

**State: VERIFIED**, with a separate self-review; independent stage review remains required. [Issue #127](https://github.com/sahamo123/dax-editor/issues/127), [PR #128](https://github.com/sahamo123/dax-editor/pull/128), tested head `90e5cc604f64ac189d879dcd1db15541f3fe9668`. Before entry, [issue #125](https://github.com/sahamo123/dax-editor/issues/125), [PR #126](https://github.com/sahamo123/dax-editor/pull/126) and tested head `103e2fb4ee39a80e2fc0bfd85a7ddd0ede2769b5` were rechecked against the clean working tree.

## Machine and scope

November 1, 2026: Windows 10.0.26300 x64; Intel i5-8265U, four cores/eight logical processors; 16,950,714,368 bytes installed RAM; Intel UHD Graphics 620; 1920×1080 display with reported 144 DPI (150% Windows scaling); approximately 124 GB free on the C drive at sampling. The planning targets of 16 GB baseline and 32 GB preferred remain targets, not measured minimum requirements. CPU, RAM and display information came from read-only Windows CIM on the normal host; the restricted host denied that query.

The short run used Edge 156.0.4314.50, an isolated real engine process, a 1440×900 browser viewport and generated six-second 1280×720 media. Edge's headless test viewport is not native WebView2 scaling validation. System FFmpeg 9.0.1/ffprobe created the fixture and is not the packaged renderer. A `qwen3.5-2b-q4km` model directory is present locally; inference was not started and installed/working model status was not tested in this step.

## Short measurements and proposed budgets

| Measurement | Proposed p95 target | Recorded sample | Scope and limits |
|---|---:|---:|---|
| Undo command acknowledgement | Under 250 ms | 77.97 ms | Playwright initiates a visible Undo click and waits for its successful HTTP command response. Includes automation/click overhead and response decoding; excludes final visual repaint. |
| Cached 720p scrub | Under 200 ms | 67.70 ms | Actual ruler pointer-down to the media element's `seeked` event; **not** a painted-frame measurement. The source was manually seeded into an isolated test cache; normal production proxies are 480p. |

Each sample is a single run with 15 iterations: three warm-ups, then 12 measured. P95 uses nearest rank: sort the 12 measured durations and take rank `ceil(0.95 × 12)`, the twelfth value. Raw per-iteration monotonic start/end/duration values and proxy metadata are private at `.local/s00-04-edge-720-final-samples.json` (SHA-256 `33ae8b50f9506ff6031a7635a92e856923211ce5c0f2a27aa25428a0d15591b4`). These two sampled boundaries are below the provisional numbers, but do not prove full UI responsiveness, native readiness, sustained performance or that the app itself creates 720p proxies.

The normal media pipeline caps proxies at 480p (`packages/server/src/media-pipeline.ts`). An earlier normal 480p proxy experiment measured acknowledgement p95 96.28 ms and pointer-down-to-`seeked` p95 16.70 ms, under the same 3/12 method; it is a different run. A bundled Chromium attempt failed to decode the proxy. Edge succeeded. A first seeded-720p attempt still loaded the browser's old 480p video; a cache-busting URL forced the new test file before the successful run. These failed/limited attempts are not hidden or counted as successful 720p samples.

## Reproduce safely

The opt-in `apps/desktop/e2e/performance-baseline.spec.ts` starts a fresh temporary engine and generated video, verifies that the cache path is inside that engine's temporary directory, seeds only that test cache, and uses a fresh ignored Playwright output folder. It does not open the user's project. Use a policy-authorized host with a working H.264-capable browser. Set `DAX_PERFORMANCE_BASELINE=1`, `DAX_PERF_RESULT` to a **new** private file path, `PW_CHROMIUM` to the desired browser executable when needed, and `DAX_FFMPEG`/`DAX_FFPROBE` explicitly for the selected toolchain; then run `pnpm --filter @dax/desktop test:performance`. It refuses to overwrite its result. Port 4173 must be free; the performance configuration does not reuse an existing listener. Keep logs, tokens, videos and screenshots private.

## Longer-term collection contract

- Sample the complete owned process tree, including browser/WebView renderers, engine, FFmpeg, local inference and optional Blender, at least every 30 seconds. Record process instance identity/start time to avoid PID reuse; sum live private/working-set bytes per sample and report observed peak and per-child attribution. Record CPU time deltas and GPU counters only where supported; otherwise mark the missing metric BLOCKED. Existing per-pipeline concurrency is not a whole-app limit.
- Record cache and output disk bytes, free disk, FFmpeg render wall time and output duration (real-time factor = wall seconds / output seconds). For AI, separately capture model/runtime/quantization, load time, first-response and total response/edit latency on cold and warm runs, plus token counts only when supplied by the provider. Never infer inference performance from the short UI benchmark.
- For the proposed two-hour growth scenario, warm up ten minutes, then sample for two hours at 30-second intervals while repeating a documented edit/scrub/export workload. Preserve raw data; compare stable five-minute windows and investigate sustained growth above both 20% and 512 MiB. This is a provisional investigation trigger, not proof of a leak or a measured pass. Full long-session acceptance is S04.07.
- Decode exports and compare audio/video presentation end times against the project timeline: drift must be within one project frame plus explicitly measured codec priming. Record frame rate, codec, priming method and tool versions. Do not treat container duration alone as proof.
- Stop an owned benchmark safely on process failure, free disk below 10 GiB, available system RAM below 2 GiB, or sustained system memory above 90%; capture partial evidence and mark incomplete. Stop only task-owned processes, preserve projects and avoid policy changes.

## Open gates

The 720p run is an artificially seeded browser player test, not a normal 720p proxy workflow. Native Windows startup, display scaling, painted-frame latency, whole-process resource peaks, local-model performance and the two-hour run have not been measured. Keep those claims open. The normal-host `pnpm check` passed with explicit system FFmpeg/ffprobe: 1,801 package tests and 17 script tests passed, with 67 package tests skipped. Final documentation checks and self-review were recorded in issue #127.
