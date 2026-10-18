---
type: Decision
title: "ADR 0004: Free-only dependencies; no Remotion; FFmpeg built-ins first"
description: No feature may need a paid service or license, so Remotion is excluded, animations start as FFmpeg built-ins, and HyperFrames is a later optional plugin.
tags: [adr, animation, licensing, dependencies]
status: stable
generated:
  by: process:implementer
  at: 2026-10-18T18:50:00Z
---

# ADR 0004: Free-only dependencies; no Remotion; FFmpeg built-ins first

## Context

The owner requires the tool to be completely free and open source. Remotion is a popular way to render React-based video, but its license is free only for individuals, nonprofits and for-profit teams of up to three people. Its terms treat automated rendering (the kind a prompt-driven editor does) as a paid tier, around $0.01 per render with a monthly minimum *(per its pricing page when researched; re-check before relying on this)*. See [landscape research](/research/landscape.md).

## Decision

- Do not depend on Remotion or any component that needs a paid license for our use.
- **Version 0.1 animations** (captions, titles, lower thirds, basic transitions) are built from FFmpeg filters.
- **Later:** add [HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0, HTML to video) as an *optional plugin* for richer motion graphics. It needs headless Chrome, so it is a separate download, not core.
- Features that use paid third-party APIs (hosted LLMs, cloud storage) are always optional and bring-your-own-key.

## Consequences

- Fewer animation styles at first.
- Overlay renderers must be pluggable: they render transparent video that FFmpeg composites, so the plugin can come later without changing the core.
- Preview and export must stay in agreement; see the architecture notes.

## Alternatives considered

- **Remotion:** best developer experience but incompatible with "completely free". Rejected.
- **Revideo (MIT):** a possible alternative. Not evaluated yet (unverified).
