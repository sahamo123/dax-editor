---
type: Guide
title: S01.06 locally initiated job outcomes
description: Reproduction, bounded reconciliation and verification of locally initiated jobs first observed terminal.
tags: [implementation, accessibility, tasks, recovery]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T15:30:00Z
---

# Locally initiated job outcomes

**State: IN_PROGRESS.** [Issue #247 / draft PR #248](https://github.com/sahamo123/dax-editor/pull/248), branch `codex/s01-06-local-job-outcomes`, application/test head `772f0e7072cf0f0bb1cda20236f3e814534c0acc`, builds on [PR #246](https://github.com/sahamo123/dax-editor/pull/246) documentation head `863ecc6b65cda6e618fd59018fb3a58880e44506`. The S01.06 parent remains open.

## Reproduction and change

Five focused cases failed against the preceding candidate: export success and failure first observed in snapshots both before and after the command response, and a completed preview first observed in a later snapshot. The other 49 cases passed (private pre-fix log SHA-256 `87e701c3a686cdc4b7079cb9f050f0e40d10a4a821046c876683ec352636b977`).

A successful local command's returned job ID now reconciles the corresponding accepted job whether its first snapshot precedes or follows the response. Previously announced jobs retain weak markers as accepted snapshots replace their objects; historical jobs present before the command remain silent. Unseen claims are capped at 128 and removed when observed. Exceeding the cap shows a notice directing the user to Work. The controller does not retry a command or infer an ID from an ambiguous failed response. Preview messages do not expose internal cache filenames.

## Verification and limits

Focused controller and component checks passed 113 tests after the fixture-type correction (private log `a901768c367dde075080132db38c2cd8eb1c43ae67d97ff4a1a13343b707ac3a`). Cases cover both timing orders and outcomes, a previously announced live event, historical and unrelated jobs, project switching, ambiguous errors, capacity/recovery and preview privacy. The initial fast check failed four test-fixture TypeScript errors (log `2fe2675af5817748e81fbf2c73d730b6a8fe2f13a84c263d778c96095de79fe9`); correcting fixture resolver types produced a passing `pnpm check:fast` (log `2cd62b32f671f200649afb2580a83ef17c1e3570412a9abd1fdce3550f139321`).

Eleven Edge browser checks passed (log `e5e71d7c7ea35abc053fdf77ec53fa5b27c658219d8394676be7238631cf5363`). The regular generated-media export used diagnostic system FFmpeg. The two new timing cases instead simulate the command response and WebSocket snapshot; they verify the live-region notice and unchanged server project, not an actual export or disconnect.

Host-authorized `pnpm check` passed at application/test head `772f0e7072cf0f0bb1cda20236f3e814534c0acc`: 1,914 package tests passed, 67 skipped and 17 script tests passed (private log `59eaa6bf2370d7450d35b3130cb0ee188893e0f7d2540c14298b3464c19c8ff1`). No private user media was used.

Success notices remain limited to export and rendered preview, with failure notices for job kinds already supported by the controller. Identification requires an explicitly returned ID and is not durable across controller restart or loss of server job records. At capacity, the Work panel is the recovery path. No actual screen-reader speech, complete keyboard-only picker, real disconnection, packaged FFmpeg or native Windows/DPI acceptance is claimed. Review remains pending; S01.06 and [#177](https://github.com/sahamo123/dax-editor/issues/177) remain open. Revert the scoped application commit through review if necessary; preserve user projects and earlier evidence.
