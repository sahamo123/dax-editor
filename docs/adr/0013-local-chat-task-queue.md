---
type: Decision
title: Engine-owned local chat tasks and read-only planning
description: Keep queued work in the local engine and enforce Planning mode through the command allow-list.
tags: [desktop, server, agent]
status: stable
generated:
  by: process:implementer
  at: 2026-10-21T00:00:00Z
---

# Engine-owned local chat tasks and read-only planning

## Context

Users need queued follow-ups, steering, video attachments and planning without changes. A browser-only queue disappears on refresh and disagrees across tabs. Prompt instructions alone cannot guarantee that a plan makes no edits.

## Decision

The engine owns a serial queue, captured per-request modes and private task metadata. Browser refresh reconnects to the active queue. Engine restart marks unfinished work interrupted rather than automatically executing it. Steering cooperatively adds guidance at the next model boundary without cancelling the active request. In-flight work finishes and completed edits remain. Attachments, mode changes and runners without guidance support continue after the active run completes; permissions never expand mid-run. Stop explicitly cancels. Planning offers only registry commands marked read-only; the tool runner refuses all other calls. CLI bridges are unavailable in Planning mode because this interface cannot constrain their external tools. Planning video attachments remain staged; edit tasks import attachments when dispatched.

## Consequences

State responses expose task metadata and queue positions. Private app-local `tasks.json` contains request text and selected paths; it never enters Git. Retain 100 finished tasks plus active work, with at most 20 queued requests. Authenticated video uploads stay local with a 1 GiB per-file limit. Sources remain for project persistence. Automatic cleanup of unattached staged sources and non-video attachments are deferred. Manual timeline changes retain project history; exports retain existing job tracking.

The app-owned upload folder remains available when external path imports use an explicit narrower allow-list. This admits selected upload bytes without granting access to other app data or relaxing external import restrictions. A regression verifies both sides of that boundary.
