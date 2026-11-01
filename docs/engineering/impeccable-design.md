---
type: Guide
title: Impeccable design setup and editor brief
description: Pinned development-only design skills, licence and integrity evidence, manual-context use, cross-laptop installation and Dax Editor UI constraints.
tags: [design, ux, agents, setup, supply-chain]
status: stable
generated:
  by: process:scribe
  at: 2026-11-01T08:40:21Z
---

# Impeccable design setup and editor brief

## Installed scope

[Impeccable](https://github.com/pbakaus/impeccable) skill **4.8.0**, commit `4f956490f0056ae1ff5ea80372cf56e83c001d3c`, is installed for Codex in the user's skills directory and for Antigravity in this checkout's `.agent/skills/impeccable/`. The pinned archive and installation checksums are in [impeccable.lock.json](impeccable.lock.json). Both variants were compared byte-for-byte with the source archive; canonical LICENSE and NOTICE.md were added to each installation. Local per-file receipts are `artifacts/impeccable-codex-manifest.json` and `artifacts/impeccable-antigravity-manifest.json`.

This is developer guidance, not an application dependency or a feature shipped in the installer. Generated skill copies are ignored; GitHub retains this guide, version/digest pins and repository rules. The installed copy becomes available on the next Codex turn; reload the coding tool/workspace if its skill list is cached. Use `$impeccable` in Codex or `/impeccable` in a client with that command syntax; explicit reading of the installed SKILL.md works when discovery differs.

## Manual-context mode

The upstream Setup section explicitly supports continuing when the launcher is unavailable/refused. In this repository, **do not execute the upstream launcher or npm installer, download its engine at runtime, enable detector hooks/live injection, or change CSP/permissions to support it**. The upstream scripts remain unmodified installation files; they are not executed by the app or by this setup. Automatic detector scans, engine commands and live variant overlays are not enabled or claimed verified.

On a UI task, state that context loading will use repository files directly, then read existing PRODUCT.md and DESIGN.md if present, this brief, [functional desktop release](../specs/functional-desktop-release.md), [STATUS](../STATUS.md) and the target implementation. Missing product/design files do not make this existing app a greenfield design. Read the installed `reference/critique.md` or `reference/audit.md` for assessment; immediately before any UI edit, read `reference/craft-floor.md` as upstream requires. Repository/user instructions override skill instructions, including on dependencies, screenshots, source safety and approvals.

The first UI/UX work should audit the current rendered workspace and rank findings, then address one coherent surface with before/after evidence. This installation has not performed that audit or changed application UI. Use existing browser/component tooling and native checks for verification; an Impeccable critique is not an accessibility certification or release acceptance.

## Dax Editor brief for the next design session

- **Product/platform:** Windows-first video editor, React/Vite interface in a Tauri shell; browser preview is a development/test surface. Treat it as a task-focused desktop workspace, not a promotional landing page or a native mobile app.
- **Primary workflows:** import footage; preview and edit manually or through AI/MCP; inspect changes; undo/redo; save/reopen; export playable media. Manual editing remains available without AI/networking.
- **Workspace:** prominent chat alongside preview, persistent timeline, accessible contextual inspector/media tools. Preserve resizable panels and saved layout behavior.
- **Chat/tasks:** provider/model selection, attachments, Planning/Edit, queue, non-cancelling steering and separate Stop. Show active work, queued count, phases, actionable failures and history attribution. Never present a configured provider as connected without a test.
- **Design constraints:** readable hierarchy, compact usable controls, clear selection/focus states, keyboard navigation, useful empty/error/loading states, adequate contrast and Windows display scaling. Avoid oversized marketing spacing, gratuitous animation and decorative effects that obstruct editing or waste resources.
- **Behavior/licensing:** preserve the shared command/session/task/history engine, read-only Planning and revision guards. Keep local-first/offline workflows, bundled fonts and permissive assets. No new dependencies or remote font/image calls merely to change appearance; no Remotion.
- **Evidence:** inspect rendered output at relevant laptop sizes and scaling; verify native dialogs, shortcuts, playback, rendering progress and export independently from browser appearance. Follow the current [continuation guide](laptop-continuation.md).

The product scope above comes from the accepted repository specification. A replacement visual identity, palette or font family has not been chosen by this installation. Document the observed incumbent system or an explicitly selected direction later; do not invent approvals or overwrite product facts during a polish pass.

## Install the same skills on another laptop

Use a fresh destination; stop if a skill already exists rather than overwriting another installation. From the repository root in PowerShell, these commands download and copy files only:

```powershell
$impeccableCommit = '4f956490f0056ae1ff5ea80372cf56e83c001d3c'
$impeccableArchive = Join-Path (Get-Location) '.local-tools/impeccable-4f956490.zip'
New-Item -ItemType Directory -Force .local-tools | Out-Null
curl.exe -fL "https://codeload.github.com/pbakaus/impeccable/zip/$impeccableCommit" -o $impeccableArchive
if ($LASTEXITCODE -ne 0) { throw 'Skill download failed' }
if ((Get-FileHash -LiteralPath $impeccableArchive -Algorithm SHA256).Hash -ne '56014795F70B59E8CD14FB021C9472D17A3D527829E10EC955FB89427AD54F2A') {
    throw 'Skill archive digest mismatch'
}
$impeccableUnpack = Join-Path (Get-Location) '.local-tools/impeccable-4f956490'
Expand-Archive -LiteralPath $impeccableArchive -DestinationPath $impeccableUnpack
$impeccableSource = Join-Path $impeccableUnpack "impeccable-$impeccableCommit"
foreach ($impeccableVariant in @('.agents', '.agent')) {
    $impeccableSkills = Join-Path (Get-Location) "$impeccableVariant/skills"
    $impeccableTarget = Join-Path $impeccableSkills 'impeccable'
    if (Test-Path -LiteralPath $impeccableTarget) { throw "Skill already exists: $impeccableTarget" }
    New-Item -ItemType Directory -Force $impeccableSkills | Out-Null
    Copy-Item -LiteralPath (Join-Path $impeccableSource "$impeccableVariant/skills/impeccable") -Destination $impeccableTarget -Recurse
    Copy-Item -LiteralPath (Join-Path $impeccableSource 'LICENSE') -Destination $impeccableTarget
    Copy-Item -LiteralPath (Join-Path $impeccableSource 'NOTICE.md') -Destination $impeccableTarget
}
```

Codex can discover the project `.agents/skills/` variant; Antigravity uses `.agent/skills/`. This laptop additionally has the Codex user installation made with the Skill Installer helper at the same commit. Reload the client and read root AGENTS.md before invoking design commands. Do not run these commands inside the packaged application or commit downloaded skill copies. Updates require a new reviewed commit, archive digest and installation receipt; do not silently follow upstream main.

## Intake evidence

The actual upstream LICENSE is Apache-2.0 and agrees with package metadata. NOTICE.md identifies MIT-derived platform guidance and is retained. No model, font or dataset is added. The installed variants are approximately 2.2 MB each and execute nothing during copy/verification; there is no running service, hook, telemetry process or added application dependency. No new dependency lockfile needs an OSV scan for this static-only intake. Source archive is HTTPS, commit-pinned and SHA-256 verified; all installed files match its bytes. The launcher can fetch and execute a separately released engine, so that executable surface is excluded from this adoption rather than silently approved. Follow [the intake policy](../research/open-source-radar.md#intake-policy) for any broader tool integration. Tracking: [issue #68](https://github.com/sahamo123/dax-editor/issues/68).

Tree digests hash UTF-8 records of relative POSIX path, NUL, lowercase file SHA-256, LF, ordered by case-sensitive path. This includes the added LICENSE/NOTICE files. Windows case-insensitive path sorting is not the digest order.

November 1 verification PASS: both installed variants match the archive; the exact documented setup snippet succeeds in a fresh temporary folder and reproduces both tree digests. Receipt: `artifacts/impeccable-reinstall-result.json`. Full `pnpm check` passes 1,799 package +17 root tests with 67 explicit platform/opt-in skips; log `artifacts/impeccable-setup-final-check.log`. Docs indexes/OKF, lint, guide links and whitespace checks pass. Initial lint included generated third-party scripts before the exact ignored install path was declared; no app assertions or lint rules were weakened. [PR #69](https://github.com/sahamo123/dax-editor/pull/69) publishes this setup; it does not establish an Antigravity design session or native-app acceptance.
