---
type: Guide
title: S01.05 task failure and autosave recovery child receipt
description: Findings, synthetic recovery evidence and pending verification for task status visibility.
tags: [implementation, tasks, recovery, testing, persistence]
status: draft
generated:
  by: process:implementer
  at: 2026-11-01T22:00:00Z
---

# S01.05 task failure and autosave recovery child

**State: VERIFIED with self-review.** [Child #153](https://github.com/sahamo123/dax-editor/issues/153), [PR #156](https://github.com/sahamo123/dax-editor/pull/156), tested head `082314a691f1ee1720beaf85c8c1280858727842`, tree `55c231580e0061b8ea9178302c540e9dca689b16`, parent [#151](https://github.com/sahamo123/dax-editor/issues/151). It follows self-reviewed state-ordering [PR #155](https://github.com/sahamo123/dax-editor/pull/155), tested head `8ccea14c08fe51610be5ddb2715480c1117fc7c2`.

The candidate exposes recent failed/interrupted task counts in Work, labels task types accurately, and says when an old task has no recorded origin. Failed/interrupted details open for inspection. An autosave failure is visible on Project; its menu explains that recent changes may not be on disk, offers existing manual save actions and places the technical error behind a disclosure. The compact toolbar wraps as needed; a generated mixed active/queued/failed state fits at 600, 800 and 1000 CSS px.

During synthetic recovery testing, an older HTTP state response (same project, revision 0, no save error) arrived after a pushed revision 1 with a save error, hiding the warning. The private failed log `artifacts/s01-05-status-repeat-1dfc38d6a2d34fd9bcabdb92a2d34921/run-1.log` SHA-256 is `873ba0cd279f94acbfd8651dc710a37cc5abc13158dd5e1972d8982d792d8815`. The bounded ordering fix is isolated in [#154 / PR #155](https://github.com/sahamo123/dax-editor/pull/155); it is not a general cross-client total-ordering protocol.

After the fix, the four-scenario synthetic browser suite passed three consecutive runs: restored failed/interrupted tasks, failed autosave and explicit save recovery with the edit retained, mixed-status compact controls, and relinking a missing generated video. Private logs under `artifacts/s01-05-status-repeat-fixed-1c32772bd1c34ac0a1747db1d36682d4/` have SHA-256 `85b2dbbe068c3fbee13762163294b0d4516461df14a82bfcae6710e73303e22`, `4c53a9d47b975245307c5e604b129ab59e1b672aa409363a9e084f561af39846` and `db88856d79a31d01439b703fcb2ff2829c048a62bdf0990f732a6948f8992aa7`. The earlier reconnect test was corrected after automatic reconnection won a race against the test's click; the revised 12-test responsive/recovery run passed. No user projects or private media were used.

The corrected head passed `pnpm check`: 1,817 package tests passed with 67 skipped, plus 17 script tests. The complete browser suite passed 57 tests with two opt-in skips. Private source log SHA-256 `7322f6a54c9a625e84899f009a3c200894d7cb94e259b9cf639a4e4dfd2b820f`; browser log `071016508799b02819808ef92b8e8f46e6d8883a0ad8324802b7283a9a380f11`. The published diff and evidence received a separate self-review, not independent review. Failed-export recovery and compact relink remain under [#157](https://github.com/sahamo123/dax-editor/issues/157); browser/system-FFmpeg evidence is not native Windows or DPI acceptance. Preserve all private captures and projects.

The first published failure-visibility candidate `c78bf4b2833a61de2cf0a308158e936bc82fb780` passed `pnpm check` and 57 browser tests (two opt-in skips). Separate review found that the task list always displayed one running task even when more were active. A new regression reproduced that defect and the corrected head passed the fresh checks above.
