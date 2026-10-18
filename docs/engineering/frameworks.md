---
type: Reference
title: Frameworks and standards we adopted
description: Which existing standards, templates and tools the repo reuses instead of inventing its own, and where each one shows up.
tags: [process, standards, references]
status: stable
generated:
  by: process:implementer
  at: 2026-10-18T19:00:00Z
---

# Frameworks and standards we adopted

We reuse established conventions wherever possible. Details marked (unverified) came from secondary sources and should be re-checked before they matter.

| Standard / tool | What it is | How we use it |
|---|---|---|
| [AGENTS.md](https://agents.md) | An open "README for agents". Read by many coding agents (Codex, Cursor, Copilot's agent, Gemini CLI via config, Aider via config, and others). | `AGENTS.md` is the single rules file. `CLAUDE.md` imports it with `@AGENTS.md`; `.gemini/settings.json` and `.aider.conf.yml` point at it. Whether Claude Code reads a bare AGENTS.md depends on its version, so the import is kept. |
| [Open Knowledge Format v0.2](https://github.com/GoogleCloudPlatform/open-knowledge-format) | Google Cloud's vendor-neutral spec: Markdown files with YAML frontmatter (`type` required), `index.md` and `log.md`. | `docs/` is a conformant bundle. See [knowledge protocol](/engineering/knowledge-protocol.md) and [ADR 0007](/adr/0007-agent-agnostic-repo-and-okf.md). |
| [MADR](https://adr.github.io/madr/) | Markdown Architectural Decision Records. | `docs/adr/` uses a minimal MADR shape: Context, Decision, Consequences, Alternatives. |
| [Conventional Commits](https://www.conventionalcommits.org/) | A commit and PR title format. | Enforced by a `commit-msg` hook and CI. See [git workflow](/engineering/git-workflow.md). |
| [GitHub Spec Kit](https://github.com/github/spec-kit) | A toolkit for spec-driven development (principles, specify, plan, tasks, implement). MIT. Needs Python and `uv`. | Not installed. We borrow the workflow: principles live in `AGENTS.md`, `docs/specs/_template.md` covers specify and plan, the *Work item* issue template covers tasks. We can adopt the toolkit later without changing the layout. |
| [Contributor Covenant 2.1](https://www.contributor-covenant.org/) | Code of conduct. | `CODE_OF_CONDUCT.md`. |
| [Biome](https://biomejs.dev/) | Linter and formatter in one tool. | `pnpm lint`, `pnpm format`. |
| [TypeDoc](https://typedoc.org/) | Generates API docs; its `notDocumented` validation fails on undocumented exports. | `pnpm docs:check` enforces the commenting rule. |
| [knip](https://knip.dev/) | Finds unused files, exports and dependencies. | `pnpm deadcode`. |
| [Dependabot](https://docs.github.com/code-security/dependabot) | Automated dependency update PRs. | `.github/dependabot.yml`. |

## Eval frameworks considered

promptfoo, Inspect AI and DeepEval were surveyed and not adopted for now. See [ADR 0008](/adr/0008-custom-eval-harness.md).
