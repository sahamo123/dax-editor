---
type: Guide
title: S01.06 chat attachment preflight
description: Prevent locally detectable invalid chat selections from staging earlier files.
tags: [implementation, attachments, chat, recovery]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T08:00:00Z
---

# S01.06 chat attachment preflight

**State: IN_PROGRESS.** [Issue #212 / draft PR #213](https://github.com/sahamo123/dax-editor/pull/213) is published on `codex/s01-06-attachment-preflight`, application/test head `d5c7ee9436ce61c9fc1e02f7bf70cd523225cef1`, based on [draft PR #211](https://github.com/sahamo123/dax-editor/pull/211) documentation head `dc65dfc5d0f63a94f516d793a5a6a2690be1229b`. Full source check and review remain pending.

Before staging any chat attachment, validate the entire selection against the existing 10-file and size rules. Empty, oversized or over-count selections retain the draft, attachments and mode and send no upload or chat request. The upload client and preflight share the same size check; its error correctly describes the inclusive 1 GiB limit and applies to audio and images as well as video. The engine remains authoritative and rechecks uploads.

Before the change, three focused regression cases all attempted the first upload despite a later locally invalid selection. Afterward, 94 client/controller/component tests passed, including empty, oversized and over-count selections and the size boundary. Three generated-media browser checks passed, including a valid first file followed by an empty second file: zero upload and chat requests, a visible named error, preserved draft, mode and attachments. Browser log SHA-256 `97dbe5fc9209cce06b7eee08d1ebaf079db826d56b23ff6c47feb4b29d4753df`. This is browser/system-development-FFmpeg evidence, not native or packaged validation.

Preflight cannot prevent a later network, server, or media failure after earlier staging succeeds, and does not clean up any existing file. The [retention investigation](s01-06-staged-attachment-investigation.md) and [ownership proposal](../../research/staged-attachment-lifetime.md) remain separate. Actual keyboard and Narrator acceptance and S01.06 remain open; do not advance based on this child.
