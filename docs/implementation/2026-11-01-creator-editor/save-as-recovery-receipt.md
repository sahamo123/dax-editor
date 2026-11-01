---
type: Guide
title: Save-as recovery verification receipt
description: Synthetic recovery checks, limitations and pending review for project save-as.
tags: [implementation, projects, recovery, evidence]
status: draft
generated:
  by: process:implementer
  at: 2026-11-01T21:00:00Z
---

# Save-as recovery verification

**State: VERIFYING.** [Issue #146](https://github.com/sahamo123/dax-editor/issues/146) follows verified S01.04 published head `77a6c17ccee8854968c0b92567ea847fd9d017a3`. The [contract](../../specs/save-as-recovery.md) and [decision](../../adr/0016-save-as-publication.md) describe exclusive publication, existing-destination refusal and limitations. The branch's final commit and PR are recorded in the issue after publication.

Before implementation, focused synthetic tests reproduced a blocked history destination leaving a project file and a separate save-as replacing an existing project. After implementation, targeted server typechecking and 12 project/recovery tests passed, including a competing history file, unchanged original project, cleanup of task-owned staging names, metadata-failure state broadcast, undo and restart. No user projects or source media were used. The same-path and metadata checks do not establish the cause of the earlier intermittent failure.

The full `pnpm check` passed on Windows with explicitly selected system FFmpeg: **1,810 package tests passed, 67 skipped**, and **17 script tests passed**. The private log `artifacts/save-as-recovery-26d9f1ee614847c7aa261b7d3c3d2fb2/check.log` has SHA-256 `39c8fd6857a450c94e8ccbbbc73f3cc834f5230573920fa5301ab9111e100e80`. The decision and final handoff documentation were added while package tests ran; `pnpm docs:index` and `pnpm docs:okf` were rerun after those documentation changes. An earlier full check was intentionally interrupted to correct publication ordering; it is not counted as a pass.

The two files are not a cross-file transaction: a crash or history publication failure can leave a project copy without matching history, and metadata failure can require opening the new project manually. A different existing destination is refused, and filesystems without safe hard-link publication are unsupported by this path. Windows atomic-write failures remain under [issue #149](https://github.com/sahamo123/dax-editor/issues/149), separate from the original unclassified intermittent error. Native/packaged desktop acceptance is not established. Review the exact published diff and evidence before marking this work verified.
