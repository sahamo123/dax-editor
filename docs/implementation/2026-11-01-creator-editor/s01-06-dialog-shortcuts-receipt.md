---
type: Guide
title: S01.06 modal shortcut isolation receipt
description: Reproduction and verification for keeping project shortcuts outside active modal dialogs.
tags: [implementation, accessibility, keyboard, testing]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T00:10:00Z
---

# S01.06 modal shortcut isolation

**State: IN_PROGRESS.** [Issue #171](https://github.com/sahamo123/dax-editor/issues/171), parent [#162](https://github.com/sahamo123/dax-editor/issues/162), based on self-reviewed [PR #170](https://github.com/sahamo123/dax-editor/pull/170) head `5f766c48f1ec329b8d111593ee638849681f717f`, tree `722006f5b43e4130c6ffe125b39496ab4d802374`. Its focused browser and full-source check evidence, published source and predecessor review were rechecked; no intervening source changes.

Focused component tests reproduced both editor split/delete and shell undo from a button inside a modal, using a fake project API. The pre-fix tests failed as expected; private log SHA-256 `84f63627fa9552d7d5be2b84acabdad52f18a86579c8ab2cdd3a31c9d3743dfb`. The candidate ignores project shortcuts originating inside an active modal dialog; Escape and control events remain with the dialog, and shortcuts are restored after closing. Forty-six focused component tests passed on the candidate.

A browser diagnostic did not run because Edge exited during launch with a crashpad pipe error. A Chrome test subsequently reported its case passed, but the Playwright-owned preview cleanup did not finish and that runner was interrupted. A separate rerun using a manually started owned preview server completed with exit 0: the modal dispatched no project commands for split, delete or undo, and split worked again after Escape. Private browser log SHA-256 `60ed559f42531017240ac71f9214c7e8a760b8e46c756bcb54e10d63236c5cd8`; the owned preview was stopped afterward. The full `pnpm check` passed on the host-permission rerun: 1,822 package tests passed, 67 skipped, and all 17 script tests passed; private log SHA-256 `6f3516b7921d5f389421fd9445440a40a774263f1a2b69cfcef6c3ed6080d3b6`. Publication and a separate self-review remain pending. Do not equate a synthetic component test with actual assistive-technology speech, complete keyboard-only import, or native Windows acceptance. No real user project was used.

The first restricted full-check attempt reported EPERM creating symbolic links in two existing core safety tests; its runner was interrupted when it did not exit promptly. Private log SHA-256 `938eb59c1ecf8dbf22fe93e1e263a7bdb8c125ff32f8ae6d2b7f7d5772f547c5`. The host-permission rerun passed both cases and the full check; do not treat the interrupted attempt as a pass.
