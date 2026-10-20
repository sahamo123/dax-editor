---
type: Decision
title: "ADR 0007: Agent-agnostic repository with an OKF knowledge base"
description: The repo is the single source of truth, readable by any agent, using AGENTS.md for rules and docs/ as an Open Knowledge Format bundle with a scribe step.
tags: [adr, process, agents, okf, context-engineering]
status: stable
generated:
  by: process:implementer
  at: 2026-10-18T18:50:00Z
---

# ADR 0007: Agent-agnostic repository with an OKF knowledge base

## Context

The project will be built by several people and by AI agents from different vendors, and the owner must be able to switch agents (for example if a subscription ends) without losing context. Chat history and vendor-specific memory are not durable or portable.

## Decision

- **GitHub is the source of truth:** Issues for work, ADRs for decisions, `docs/STATUS.md` and `docs/log.md` for state and history.
- **`AGENTS.md`** (an open convention read by many coding agents) holds the rules. Tool-specific files such as `CLAUDE.md` only import it. Gemini CLI and Aider are pointed at it through small config files.
- **`docs/` is an [Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format) v0.2 bundle.** Every document has frontmatter with a `type`; `index.md` files are generated; `log.md` is an append-only, newest-first history.
- A **scribe step** runs after each completed unit of work and records it. See [knowledge protocol](/engineering/knowledge-protocol.md). In Claude Code a small, fast subagent does it; any other agent can follow the same steps.
- Conformance and index freshness are checked by `pnpm docs:okf`, part of `pnpm check` and CI. Deterministic tools do what tools can do; models do the writing.
- Repository files stay **tool-neutral**: no model or vendor names as authors.

## Consequences

- Slightly more writing per change, mitigated by the scribe step and generated indexes.
- OKF v0.2 is new and may change; we follow its fields and ignore what we do not need, and the validator is small enough to adapt.

## Alternatives considered

- **Keep notes in a wiki or in chat:** not versioned with the code, not portable. Rejected.
- **Adopt a heavier spec-driven toolkit (GitHub Spec Kit):** its workflow ideas (principles, specify, plan, tasks) are reflected in our spec template; the toolkit itself needs Python and agent-specific integrations. See [frameworks](/engineering/frameworks.md).
