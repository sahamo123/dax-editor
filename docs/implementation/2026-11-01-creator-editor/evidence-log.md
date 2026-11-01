---
type: Guide
title: Evidence and verification log
description: Public index of planning and future implementation verification, linked to private raw logs with precise source and environment scope.
tags: [implementation, evidence, logs]
status: draft
generated:
  by: process:reviewer
  at: 2026-11-01T09:20:35Z
---

# Evidence and verification log

This is the public evidence index for the dated handbook. Raw logs, screenshots and private diagnostics stay in ignored `.local/` or their existing private artifact location. A public row contains enough sanitized metadata to assess the claim without exposing credentials or source media. No implementation result is implied by a planning check.

## Current planning evidence

| Run | Scope | Result | Source / evidence |
|---|---|---|---|
| PLAN-AUTHOR | Stage/step source inspection and drafting | PASS: 76 step pages and 10 stage pages self-checked | Stage pages and [review report](review-report.md); NOT_STARTED application state |
| PLAN-CROSS | Independent cross-review of every assigned stage/step and controls | PASS: all stage/step pages and shared controls; repairs rechecked | [Review report](review-report.md) |
| PLAN-STRUCTURE | IDs, sections, source links, counts, effort and route closure | PASS: 100 Markdown files, 1,173 links, route/effort/dependency gates; docs/OKF/lint | [Sanitized final receipt](review-report.md); raw audit receipt ignored |
| PLAN-PUBLISH | GitHub publication and final laptop/tree comparison | Publication receipt and PR stack tracked separately; verify the checked-out head | [Planning issue #72](https://github.com/sahamo123/dax-editor/issues/72) |

Historical application checks remain in repository STATUS with their original date/source/environment. They are not new runs in this planning table. The planning work itself did not load a model, edit media, run native acceptance or deploy a host; execution has since begun.

## Current execution evidence

| Run | Scope | Result | Source / evidence |
|---|---|---|---|
| S01.03 | Setup and contextual inspection | VERIFIED with self-review | [Receipt](s01-03-setup-receipt.md), [issue #142](https://github.com/sahamo123/dax-editor/issues/142), [PR #143](https://github.com/sahamo123/dax-editor/pull/143) |
| S01.04 preview child | Preview and saved panel sizes | VERIFYING: isolated source/browser/frame checks passed; review/publication pending | [Child receipt](s01-04-preview-child-receipt.md), [issue #137](https://github.com/sahamo123/dax-editor/issues/137) |

## Add a verification run

Use one stable run ID per attempt, not a row overwritten on retry. Required fields:

| Field | Meaning |
|---|---|
| Run / step / issue / date | Stable evidence identity and owning implementation task |
| Source SHA / candidate digest | Exact code and binary under test, including post-test changes |
| Environment / versions | OS, architecture, actual native/browser target, runtime/model/template versions |
| Command / procedure | Reproducible instruction with secrets redacted |
| Expected / observed / exit | Concrete assertions, actual result and process exit code |
| Evidence class | Source inspection, mock, real engine/model/client, browser, native, deployment |
| Artifact location / hash | Relative private location and SHA-256; sanitized shareable result if available |
| Limitations / skips | Anything not run, blocked, excluded or unproven |
| Reviewer / supersedes | Actual second review method and previous failed run replaced by this evidence |

Completed artifacts must match the recorded revision and input digest. Check native workflow result files independently of the workflow badge. Decode exported audio/video, inspect project state and verify actual client edits when those are the claim. A model's text explanation is not edit-state verification.

## Private layout and transfer

Suggested layout: `.local/2026-11-01/S02.05/run-001/` containing sanitized-test-result copies, raw logs and screenshots as appropriate. The folder's `.gitignore` excludes `.local/`, and the existing documentation indexer skips its dot-prefixed name. Both boundaries were verified with a private Markdown probe. The old `_local/` path remains ignored for legacy evidence; do not use it for new Markdown logs. Do not store keys deliberately in logs even when ignored. Original media stays in private project storage.

GitHub remains the source of truth for issue status, safe receipts and code. Raw private evidence requires a separate authorized transfer or reproduction on another laptop. Record unavailable artifacts honestly. Do not automatically upload private logs to make a receipt appear portable.
