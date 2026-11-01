---
type: Guide
title: Future execution goal - launch only after review
description: Copyable agent-neutral goal prompt, route selection and stopping rules for executing the handbook after owner review.
tags: [implementation, goal, handoff]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
---

# Future execution goal: launch only after review

**This document is inactive.** The current goal only produces and audits the plan. Select your execution agent in its client, review [the master plan](master-plan.md) and [execution contract](execution-contract.md), then explicitly launch a separate implementation goal. The prompt works with any capable coding agent; it does not depend on vendor memory or hidden chat context.

## Choose the scope before launching

| Route | Ordered stages | Result | Estimated engineering effort |
|---|---|---|---|
| `first-improvement` | S00 → S01 → S02 | Workspace/profile development candidate; stop for review at S02.08 | 10-17 person-days |
| `desktop-creator` | S00 → S01 → S02 → S03 → S04 → S05 → S06 → S07 → S09 | Bounded creator desktop candidate and release adjudication; excludes hosting | 56-95 person-days |
| `full-hosted` | S00 through S09 | Desktop scope plus personal single-user hosting | 64-109 person-days |

Estimates are engineering effort, not a promise about agent wall-clock time. Add 30% uncertainty allowance; character art requires a separate estimated 5-10 artist days. External gates can extend elapsed time. Multi-user hosting, unrestricted scene generation and automatic person segmentation are outside these routes. The original [review](../../specs/creator-platform-plan.md) explains those boundaries.

## Copyable starting goal

The conservative default below runs only the first improvement route. Change the route explicitly before launching a broader one; do not start all stages merely because their files exist.

```text
Create an implementation goal for the Dax Editor repository I have opened.
Selected route: first-improvement.
At launch/S00.01 record provisional required capabilities, optional provider
selection, actual external clients and authorized target machines before
their acceptance gates. S09.01 freezes/revalidates this matrix on broader
routes; do not invent exclusions after a failed check.
Read AGENTS.md, docs/engineering/handoff.md,
docs/engineering/laptop-continuation.md, docs/STATUS.md,
docs/implementation/2026-11-01-creator-editor/master-plan.md and
docs/implementation/2026-11-01-creator-editor/execution-contract.md.

Work only on the ordered steps selected by that route.
Start at the first step lacking a valid VERIFIED implementation receipt.
All steps were NOT_STARTED when the planning handbook was published.
Planning approval is not implementation evidence.

Before each step, inspect its predecessor and all prerequisite receipts,
confirm the tested changes exist in the current source, and perform the
documented second check. Do not advance past a failed or blocked required
gate. Create scoped GitHub implementation issues and reviewable PRs.
Follow each step's source anchors, actions, tests and recovery contract.
Preserve existing projects, unrelated changes, security and licences.

Keep progress and resumable receipts in GitHub and the repository handoff.
Never rely on chat memory. Use the receipt template for actual evidence;
never invent test passes or equate browser/mock checks with native/live ones.
No automatic merging, paid-provider fallback, external publication,
deployment or machine-security changes are authorized by this goal.

Stop implementing at S02.08 for this route and report the development
candidate's evidence, remaining release gates and review links.
If a required external condition blocks a step, report it accurately and
follow the host's goal-status rules. Do not silently skip the step.
```

## Broader-route additions

For `desktop-creator`, replace the selected route and terminal step with S09.08. For `full-hosted`, also explicitly authorize the intended private host/workspace; the hosting plan does not grant access to arbitrary machines or production infrastructure. Declare provisional capabilities and target machines at launch/S00.01; S09.01 freezes and revalidates that matrix before any release claim. Optional paid-provider tests require configured, authorized credentials; their absence cannot be reported as live verification.

Use bounded delegation only when the execution session authorizes it. One coordinator owns the issue ledger, authoritative project state and ordered PR stack. Reviewers may inspect independently; concurrent agents must not write the same module or run two heavy acceptance jobs on a constrained laptop without coordination.

## Resume prompt

```text
Resume the existing Dax Editor implementation goal and its selected route.
Read the handbook and current GitHub step receipt before taking action.
Inspect current source, local changes and pending job state.
Revalidate the last VERIFIED step and any relevant intervening changes.
Continue only the first unfinished eligible step; do not replay edits.
Do not reset the route, discard private files, merge PRs or expand scope.
```

No token/time budget is supplied by this handbook. Set one only if the user requests it. Ending a work session must leave the exact next action and blockers, never a blanket completion statement for unverified work.
