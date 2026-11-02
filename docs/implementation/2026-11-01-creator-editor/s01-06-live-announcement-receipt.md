---
type: Guide
title: S01.06 live accessibility and export announcements
description: Partial keyboard and Narrator observations, export announcement changes, and remaining acceptance evidence.
tags: [implementation, accessibility, keyboard, handoff]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T03:00:00Z
---

# S01.06 live accessibility and export announcements

**State: IN_PROGRESS.** [Issue #185](https://github.com/sahamo123/dax-editor/issues/185) is based on documentation head `0bb231d7848b416be11c2801ef59d08f67aa0081` from [PR #184](https://github.com/sahamo123/dax-editor/pull/184). The application source at that baseline was `d92bc08a210312d68403a870e3fffac97e584f0e`. The parent acceptance [#177](https://github.com/sahamo123/dax-editor/issues/177) and [S01.06](https://github.com/sahamo123/dax-editor/issues/162) remain open.

## What was observed before the change

An isolated browser preview and synthetic engine with generated six-second media were used. Keyboard input bypassed setup, reached Import, resized the timeline, selected and split a clip, opened review and closed it with Escape; focus returned to Review effects. The operator selected the clip in the Windows picker **with a mouse**, so this is not a completed keyboard-only import. The test export contained six seconds of audio and video and fully decoded with a separately selected system FFmpeg; this is not packaged-runtime or native-app validation.

Narrator started and the operator confirmed hearing it. The operator reported hearing “Effects preview ready,” but no export-start or progress announcement, and did not hear the subsequent existing-file failure message. The failed export rejected replacement; it did not overwrite the synthetic file. Windows reported that the Narrator window had higher integrity than the computer-use helper, so no independent speech transcript was captured. These observations apply to the earlier application baseline, not the changed code.

## Candidate change and checks

The export controller publishes a start notice. Persistent, separate polite and urgent live regions announce notices without making each progress percentage a new announcement; visible dismissible messages remain. Tests cover completion, errors, repeated identical errors and dismissal. These tests inspect UI and event behavior, not actual speech. Browser and post-change Narrator acceptance must be recorded separately.

The initial full check was interrupted after numerous `EPERM` renames in the restricted temporary directory. A rerun with an isolated project-local temporary directory and authorized test process passed `pnpm check`: 1,825 package tests passed, 67 skipped and 17 script tests passed (private log SHA-256 `c6d7b564fdcbf0591e6066308a653b497f19e78f6790a6e94aee61ad8fa679f6`). Subsequent changes affected tests and documentation only; the final focused component/controller run passed 63 tests. System FFmpeg is diagnostic only.

The first affected-browser run passed 19 tests, skipped two opt-in baselines, and failed a settings assertion because the new announcement duplicated the text matched by the test. The selector was corrected. The next run passed 28, skipped the same two, and failed the history workflow with a disconnected engine. That workflow had passed in the first run; three isolated repeats passed twice and failed once with the same disconnected state. The cause is unknown and tracked in [#186](https://github.com/sahamo123/dax-editor/issues/186); these results do not establish a passing browser suite. Private log hashes in order: `75cee51d48006dd29974f70a40a983b4e9d921f53b7b50351f97c7384eb98b95`, `333a7db260e2231dd358d89d690d40911c8b9c076d003dfd4675d6864e163700`, and `a8a27c5219c7034be178b4c4444740e592b05edacbf632c1b0c2c8f5afe226bf`.

## Continue

1. Investigate the reproducible intermittent disconnection [#186](https://github.com/sahamo123/dax-editor/issues/186) in a separate scoped change; do not hide it with retries. Check the published branch and PR before moving laptops.
2. Review the announcement diff and recheck its evidence; do not infer actual Narrator speech from a live-region test.
3. Complete an actual keyboard-only import and walkthrough, then observe task start, completion, error and progress behavior with a screen reader. The user is not available to participate in this session.
4. Reconcile all written S01.06 gates before S01.07. Native Windows application, packaged FFmpeg and actual display-scaling validation remain separate.
