---
type: Guide
title: Windows atomic write sharing investigation
description: Controlled Windows file-lock evidence for atomic-write failures and safe recovery boundaries.
tags: [implementation, windows, persistence, recovery]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T08:17:00Z
---

# Windows atomic write sharing investigation

**State: IN_PROGRESS.** [Issue #149](https://github.com/sahamo123/dax-editor/issues/149) is being investigated on local `codex/windows-atomic-rename-investigation`, based on [draft PR #213](https://github.com/sahamo123/dax-editor/pull/213) documentation head `f6527efb9da55e37f87fc3924b3c3d6f93ec58ec`. Verify publication before resuming from another laptop.

A synthetic Windows destination opened without delete sharing produced `EPERM` when directly renamed over; after closing the handle, the same operation succeeded. A Windows-only regression then exercised the actual server `writeFileAtomic`: while the lock was held, the old destination remained unchanged and the new bytes remained in its generated staged file; once released, that exact staged file could be published. The regression passed on this host; its private log SHA-256 `f2ef878597080f273bd72b103748a71df75977587d9e6df31a122d0ac4fef893`, test source SHA-256 `c98731d1156698965489abd7cd62df4ce657ebcb002e2c71749cf9bbb7c6e3d3`. An earlier version of the lock control passed five repeated runs; the final additional staged-file assertion passed once.

The final lock regression also passed alongside the saved-connection and project-save-recovery tests: three tests passed, log SHA-256 `a0445a1f6a48305bfbdab37eb31cbf67cd2d23dc148ef4f90dfecf23152fd1d2`. `pnpm check:fast` and `pnpm docs:okf` passed. The parent application source passed a full check; this child adds only tests and documentation.

The test uses a hidden child process, generated files, exact non-recursive fixture cleanup, and no user project. The earlier manual probe left only its own explicitly named generated fixture under `artifacts`; it did not alter policy or other files. This control demonstrates one mechanism, not the actual cause of the original intermittent failure, E010, or the saved-connection HTTP 500 [#207](https://github.com/sahamo123/dax-editor/issues/207).

No production retry or cleanup was added. The [research note](../../research/windows-atomic-replacement.md) identifies error classification, competing-writer, crash recovery, staging and secrecy requirements for a separate spec and ADR. Publication and review remain pending. S01.06 and native acceptance remain open.
