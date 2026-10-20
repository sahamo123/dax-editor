---
type: Decision
title: "ADR 0009: Scout agents may adopt open-source tools without human approval, within hard gates"
description: A scout agent can add a qualifying open-source tool as a plugin by pull request without asking, but only if it passes the intake policy's licence, security and size gates; everything else escalates.
tags: [adr, plugins, licensing, agents, supply-chain, autonomy]
status: stable
generated:
  by: process:implementer
  at: 2026-10-18T20:30:00Z
---

# ADR 0009: Scout agents may adopt open-source tools without human approval, within hard gates

## Context

The owner wants the editor to be plug and play: when a good open-source tool exists for captions, voice, motion graphics, effects or generation, it should be addable without waiting for the owner, who is one person. At the same time the project is free and open source, so a wrong licence or a malicious dependency would harm every user. The research in [plugin architecture](/research/plugin-architecture.md) and [the open-source radar](/research/open-source-radar.md) produced a precise rulebook.

## Decision

- A **scout agent** (a small, fast model is enough) continuously researches candidate tools and keeps the radar current.
- It may **adopt a tool as a plugin without human approval** only if the tool passes every **hard gate** in the [intake policy](/research/open-source-radar.md#intake-policy): allow-listed licence for code *and* weights, no telemetry, no code fetched at run time, pinned and hashed artifacts, within size caps, maintained. Tools scoring 75 or more may open a pull request that merges through normal CI; 60 to 74 is a spike for human review; below 60 is rejected and recorded.
- Plugins run as **separate processes** with declared permissions and no network unless declared.
- The policy's **escalation list is absolute**: unclear licences, non-commercial or behavioural-restriction licences (even as an option), network or credentials, executed downloaded code, telemetry, copyleft of any kind, voice cloning or likeness models, oversized footprints, typosquat suspicion, and any change to CI, secrets, branch protection, permissions or the core engine. These are written up in an issue for a human and nothing is merged.
- Scouts never push to `main`, never merge their own pull requests past required checks, and record every adoption **and rejection** in the radar and the log.

## Consequences

- New capabilities can land while the owner is away, with a paper trail.
- The autonomy is narrow by design: it covers *data and wrapper* additions, not changes to the engine or the project's security posture.
- Plugins are optional downloads, so the base app stays small and the licence surface of the core stays minimal.

## Alternatives considered

- **Human approval for every addition:** safest, but defeats the goal and does not scale beyond one maintainer.
- **No autonomy, curated list only:** simple, but the list goes stale.
