---
type: Spec
title: Background job completion ordering
description: "Keep editor task status current when full state snapshots wait for provider diagnostics."
tags: [desktop, tasks, server, testing]
status: stable
generated:
  by: process:implementer
  at: 2026-10-27T00:00:00Z
---

# Background job completion ordering

Native acceptance exposed a review stuck at 100%. The server currently captures jobs/project before awaiting provider availability, and the client overwrites newer job events with that delayed snapshot. Editor views also read the full state's jobs rather than the live job map. These ordering gaps must be eliminated independently of provider latency.

Complete asynchronous provider inspection before capturing a coherent current project/history/job snapshot. Fold job events into both editor state and its indexed job map. A known terminal job cannot become running again through a delayed snapshot/event: job IDs identify one attempt and are never reused. Preserve newer jobs missing from an older full snapshot. A later terminal outcome may still reconcile an earlier terminal outcome; do not invent success or replay work. Public protocol/project schemas remain unchanged.

Acceptance: delayed-provider regression observes current edits and completion; UI tests cover immediate terminal updates, late running data and snapshots missing newly observed jobs. Refresh browser/native review/export checks and the current installer after application code changes. No test requires an external provider.

Verified: six regressions fail before and pass after the fix; full repository checks pass (1,799 package plus 17 script tests), as do all 39 browser workflows. Corrected installer 40528351026 passes installed-native acceptance 40532196608, including real file dialogs, interactive/review playback, manual edits, export and preservation. Owner-laptop policy and broader release gates remain in STATUS.
