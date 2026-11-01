---
type: Guide
title: Error ledger and recovery actions
description: Known historical risks, new incident recording fields and safe recovery rules without fabricated runtime failures or hidden retries.
tags: [implementation, errors, recovery]
status: draft
generated:
  by: process:reviewer
  at: 2026-11-01T09:20:35Z
---

# Error and recovery ledger

**No application execution was performed while writing this plan.** The rows below are historical blockers or source-observed hazards to recheck; they are not fresh reproduced failures. New execution incidents receive their own dated rows and evidence links. Canonical live blocker state lives in the relevant GitHub implementation issue; this ledger is its readable handoff mirror.

| ID | Category / evidence date | Known condition | State and next action | Related steps |
|---|---|---|---|---|
| E001 | Historical target-machine blocker; October 27 STATUS | Windows Application Control event 3077 blocked unsigned native/render binaries on the owner laptop | Recheck on selected target; obtain an authorized test/signing path if blocked. Never weaken policy. No fresh reproduction claimed. | S00.06, S01.07, S09.04 |
| E002 | Source-observed acceptance hazard; November 1 | Native workflow retrieves fixed installer run 40528351026 | Pending execution: bind candidate/receipt to current source before testing; a green old binary is insufficient | S09.01, S09.03-S09.04 |
| E003 | Source-observed persistence gap; November 1 | Recent task writes do not provide the durable transaction acknowledgement needed by the proposed workflow journal | Pending proposed feature work; design crash/dedupe semantics before dispatch automation | S07.01-S07.03 |
| E004 | Source-observed migration risk; November 1 | Current project/history readers need coordinated migration and equality handling | Pending proposed migration work; preserve originals and prove interrupted-write recovery | S02.01-S02.02 |

## Planning incident resolved — November 1

E005: Git-ignored underscore folders remain visible to the documentation walker. Source inspection and an independent review confirmed that future Markdown logs could enter generated navigation. VERIFIED_RESOLVED for this planning pack: current private evidence guidance now uses hidden `.local/`, both Git and the existing indexer exclude it, and a deliberately invalid private Markdown probe leaves docs validation/indexes unchanged. No exposure of private content was observed. The legacy ignore rule and old journal entries are preserved.

## S00.02 packaged-renderer failure — November 1

E006: A core real-media test's `detect_silence` operation failed with `spawn UNKNOWN` when the development setup selected the packaged FFmpeg executable. The failure reproduced both under the restricted environment and on the normal host. The same two-file suite passed using explicitly selected system FFmpeg/ffprobe; that does not resolve or verify the packaged binary. Keep packaged/native acceptance open and investigate the applicable policy-authorized execution path at its required gate. No machine-security changes were made. See [S00.02 receipt](s00-02-receipt.md) and issue #123.

## Incident record to append during execution

Use a stable new ID and record: date/time; selected route and step; source/candidate SHA; environment; sanitized exact error; trigger/reproduction; expected versus observed result; severity; impacted prerequisites; task/job/operation ID where safe; evidence-log entry; recovery attempted; outcome; owner/next action. Distinguish OPEN, INVESTIGATING, FIXED_PENDING_VERIFICATION and VERIFIED_RESOLVED.

Do not overwrite the original error or call it resolved because a different scenario passed. Resolution requires the original failing case (or a justified minimal equivalent), relevant regressions and second review. Link the superseding receipt and preserve previous evidence.

## Recovery rules

- Preserve projects, histories and source media first. Restore only task-owned copies using an explicitly verified backup; no broad cleanup/reset command.
- Inspect pending processes/jobs and committed state before retry. Stop only owned children; wait for shutdown/file handles before deleting temporary files.
- Never replay a possibly committed mutation or duplicate a provider request blindly. Reconcile operation IDs, revisions and existing artifacts.
- Required failed/blocked acceptance prevents the next dependent step. Optional capability exclusion must already be declared, not invented after failure.
- A missing credential, licensed asset, authorized native target or host permission is an external dependency, not a reason to bypass controls.

Logs/screenshots belong under ignored `.local/<date>/<step>/<run>/` when private. Put sanitized metadata and hashes in [evidence log](evidence-log.md). A fresh laptop may not have those raw artifacts; mark that absence and safely reproduce or obtain them before relying on their claims.
