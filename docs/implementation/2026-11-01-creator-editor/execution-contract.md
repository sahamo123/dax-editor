---
type: Standard
title: Execution contract - verify before advancing
description: Required predecessor checks, evidence states, safe recovery and completion rules for executing the staged implementation plan.
tags: [implementation, verification, agents, handoff]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
---

# Execution contract: verify before advancing

This is a future execution contract. Authoring or reviewing a plan page does **not** complete its implementation. All 76 steps start `NOT_STARTED`; the [master plan](master-plan.md) chooses the route. [Root rules](../../../AGENTS.md) and applicable package rules remain authoritative. The user will review this handbook before launching implementation.

## Two separate completion records

| Record | States | Authority |
|---|---|---|
| Planning delivery | DRAFT → SELF_CHECKED → CROSS_REVIEWED → READY_FOR_OWNER_REVIEW | Review report (`review-report.md`; later publication batch), publication PR and planning issue |
| Application step | NOT_STARTED → IN_PROGRESS → VERIFYING → VERIFIED; or BLOCKED / NEEDS_REWORK | Step's GitHub issue, tested PR head and completion receipt (`receipt-template.md`; later publication batch) |

`status: draft` in a page is documentation maturity. `execution_state: not_started` is the publication baseline, not a live scheduler. Do not update 76 plan pages to simulate progress: GitHub Issues are the work ledger; STATUS and the current handoff summarize it. When resuming, resolve the receipt from the issue and validate its evidence. Never infer implementation completion from a green planning checklist, a closed issue alone or a previous assistant's assertion.

## Before the first step

1. Confirm the user actually launched execution; reading or reviewing the handbook does not authorize implementation. Record selected route and acceptance capabilities in the execution goal/issue.
2. Read root AGENTS, current handoff, laptop continuation, STATUS, the chosen stage and step, and package instructions. Record the actual source commit and branch; `main` may be older than the published continuation.
3. Inspect working changes and preserve private projects/media. Do not reset, clean, overwrite a user's worktree or modify machine policy to make checks pass.
4. Create/reuse a scoped implementation issue for the step. Link the stable plan ID and existing delivery issue; do not treat the planning-publication issue as application completion.
5. Confirm the documented toolchain and actual script names. A fresh clone uses the portable setup guide, not this laptop's private `.local-tools` assumptions. No model download, external credential or cloud deployment is implied by a planning file.

## Entry gate for every later step

The immediate prior step in the **selected route** and every explicit `prerequisites` entry must be VERIFIED. There are two checks:

1. **Evidence check:** open the predecessor receipt, issue and PR; inspect accepted code/docs at its recorded SHA, exact test commands/results, artifact hashes/locations and unresolved risks. Confirm that completed work satisfies its stated acceptance, not merely that a process exited zero.
2. **Current-tree check:** confirm the working baseline includes that tested change. Inspect intervening diffs for invalidation; rerun focused regression checks when relevant changes, stale artifacts or missing evidence warrant it. Reuse unchanged valid evidence with its date/SHA; do not rerun expensive suites without reason.

Record both outcomes in the new step's entry receipt. If either check fails, do not start dependent edits. Return the predecessor to NEEDS_REWORK, repair/reverify it, or report the exact missing prerequisite. Stacked, unmerged PRs can be a valid development baseline if their exact tested commits are present; no automatic merge is authorized.

S00.01 has no implementation predecessor: its gate is execution authorization and a preserved, identified baseline. S09.01 follows S07.07 on `desktop-creator` and S08.08 on `full-hosted`. The optional host stage must not become an accidental dependency of desktop execution.

## Scope, work and verification

- Follow the step's bounded actions through the existing engine/command/session seam. New files listed as proposed do not already exist. Inspect before choosing final filenames or APIs.
- Record a short spec and ADR before significant behavior or architecture changes. Root constraints remain: free/manual/offline paths, optional paid APIs, no Remotion, no copied incompatible code, typed tools, credentials outside projects and one ordered project writer.
- Keep refactoring separate. Use one issue/branch/PR; split work beyond roughly 400 changed lines into dependent PRs, retain the parent step ID, and verify all child receipts before closing the step.
- Add meaningful behavior tests and exported API documentation. Run focused tests while changing behavior, then required `pnpm check` and relevant browser/native/renderer/eval checks before completion. Unit/mock, real model, actual client, browser and native evidence are different rows.
- Use generated media in automated tests; authorized private fixtures stay ignored. Never send private frames/transcripts to an optional provider without the user's applicable authorization. No credential values, live tokens or personal-media identifiers belong in receipts.
- Technical success includes actual saved project state, preview/export output and undo/recovery where relevant. A ready health endpoint, completed job event or successful tool response alone is insufficient.

## Blockers and optional scope

A required check that cannot run is **BLOCKED**, never passed, skipped-to-pass or waived by the implementing agent. Stop that route before its next step. Unrelated investigative work can continue only when it changes no dependent implementation and its scope is explicit. Do not silently take a different route, substitute a browser for native acceptance or weaken tests/security. Report the blocking action and required external change; follow the host's goal-status rules rather than inventing automatic approval or pause semantics.

An early baseline step may complete by accurately identifying an existing external blocker if that is its written deliverable. That does not satisfy a later native/provider/client acceptance step. S01.07 requires its declared native DPI evidence on an authorized Windows environment; a policy block prevents that step from completing. Record owner-laptop acceptance separately if another host is used.

At launch/S00.01, declare provisional required capabilities, optional provider selection, real external clients and target machines before their earlier acceptance gates. S09.01 freezes and revalidates that matrix; it cannot invent exclusions after a failed earlier test. A provider excluded from the selected optional scope stays **NOT_SELECTED / NOT_LIVE_VERIFIED**, not PASS; retain mock/source evidence separately. Once a capability is required, missing credentials or a compatible machine blocks its gate. Scope changes need an explicit user decision, not deadline pressure.

## Recovery during multi-day work

Persist after every meaningful checkpoint: issue link, branch/head, completed and pending actions, current test results, private artifact references and the next exact action. On restart inspect the working tree, active processes and external job state before issuing work. Never replay potentially committed mutations, repeat a paid call, kill unrelated processes or overwrite completed exports just because a chat was interrupted. Reconcile operation IDs/revisions and existing outputs first.

An unfinished step remains IN_PROGRESS or BLOCKED; no downstream step becomes VERIFIED. If the test machine, schema, template/runtime version, source media or provider configuration changes, reevaluate affected evidence. Reopen dependent verification when its assumptions no longer hold. Preserve earlier receipts and add a superseding one with the reason.

## Exit gate and second review

1. Complete every required criterion and save a receipt with commands, exit codes, expected/observed results, exact source/artifact identity, limitations and recovery notes.
2. Perform a second review of the diff and evidence. Prefer a separate authorized reviewer; a separate self-review pass must be labelled as such and cannot be called independent. Any mandatory independent review in the stage remains required.
3. Update the implementation issue, docs/STATUS/log and indexes as applicable; push the branch and open/update its PR. Do not merge automatically. Code changes require the root definition of done.
4. Mark the step VERIFIED only when the receipt and second review support it. A verified stage requires all its steps and terminal stage checks; a verified route requires every selected stage and its terminal receipt.
5. The next step rechecks this receipt rather than trusting the mark. Missing evidence sends the work back for repair.

The first-improvement route ends at a **development candidate**. It is not a native distribution release; full release adjudication belongs to S09. Planning completion does not start either route.
