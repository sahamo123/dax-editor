---
type: Template
title: Implementation receipt and predecessor double-check
description: Evidence fields and two-pass review checklist required to verify one implementation step and unlock its successor.
tags: [implementation, evidence, verification]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
---

# Implementation receipt and predecessor double-check

Copy this structure into the step's GitHub issue/PR and link a concise durable handoff. It is a blank template, **not evidence of implementation**. See [execution contract](execution-contract.md). Keep private footage, paths containing personal identifiers, tokens, keys and unsanitized logs out of GitHub; publish safe summaries and content hashes instead.

## Identity and scope

| Field | Required value |
|---|---|
| Step / stage / selected route | Stable IDs, e.g. S02.05 / S02 / first-improvement |
| Implementation issue / PR | Actual URLs; distinguish planning publication from feature implementation |
| Start / tested / final commit | Actual commit SHAs, with any post-test changes explained |
| Target environment | OS, architecture, runtime/tool versions; browser versus actual native app |
| Feature/capability scope | Exactly what this receipt establishes and what is not selected |
| Status and timestamp | IN_PROGRESS, VERIFYING, VERIFIED, BLOCKED or NEEDS_REWORK; dated evidence |

## Entry receipt: double-check the predecessor

- [ ] Identify the immediate predecessor for the selected route and every explicit prerequisite.
- [ ] Open each predecessor's issue/PR, receipt and relevant output; record its tested SHA and artifact identity.
- [ ] Confirm it satisfies its written criteria; a checkbox, title, green workflow or health endpoint is insufficient.
- [ ] Confirm the current tree includes that accepted change; inspect intervening diffs for invalidated assumptions.
- [ ] Reuse unchanged valid checks with their source/date, or run and record focused regressions when justified.
- [ ] Resolve missing/failing evidence before editing this step; record what was repaired and rechecked.

For S00.01, replace predecessor fields with explicit execution authorization and preserved baseline. For S09.01, name the route-dependent predecessor. If no valid predecessor receipt exists, this gate fails.

## Implementation record

List actual changed files, their purpose and the public behavior they implement. Link the spec/ADR and every dependent child PR if the step was split. Record project/schema migration, compatibility and recovery behavior. State any difference from the planned file seams and why it was necessary. No broad refactor should be hidden inside a feature receipt.

## Verification matrix

| Criterion | Command or manual procedure | Expected result | Observed result / exit code | Source SHA and artifact | Evidence class |
|---|---|---|---|---|---|
| Populate from the step | Exact reproducible instruction | Observable pass condition | Actual result, never a placeholder PASS | Safe log/result location + digest | Unit/mock, real engine, real model, real client, browser or native |

Include positive behavior, specified negative cases and relevant regressions. Record explicit skips with reasons. An artifact must identify the same candidate that was tested: installer source SHA, binary SHA-256, runtime/model/template versions and selected fixture digest where applicable. Native acceptance against an older hard-coded installer cannot verify a new source tree.

Required checks that fail or cannot execute go in the matrix as FAIL/BLOCKED. NOT_SELECTED is allowed only for optional capabilities excluded in the declared route/release scope; it is never PASS. Preserve old failed results and explain their superseding test instead of editing them into success.

## Recovery and remaining risks

Record cleanup performed, owned processes still active, staged artifacts, pending operations and idempotency/revision identifiers. Explain how to resume safely without duplicating edits, imports, renders or paid calls. List unresolved risks and who/what can resolve an external blocker. Preserve projects on upgrade/uninstall; do not delete ignored media as cleanup.

## Second review

- [ ] Review the actual diff and observable outputs against every acceptance criterion.
- [ ] Verify logs/artifacts refer to the claimed source and environment, including terminal result files and failure codes.
- [ ] Confirm no unrelated changes, licence violations, secrets, permission weakening or untracked required files.
- [ ] Check undo/restart/migration/Planning/cancellation behavior where affected.
- [ ] Record reviewer role, date, review method and findings. Label a self-review as a self-review; independent means another reviewer/context.
- [ ] Resolve findings and rerun affected checks; cite the final tested head.

## Completion and next action

Only after the entry gate, implementation acceptance, required checks and second review pass:

- Update the step issue to VERIFIED with this receipt; the issue can remain open until its PR is reviewed/merged.
- Complete applicable log/STATUS/concept/index documentation and `pnpm docs:okf`.
- Push the reviewed branch and link its PR without automatic merging.
- Name the next exact step and the evidence it must recheck. For a terminal step, name the route/stage outcome and unresolved release boundaries.

If any required item remains open, keep BLOCKED/NEEDS_REWORK/IN_PROGRESS and do not unlock its successor. A completed documentation handoff or an expired time budget is not application completion.
