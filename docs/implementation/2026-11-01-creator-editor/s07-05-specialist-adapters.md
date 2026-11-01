---
type: Spec
title: "S07.05: Wire restricted specialist roles to existing capabilities"
description: Execute S07.05 with verified predecessor evidence, bounded changes and a resumable acceptance receipt.
tags: [implementation, creator-platform, s07]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
plan_id: S07.05
stage_id: S07
effort_days: [0.5, 1]
prerequisites: [S07.04, S04.08, S05.07, S06.08]
execution_state: not_started
---

# S07.05: Wire restricted specialist roles to existing capabilities

**Planning complete does not mean implementation complete. Execution is NOT_STARTED.**
Engineering effort: **0.5-1 person-days**, including verification and review fixes; split implementation into roughly 1-3-day, usually under 400-line PRs.

## Entry gate

Read the [execution contract](execution-contract.md), [master plan](master-plan.md), current handoff/STATUS, assigned issue and applicable package AGENTS.md before work.
Required predecessor/cross-stage receipts: [S07.04](s07-04-resource-admission.md), S04.08, [S05.07](s05-07-reference-close.md), [S06.08](s06-08-character-close.md). Verify the receipt source SHA against the checked-out tree and inspect its actual artifacts, outcomes and remaining blockers; checked boxes or a green workflow label are insufficient.
Reproduce the predecessor's named regression/acceptance probe where required by the contract. Stop if the selected route needs a missing, stale, failed or blocked receipt; record the mismatch before changing files.

## Source anchors

- [packages/agent/src/agent.ts](../../../packages/agent/src/agent.ts)
- [packages/agent/src/tool-runner.ts](../../../packages/agent/src/tool-runner.ts)
- [packages/agent/src/prompt.ts](../../../packages/agent/src/prompt.ts)
- [packages/engine/src/runner.ts](../../../packages/engine/src/runner.ts)
- [packages/server/src/interfaces.ts](../../../packages/server/src/interfaces.ts)

These are existing seams to inspect, not evidence that the planned feature exists. Proposed modules below require their feature spec/ADR before implementation.

## Implementation actions

1. Define planner, analyst, editor, motion, reviewer and export responsibilities as bounded adapters; ordinary jobs handle deterministic work without extra model conversations.
2. Give each role an explicit typed input/output and allowlisted tool subset, sharing existing provider adapters and the authoritative command registry.
3. Route M4 transcript/highlight proposals, M5 evidence/recipes and M6 motion artifacts through their accepted interfaces; capability discovery must reject missing optional adapters.
4. Keep planner/reviewer/analyst read-only and Planning immutable at runtime, not only in prompts; editor commits validated grouped operations with expected revision.
5. Preserve export/irreversible-command authorization and captured settings without copying credentials into task records. Treat transcripts, media names and model output as untrusted.

Keep credentials, private media and generated artifacts out of Git. Use typed registry operations and preserve one authoritative session owner.

## Verification

- Adversarial role prompts cannot call forbidden tools, execute scripts or mutate through a read-only role; runtime guards reject attempts.
- Malformed or stale plans fail validation while ordinary supported workflows preserve one undo entry per grouped edit.
- Local scripted/eval and actual offline inference cases demonstrate routing without a paid service; provider adapter availability is reported honestly.
- Missing M4/M5/M6 capability yields a blocked/unsupported child with an explanation rather than an improvised implementation.

Run focused checks for changed behavior and the required `pnpm check` for implementation changes; changed UI flows also require `pnpm --filter @dax/desktop test:e2e`. For unchanged code or planning-only decisions, reuse valid same-tree evidence per the contract and run documentation checks instead of repeating unrelated suites. Record commands, revisions, exits, skips and reuse; none are claimed as run by this plan.
Inspect actual decoded media for rendering claims. Keep source/mock, browser, native, provider and external-client evidence separate; never promote a lower-level result to end-to-end acceptance.

## Failure and recovery

- If a role needs broader privileges, return to the spec/ADR; do not expand tool access from model instructions.
- Keep absent credentials/optional clients unavailable; mocked adapter success is not a real provider result.
- Preserve originals and the last valid project/history. Stop on failed acceptance, restore only task-owned temporary work, and leave a concrete blocked receipt with a reproducible next action.

## Completion and next step

Use the [receipt template](receipt-template.md) to record Role/tool matrix, adversarial/eval results and integrated capability traces.
Include exact base/result SHAs, issue/PR, artifact hashes and private locations, tested hardware/runtime, assertions, skips, blockers, and the predecessor receipt(s) revalidated.
Complete the scribe step (log, affected concepts, STATUS, indexes and `pnpm docs:okf`) in the implementation PR. Record any scope change in the issue/spec rather than silently weakening a gate.
Advance to [S07.06](s07-06-workflow-trace.md) only after every required outcome above passes. Link this receipt from its GitHub implementation issue and current STATUS/handoff; the [master plan](master-plan.md) remains static navigation. A blocked outcome does not count as completed implementation.

