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

**State: IN_PROGRESS.** [Child #153](https://github.com/sahamo123/dax-editor/issues/153), parent [#151](https://github.com/sahamo123/dax-editor/issues/151), follows self-reviewed state-ordering [PR #155](https://github.com/sahamo123/dax-editor/pull/155), tested head `8ccea14c08fe51610be5ddb2715480c1117fc7c2`, which follows the verified, self-reviewed [composer child #136 / PR #152](https://github.com/sahamo123/dax-editor/pull/152).

The candidate exposes recent failed/interrupted task counts in Work, labels task types accurately, and says when an old task has no recorded origin. Failed/interrupted details open for inspection. An autosave failure is visible on Project; its menu explains that recent changes may not be on disk, offers existing manual save actions and places the technical error behind a disclosure. The compact toolbar wraps as needed; a generated mixed active/queued/failed state fits at 600, 800 and 1000 CSS px.

During synthetic recovery testing, an older HTTP state response (same project, revision 0, no save error) arrived after a pushed revision 1 with a save error, hiding the warning. The private failed log `artifacts/s01-05-status-repeat-1dfc38d6a2d34fd9bcabdb92a2d34921/run-1.log` SHA-256 is `873ba0cd279f94acbfd8651dc710a37cc5abc13158dd5e1972d8982d792d8815`. The bounded ordering fix is isolated in [#154 / PR #155](https://github.com/sahamo123/dax-editor/pull/155); it is not a general cross-client total-ordering protocol.

After the fix, the four-scenario synthetic browser suite passed three consecutive runs: restored failed/interrupted tasks, failed autosave and explicit save recovery with the edit retained, mixed-status compact controls, and relinking a missing generated video. Private logs under `artifacts/s01-05-status-repeat-fixed-1c32772bd1c34ac0a1747db1d36682d4/` have SHA-256 `85b2dbbe068c3fbee13762163294b0d4516461df14a82bfcae6710e73303e22`, `4c53a9d47b975245307c5e604b129ab59e1b672aa409363a9e084f561af39846` and `db88856d79a31d01439b703fcb2ff2829c048a62bdf0990f732a6948f8992aa7`. The earlier reconnect test was corrected after automatic reconnection won a race against the test's click; the revised 12-test responsive/recovery run passed. No user projects or private media were used.

Full source/browser checks, separate review and publication remain pending. Failed-export recovery and broader S01.05 acceptance must be checked separately; browser/system-FFmpeg evidence is not native Windows or DPI acceptance. Preserve all private captures and projects.
