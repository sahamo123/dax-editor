---
type: Guide
title: S01.06 staged attachment investigation
description: Generated-media evidence of retained staged files and conservative cleanup design boundaries.
tags: [implementation, attachments, storage, recovery]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T07:50:00Z
---

# S01.06 staged attachment investigation

**State: IN_PROGRESS.** [Issue #202](https://github.com/sahamo123/dax-editor/issues/202) is under investigation on local `codex/s01-06-staged-attachment-investigation`, based on [draft PR #210](https://github.com/sahamo123/dax-editor/pull/210) documentation head `814a640a5f5c8b811f0d4025ae0bb2574296cef7`. Verify publication before continuing on another laptop.

Generated-media tests reproduced retained unsubmitted bytes after a later empty upload failed and after restart. A second scenario imported a staged file into a saved project, queued another as a Planning attachment, restarted, and verified both files, the restored project asset and interrupted task reference remained intact. Two new retention tests plus seven existing upload tests passed; private combined-log SHA-256 `639c6bb319c58a93f740a044f6350bfd68086eebd03e49ccc476e1295463d203`. The test source after formatting SHA-256 `611ac5364519580c597f4d4cdba28b117e2dcc2dd0e5f2e3df6b96d1022391ba`.

Two initial test attempts were interrupted after a deep comparison of large binary buffers appeared to stall; a short trace reached the failed-upload response, and replacing deep object equality with native byte equality made the tests complete. The first lint run then rejected import ordering; the corrected combined run passed. Interrupted tests may have left generated test directories in the isolated temporary area; no user files were removed. These incidents are test-harness observations, not evidence of an application hang.

The [research and proposal](../../research/staged-attachment-lifetime.md) explains why the current shared upload folder cannot be swept safely and outlines a future lease/promotion design. No cleanup is implemented. Review the proposed ownership and crash-safety model, write a separate spec and ADR before any cleanup implementation, and keep legacy uploads durable. S01.06, actual keyboard/assistive-technology checks and native acceptance remain open.
