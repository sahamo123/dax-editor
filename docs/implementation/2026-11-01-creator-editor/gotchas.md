---
type: Guide
title: Gotchas and prevention checklist
description: Source-grounded pitfalls, symptoms, prevention and verification links for multi-day implementation work.
tags: [implementation, gotchas, recovery]
status: draft
generated:
  by: process:reviewer
  at: 2026-11-01T09:20:35Z
---

# Gotchas and pitfalls

These are actionable cautions from source inspection and dated repository evidence, not claims of newly reproduced runtime bugs. Recheck source before applying a fix. Record new incidents in [errors and recovery](errors-and-recovery.md) with their actual environment and receipts.

| Pitfall | Prevention / verification | Main steps |
|---|---|---|
| Default main or an old installer omits recent work | Identify actual branch/tree, candidate source and binary digest; never equate a green old run with current acceptance | S00.01, S09.01-S09.04 |
| Project JSON migrates while its separate history file does not | Migrate all states/checkpoints consistently; handle equality validation, interrupted pair writes and backup recovery | S02.01-S02.02 |
| Unknown schema fields are silently stripped by an old reader | Explicit version dispatch/refusal and compatibility export only when lossless | S02.02, S03.02 |
| Source seconds are confused with timeline seconds | Central time mapping and frame-grid assertions, including fractional rates and clip reuse | S03.01-S03.05, S04.05 |
| A text layer beneath opaque footage is called behind-the-person text | Composite original + text + synchronized matte/foreground; prove alpha edges and occlusion | S03.06 |
| Generic tracks are mistaken for a complete multitrack renderer | Verify mainClips/render behavior and add bounded upper layers through shared commands | S03.02-S03.04 |
| Interactive preview is treated as final effects proof | Declare coverage; use revision-bound rendered review and decoded frame/audio checks | S03.08-S03.09 |
| Caption command support is confused with full template capability | Report implemented, runtime-installed, source-ready and recipe-step support separately | S00.02, S02.04 |
| Existing transcript pagination/cache limits are ignored | Inspect and measure before introducing a replacement or asserting a leak | S04.03-S04.07 |
| Blender startup flags are treated as a sandbox | Owned scripts only; bounded files/resources/processes; separate hosted isolation | S06.03, S08.04 |
| Blender is assumed to lack a timeout | Existing 30-minute timer needs better failure/resource semantics; inspect before changing | S06.03 |
| MP4 output is assumed to preserve transparency | Use and verify an alpha-preserving intermediate and declared alpha convention | S06.05 |
| Blender's licence is assumed to cover rigs/textures | Per-asset provenance, licence, digest and distribution decision | S06.01 |
| A task list is treated as a durable transaction journal | Acknowledge persistence before dispatch; cover crash windows, dedupe and retention | S07.01-S07.03 |
| Retry after restart duplicates an edit or export | Reconcile operation ID/revision/outputs; uncertain mutation state never replays blindly | S07.02-S07.07 |
| Steering cancels work or expands tool authority | Preserve non-cancelling semantics and fixed permission ceiling; Stop remains separate | S01.05, S07.05 |
| Provider configured/probe passes are called live editing proof | Separate key/configuration, tool probe, actual edit, output and cleanup evidence | S09.03 |
| MCP SDK transport is called an actual assistant session | Record client identity/configuration and natural-language inference/edit evidence separately | S07.07, S09.03 |
| System FFmpeg/browser success is called bundled/native proof | Identify runtime and actual native target; keep diagnostic evidence scoped | S01.07, S09.04-S09.06 |
| A private API is exposed by changing bind/CORS | Keep engine private; gateway auth, scoped media and worker boundaries need explicit tests | S08.01-S08.08 |
| Hosted stage becomes mandatory for desktop through an unconditional dependency | Validate both routes; S09 follows S07.07 or S08.08 as selected | S09.01 |
| Logs accidentally commit credentials/private footage | Use ignored `.local/`, sanitized public receipts and evidence digests; inspect staged files | Every step |

## When a pitfall occurs

Stop the affected dependent work, preserve the last valid project and failure evidence, and record a specific incident. Do not patch around validation, suppress a required test or silently weaken the chosen acceptance scope. Repair the smallest underlying issue, verify the failed case and relevant regressions, then supersede the prior receipt. The next step must recheck that updated evidence.
