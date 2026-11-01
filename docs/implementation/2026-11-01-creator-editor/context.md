---
type: Guide
title: Dated project context and scope
description: Stable project facts, scope choices, evidence boundaries and reading order for the multi-day creator-editor work.
tags: [implementation, context, handoff]
status: draft
generated:
  by: process:planner
  at: 2026-11-01T09:20:35Z
---

# Project context

This dated handbook belongs to Dax Editor, the existing Apache-2.0 desktop/CLI/MCP video editor. It does not start a new product. GitHub and committed repository documents are the shared context across laptops and agents. Baseline review source: `f05a57b99a2d184900ddd809a7480b30052ae5c1`; follow the current handoff (`handoff.md`; later publication batch) for the reviewed successor rather than checking out an old SHA blindly.

## Read in this order

1. Root AGENTS and current repository STATUS/handoff.
2. This context, the dated handoff (`handoff.md`; later publication batch) and progress (`progress.md`; later publication batch).
3. [Master plan](master-plan.md), [execution contract](execution-contract.md), chosen stage and step.
4. Relevant decisions (`decisions.md`; later publication batch), gotchas (`gotchas.md`; later publication batch), errors (`errors-and-recovery.md`; later publication batch), evidence (`evidence-log.md`; later publication batch) and the step's GitHub receipt.

Every step file is a planned instruction; it is not an activity log. This folder's operational records coordinate actual work. Do not recreate the plan from chat recollection or overwrite prior receipts after a restart.

## Product and architecture constraints

- Windows-first React/Vite interface in a Tauri shell; browser development/testing is a separate surface.
- Manual editing stays available without AI or networking. Local AI remains optional/on demand; hosted APIs are optional and never silently selected as paid fallback.
- One live authoritative project session, one typed command registry, one revision/undo path for manual, chat and MCP changes.
- Planning is read-only. Steering continues the current request; Stop is a separate action. Long jobs cannot commit stale edits after cancellation or intervening changes.
- Preserve current schema/readers and undo history through explicit migrations; source and timeline seconds are different units.
- Use LGPL-safe packaged FFmpeg; Blender remains a separate optional process with reviewed owned scripts. No Remotion or copied incompatible implementation code.
- Credentials, private footage, model weights and raw diagnostic files are not Git content. Filenames/transcripts/reference files are untrusted input.

## Planned scope

Four content profiles; improved editor workspace; bounded composition layers; long-form/podcast/educational workflows; reference-style recipes from authorized media; curated Blender characters; bounded specialist jobs; optional personal hosting; source-specific release gates. This is a staged development proposal, not already working functionality.

`first-improvement` selects S00-S02. `desktop-creator` additionally selects S03-S07 and S09. `full-hosted` also selects S08. Route choice and provisional optional clients/providers/machines are recorded at launch/S00.01. S09 freezes/revalidates that declaration; it must not invent a narrower scope to make earlier failures disappear.

Outside scope: unrestricted generated Blender code, arbitrary text-to-3D, voice/likeness cloning, automatic subject matting, professional editor parity, multi-user hosting and public publishing. Any expansion needs a separate explicit scope decision and relevant intake/spec/ADR.

## What is known versus unverified

The repository contains implemented editing, providers, speech, live MCP, bounded motion templates and historical acceptance evidence. The current user request only commissions a detailed plan. No new application execution or release certification occurs while writing it. Existing owner-machine policy blocks, real hosted/client checks and broader performance/native acceptance must be re-evaluated at their named steps.

Historical run results retain dates, source identities and target environments. A new plan, copied project, installed model, configured key or clean source check does not establish end-to-end operation. Use the evidence log (`evidence-log.md`; later publication batch) to distinguish these classes.

## Folder ownership and portability

All stage/step instructions and operational Markdown live in this dated folder. Update the dated records in place during execution; append events rather than replacing history. Create a new dated handbook only for an explicitly revised program/baseline, with a pointer explaining which one is active.

Raw execution logs/screenshots may live in ignored `_local/<date>/<step-id>/<run-id>/` inside this folder. Git retains sanitized evidence summaries, command/result metadata, hashes and references. On another laptop, missing private artifacts are missing evidence until supplied or safely reproduced; do not assume ignored files travelled with the clone. Keep original source media in the user's private project storage rather than duplicating it into documentation.
