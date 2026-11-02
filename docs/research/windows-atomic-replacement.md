---
type: Research
title: Windows atomic replacement sharing behavior
description: A synthetic sharing-lock reproduction and boundaries for safe save recovery.
tags: [research, windows, persistence, recovery]
status: draft
generated:
  by: process:reviewer
  at: 2026-11-02T08:17:00Z
---

# Windows atomic replacement sharing behavior

## Observation

[Issue #149](https://github.com/sahamo123/dax-editor/issues/149) records an intermittent `EPERM` publishing a disposable project and an unclassified recent-project metadata failure. A controlled Windows test now opens a synthetic destination for reading without delete sharing. Both a direct Node rename and the server's `writeFileAtomic` then return `EPERM`. The original destination still contains its old bytes; the server helper's staged file still contains the new bytes. After the controlled handle is released, the exact staged file can be renamed successfully. A Windows-only regression reproduces this without changing machine security or using a user project.

This proves a minimal sharing-lock mechanism, not why the original intermittent failure happened. `EPERM` can also represent a lasting policy, permission, or other error. It does not establish the cause of the separate saved-connection HTTP 500 [#207](https://github.com/sahamo123/dax-editor/issues/207) or earlier unclassified save error E010. The test demonstrates that a failed current write leaves a staged file; it does not establish a safe general-purpose way to delete such files. Some staged metadata can contain credentials and must not be logged, exposed, or swept speculatively.

## Requirements for a separate recovery change

- Specify the affected project, history and app-metadata paths and their existing overwrite and error-reporting contracts. Keep project/history publication and save-as collision rules intact; never replace an exclusive save-as publication with an unconditional rename, truncate the destination in place, or delete it to make a retry work.
- Consider a short, bounded retry only for a documented, platform-specific error class and the same staged file; stop immediately on unrelated errors, preserve the original error and report exhaustion. A successful retry must not be represented as proof that the original intermittent failure is fixed.
- A retry widens the interval in which another process could change the destination. Define and test a defensible competing-writer policy before implementation; a simple pre-retry stat or hash check alone has a check-to-rename race and cannot honestly guarantee no external overwrite. Preserve user work if that guarantee cannot be established.
- Exercise temporary and persistent locks, permission errors, unrelated errors, cancellation/shutdown, competing writers, project/history and private metadata, including crash and partial-publication states. Verify both old and staged bytes after failure and avoid leaving processes or handles open. Use generated files only; do not modify application-control settings.
- Record the chosen design in a spec and ADR before changing persistence behavior. This document is evidence and a proposal, not an implemented retry policy or release claim.
