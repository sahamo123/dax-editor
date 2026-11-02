---
type: Guide
title: S01.06 disclosure keyboard activation
description: Preserve native Project and Work status disclosure keys without triggering playback.
tags: [implementation, keyboard, accessibility, workspace]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T08:30:00Z
---

# S01.06 disclosure keyboard activation

**Current follow-up [#222 / draft PR #223](https://github.com/sahamo123/dax-editor/pull/223), test head `6833c86e983c4b48b22872c066296b4308a866c4`.** The full check of PR #220 failed one bridge status test whose fixed sleep was followed by an unavailable status; its detail was not captured. The [chat context receipt](s01-06-chat-context-guard.md) retains the failed full-run hash. The candidate keeps a real fake CLI, asserts the short first status deadline, waits for the actual result only while it says it is checking, and prints any final error. Its 10-second probe limit applies only to this test; production deadlines are unchanged. Thirty-one focused bridge tests passed; log SHA-256 `82305fa36d43b9f2b122d73ffcb6f773e273b78587c5bd821b68bab841884652`. Full check and review remain pending.

**State: IN_PROGRESS.** [Issue #215 / draft PR #216](https://github.com/sahamo123/dax-editor/pull/216) is published on `codex/s01-06-summary-shortcut`, application/test head `563028eb83ca88705c004024d9b630213ff0f354`, based on [draft PR #214](https://github.com/sahamo123/dax-editor/pull/214) documentation head `0fda3f1d21372c6e8aad9430e1895a7e80b6709b`. Full source check and review remain pending.

Before the fix, the editor's global Space handler prevented the native key default on a focused summary. A focused component regression failed and a generated-media browser test confirmed the Project menu remained closed; the shortcut code routed Space to playback. The corrected browser reproduction log SHA-256 is `42a19c6b908be9e9ee782d311319c43afdf3830c5b47e1ecc183b3a16494418c`. The first attempt used an ambiguous selector shared by Project and Work status and failed before interaction; log `352f6ecbb10b07f96568d9e6b6c8664329617dcc38820e25dc3d70ee3221ea35`.

The shortcut now leaves Space and Enter to native summaries. All 46 editor component tests passed. A nine-test generated-media browser run passed the new Project/Work status Space check and existing history, undo and export workflows; log `270867367f66d2c16ceb56d1ebd04ed0120abdfb3a5f6a2ebd1739df58d53536`. The final focused browser test additionally exercised Enter on both summaries and confirmed Space still starts playback from the editor background; log `8f73023ef815004fa443710f6866cc08aa55783d83c411d57397f2b25b4b59fd`. An intermediate post-fix run passed eight existing tests and the menu assertions but failed its final playback assertion because its background click hit the Play button and then Space paused it; the corrected test explicitly cleared focus before checking the background shortcut. Failed log `2dc9fd7a17d9ccd4baead1097a087207b2a4e98a6ee69507d9af3d3017d0290b`.

The full `pnpm check` at application/test head `563028eb83ca88705c004024d9b630213ff0f354` **failed**: two bridge fake-CLI tests timed out in earlier probes than intended under the concurrent package load. The desktop suite passed 355 tests; the actual reason those subprocesses were slow is not established. The failed private log SHA-256 is `b6988aa8b5422b3c4a9d422e146714700e54443847b8b4c4f4b3c74ab08baeec`. [Issue #218](https://github.com/sahamo123/dax-editor/issues/218) tracks deterministic probe-phase coverage and the required full rerun. A passing full check must not be inferred from the focused keyboard results.

The first full-check attempt on the #218 local candidate stopped at formatting before tests. Its log SHA-256 is `02ccbb079bd1690d3db1634934b65e0cf2a1130f6b082e8a717a91b1d9b2321f`; the formatting defect was corrected before the next run.

The next full-check attempt ran without host permissions and two core safety tests failed when Windows denied their synthetic symlink creation (`EPERM` in `command-paths.test.ts` and `export.test.ts`). The local-model suite produced no further output and the already-failing run was interrupted; later package results were not obtained. Log SHA-256: `1564ae84cbbd71d30ef3cddb0c851cca7928fead6ca85ac9496a8b50e8fd411d`. A host-authorized full run was needed; no security test was skipped.

The subsequent host-authorized `pnpm check` passed at #218 test head `dd97aea25daf13ef6ff40a7eb9ade42b0f195904`: 1,857 package tests passed, 67 skipped, and 17 script tests passed. This includes the core symlink tests, 110 bridge tests and 355 desktop tests. The private log SHA-256 is `25d15e3cda7139fc43ef246b9776293e2f89e1b8d7ba0d94725a238f1a063bc5`. This uses system development FFmpeg and does not verify the packaged runtime or native application.

These are browser checks with generated media and system development FFmpeg. They do not establish the full keyboard-only native file picker, actual Narrator speech, Windows scaling, or packaged-runtime acceptance. S01.06 remains open.
