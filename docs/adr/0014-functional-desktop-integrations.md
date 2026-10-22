---
type: Decision
title: "ADR 0014: Live desktop tools and bounded background integrations"
description: Share one authoritative session with local MCP clients and run speech and Blender as bounded jobs.
tags: [desktop, mcp, speech, plugins]
status: stable
generated:
  by: process:implementer
  at: 2026-10-22T00:00:00Z
---

# ADR 0014: Live desktop tools and bounded background integrations

## Decision

The owner-approved functional release extends the existing engine, not the project format or editing engine. Manual actions and guarded AI/MCP tools execute through the engine queue with per-open identity and monotonic revisions. Explicit batches use an isolated in-memory draft and commit as one undo step; a failed batch never applies a partial edit.

Live desktop MCP uses the existing MCP transport and registry package as a workspace dependency of the server. This adds no new external runtime library. Two authenticated loopback listeners provide editing and read-only Planning. Each initialized client keeps its own observed project revision. The stdio proxy discovers current endpoint/token pairs from owner-only app storage; client configuration contains no token and remains stable across restarts. Standalone project-file MCP remains supported. External clients must inspect again after manual edits or project switches. Preview-frame tool remains disabled on the live bridge until its output accurately represents the full composed preview.

Speech uses pinned whisper.cpp/model assets with explicit installation and verified offline installer seeding. English base.en-q5_1 is the resource-conscious first default; other languages require a later explicit selection path. Speech removal is respected on subsequent startups.

Blender remains a separate optional program, as required by ADR 0002. Application-owned templates take validated parameters and render assets into private job folders. No model-supplied script or shell is executed. Heavy speech/render operations are bounded and cancellable. FFmpeg remains the main timeline/export engine.

## Consequences

The server depends on the existing MCP workspace package. Separate loopback listeners add small transport overhead but no extra inference process. A stale edit can fail and require fresh inspection; this preserves manual work. Public plugin submission, remote exposure and arbitrary Blender scenes are separate work. Client-specific live checks and native installer verification remain release gates, not consequences of protocol tests passing.
