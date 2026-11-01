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
| E002 | Source-observed acceptance hazard; November 1 | Native workflow retrieves fixed installer run 40528351026; its harness also writes that fixed `sourceRun` rather than deriving it from the installer. Its 1024×700 viewport is not proof of actual Windows scaling. | [Issue #139](https://github.com/sahamo123/dax-editor/issues/139): after prerequisites, bind candidate/receipt and hashes to current source and verify actual Windows scale on an authorized target; no native run was performed during this preflight. | S01.07, S09.01, S09.03-S09.04 |
| E003 | Source-observed persistence gap; November 1 | Recent task writes do not provide the durable transaction acknowledgement needed by the proposed workflow journal | Pending proposed feature work; design crash/dedupe semantics before dispatch automation | S07.01-S07.03 |
| E004 | Source-observed migration risk; November 1 | Current project/history readers need coordinated migration and equality handling | Pending proposed migration work; preserve originals and prove interrupted-write recovery | S02.01-S02.02 |

## Planning incident resolved — November 1

E005: Git-ignored underscore folders remain visible to the documentation walker. Source inspection and an independent review confirmed that future Markdown logs could enter generated navigation. VERIFIED_RESOLVED for this planning pack: current private evidence guidance now uses hidden `.local/`, both Git and the existing indexer exclude it, and a deliberately invalid private Markdown probe leaves docs validation/indexes unchanged. No exposure of private content was observed. The legacy ignore rule and old journal entries are preserved.

## S00.02 packaged-renderer failure — November 1

E006: A core real-media test's `detect_silence` operation failed with `spawn UNKNOWN` when the development setup selected the packaged FFmpeg executable. The failure reproduced both under the restricted environment and on the normal host. The same two-file suite passed using explicitly selected system FFmpeg/ffprobe; that does not resolve or verify the packaged binary. Keep packaged/native acceptance open and investigate the applicable policy-authorized execution path at its required gate. No machine-security changes were made. See [S00.02 receipt](s00-02-receipt.md) and issue #123.

## S01.04 verification findings — November 1

The larger responsive candidate's first browser run failed two compact workflows because the tools panel started open; a correction passed both original cases and the subsequent full browser suite. Two full source attempts then failed distinct unchanged CLI-detection and temporary save-as tests. Each exact test passed five isolated reruns, and a later full source check passed, but the original causes remain unconfirmed. The preview-only child was then tested independently; its [receipt](s01-04-preview-child-receipt.md) records those checks. Failed raw logs remain private.

An isolated synthetic save-as test deliberately blocked the destination history file and confirmed that the request can return HTTP 400 after writing the new project file and changing the active path. This is a distinct confirmed recovery defect, not proof of the intermittent test failure's cause. [Issue #146](https://github.com/sahamo123/dax-editor/issues/146) tracks both observations and prioritizes safe recovery. Its private result SHA-256 is `5455f42dc3b537a5bbc588337e601425aae29413f821e015a9d26aee067003f3`. A separate CLI help-probe classification finding is tracked by [issue #145](https://github.com/sahamo123/dax-editor/issues/145).

## S01.04 development-tool invocation — November 1

E007: The first restricted browser-test invocation picked a different pnpm shim and failed before tests with `EPERM` while creating a project-store symlink. The documented `scripts/Enter-Dev.ps1` setup and authorized normal-host run selected the pinned local toolchain; the focused suite then ran. This resolves the invocation error only, not E006 or native/packaged execution. The intentionally failing layout regressions and the subsequent narrow top-bar failure are recorded in the [S01.04 receipt](s01-04-responsive-receipt.md).

E008: The first full S01.04 browser suite passed 49 tests and skipped two opt-ins, but failed the compact manual-project and manual-effects workflows because the tools panel started open. A closed-on-start change preserved panel state during later resizing; both original failing workflows and ten other focused tests then passed. The corrected full browser rerun passed 51 tests and skipped the two opt-ins. Status FIXED_PENDING_REVIEW: review the [receipt](s01-04-responsive-receipt.md) and complete the remaining full source check before advancing. The failed run remains private at `artifacts/s01-04-final-70ae4dfca9d848cda6d9ec2c3fe48ea4/`.

E009: A subsequent full source check failed `packages/bridges/src/claude/detect.test.ts`'s slow-sign-in case: expected `error`, observed `unsupported`. The same unchanged bridge suite passed in the prior full source run. This test uses a 300 ms timeout for version, help and authentication probes; contention is a possibility, not yet a proven cause. Status INVESTIGATING: preserve `artifacts/s01-04-verified-fd73f626892140c1ae08f8a8bb0153cb/check.log`, inspect and repeat the exact case, then rerun the required full check. Do not weaken the assertion or classify a failed run as passed.

The exact slow-sign-in case passed five consecutive isolated reruns after the full check ended; each invocation ran that case only and skipped the other 14 cases in the file. The original failure did not identify which probe timed out, so its cause remains unconfirmed. Separate source inspection identified a real classification issue for failed help probes; [issue #145](https://github.com/sahamo123/dax-editor/issues/145) tracks it independently without relaxing the CLI restrictions. A fresh full check remains required.

E010: The next full source rerun passed the CLI-detection case but failed `packages/server/src/server.test.ts`'s `creates, saves-as, opens and validates project files`: a temporary-project save-as returned HTTP 400 instead of 200. The assertion did not log the response body, so cause and impact are unknown. Five isolated reruns of the exact case passed; a separate isolated probe created and saved 100/100 fresh synthetic projects without reproducing the error. That probe did not exercise reopen or history recovery. Its private result `artifacts/s01-04-save-probe-0ba4830f4b6841d88f2ef2ec4ed16299/result.json` SHA-256 is `44d3454467bd83a2489955da6122b96c153c5e967f610db3cf7428d70ef9ee5b`. Status INVESTIGATING: [issue #146](https://github.com/sahamo123/dax-editor/issues/146) tracks potential project-save impact; retain the failed full-run log and investigate without weakening file safety or treating isolated passes as proof that the problem is resolved. The required full source check still needs a passing rerun.

E011: A separate deliberate history-write failure confirmed that save-as can return HTTP 400 after writing the destination project and switching the active project path to it. This is a confirmed recovery defect, not proof of E010's cause. The isolated synthetic result `artifacts/s01-04-save-probe-0ba4830f4b6841d88f2ef2ec4ed16299/history-failure-result.json` SHA-256 is `5455f42dc3b537a5bbc588337e601425aae29413f821e015a9d26aee067003f3`. Status OPEN under [issue #146](https://github.com/sahamo123/dax-editor/issues/146): design and test safe project/history/metadata commit and recovery before claiming reliable save-as behavior.

Subsequent verification: the final S01.04 full `pnpm check` passed, including both earlier failed cases. This satisfies the full-run check but does not establish the original causes of E009 or E010, and it does not resolve E011. See the [S01.04 receipt](s01-04-responsive-receipt.md) for the exact log and counts.

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

## E012: Windows atomic-write failures during save stress — November 1

Status INVESTIGATING, [issue #149](https://github.com/sahamo123/dax-editor/issues/149). On the normal Windows host, an isolated synthetic same-path save stress run encountered `EPERM: operation not permitted, rename` when publishing a project temporary file. A separate stress run returned the truthful new recent-project metadata warning, but its underlying error code was not recorded. The operating-system cause is not established and neither observation proves the cause of E010, whose response body was not captured. Preserve projects and do not disable security policy. The recovery changes in #146 address partial-save reporting and collision protection; they do not claim to fix these atomic-write failures.

The first full #146 verification was deliberately interrupted after review found that publishing history first could associate it with a concurrently created project. The implementation was reordered to publish the project first, its focused regressions passed, and a new full verification was started. The interrupted run is not a pass.

## E013: Delayed state response hides autosave warning — November 1

Status FIXED_PENDING_VERIFICATION under [#153](https://github.com/sahamo123/dax-editor/issues/153). A synthetic browser test observed a revision-1 state push with `saveError=true`, then a delayed revision-0 HTTP state without it; the UI accepted the older response and hid the warning. Private failed log SHA-256 `873ba0cd279f94acbfd8651dc710a37cc5abc13158dd5e1972d8982d792d8815`. Two deterministic regressions reproduced older-revision and cross-project refresh ordering; a candidate guard passed those tests and three subsequent four-scenario browser repetitions. Full checks and second review remain required. The candidate is not a general total-ordering protocol for every possible concurrent client action. See the [child receipt](s01-05-failure-receipt.md).

## E014: Synthetic task directory not empty after shutdown — November 1

Status INVESTIGATING, [issue #158](https://github.com/sahamo123/dax-editor/issues/158). The full browser run for #157 had 61 passes, two skips and one failure: cleanup after cancellation and server close saw `ENOTEMPTY` in an isolated generated task data directory. Private log SHA-256 `b1cf200bc46531652f669b431bfcc9e76c8635bdefd486bf05a8b563fe389eb`. A deterministic uncooperative-runner test independently produced the same cleanup symptom and showed running/queued task metadata remaining after shutdown. This establishes a shutdown-ordering defect but does not prove the precise cause of the original browser failure. This is not evidence of the cause of the separate Windows rename issue #149. Do not mark the failed run as passing or advance S01.05.
