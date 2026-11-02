---
type: Guide
title: S01.06 non-export job outcome notices
description: Reproduction, reconciliation and verification for speech, motion and local-model job outcomes.
tags: [implementation, accessibility, tasks, recovery]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T15:55:00Z
---

# Non-export job outcome notices

**State: IN_PROGRESS.** [Issue #249 / draft PR #250](https://github.com/sahamo123/dax-editor/pull/250), branch `codex/s01-06-non-export-outcomes`, application/test head `5136c40914e064386397a7e46e603a2337a8ee7f`, builds on [PR #248](https://github.com/sahamo123/dax-editor/pull/248) documentation head `fb0880866968db51f7fd8193dd0df24d03cc541c`. S01.06 remains open.

## Reproduction and change

Ten controller tests failed before the fix: successful transcription, speech setup, local-model download/start and Blender jobs produced no completion notice, and terminal failures first seen in a snapshot were silent after their five corresponding endpoints returned a job ID. Sixty other cases passed (private pre-fix log SHA-256 `fd4124e4ff313233b7bb8f894a2f3eff0fcb5782990895116c485142d34640ef`).

The controller now reconciles IDs from speech install/transcription, motion rendering and local-model install/start using the existing bounded tracker. These job kinds receive fixed, path-free completion messages, including “Local model started” rather than a claim of a tested assistant connection. Synchronous removal, stopping, cancellation and uninstall are not treated as started jobs. Proxy completion remains silent; prior failure handling is preserved. No commands are retried.

## Verification and limits

The final focused controller run passed 80 tests (private log `14861520516481d9b1467ba831c10a842896d6b77d24c1a84f24a299032aac7f`). The preceding controller/store/component run passed 140 tests before a wording-only change (log `5b77d6214272047d0ffc577298c6347b2d0d399dc0068e1898e9d4281a53c2ca`). Coverage includes before/after reply ordering, historical and ambiguous jobs, duplicate terminal events, silent proxies and synchronous actions.

Three final Edge browser checks passed (log `2ffb249c168a35fa3e5430691a959c5a2621d54ceda8d44e763f9219ca25e273`). Two simulate speech endpoint responses and WebSocket snapshots; the third uses the real local server and job events with a fake local-model runtime. An earlier 12-check run included the Settings workflow (log `f997d9fdd3907cba0123ab980bb5a067160fe4686ccc9d0931c5098b0a67d7fd`); it preceded the wording change. No actual model or speech installation was performed.

Host-authorized `pnpm check` passed at application/test head `5136c40914e064386397a7e46e603a2337a8ee7f`: 1,935 package tests passed, 67 skipped and 17 script tests passed (private log `72b65ce689fe0a55cb391eb22842f0b9a6d6968140489efeda9dcff872192ba3`). System FFmpeg was diagnostic; private user media was not used.

No actual screen-reader speech, real disconnect, packaged FFmpeg or native Windows/DPI acceptance is claimed. The existing cancellation/error distinction needs separate investigation in [#251](https://github.com/sahamo123/dax-editor/issues/251). Review and [#177](https://github.com/sahamo123/dax-editor/issues/177) remain open. Revert the scoped application commit through review if needed and preserve projects and prior evidence.
