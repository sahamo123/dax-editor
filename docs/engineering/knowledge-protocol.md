---
type: Standard
title: Knowledge protocol (how the repo remembers)
description: How work is recorded in docs/ as an Open Knowledge Format bundle so any agent or person can resume where the last one stopped.
tags: [process, agents, context-engineering, okf]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T18:40:00Z
---

# Knowledge protocol

The `docs/` directory is an **[Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format) (OKF) v0.2 bundle**: plain Markdown files with YAML frontmatter, an `index.md` for navigation and a `log.md` for history. It needs no tooling to read, works on GitHub, and is written so that an agent with no prior memory of this project can continue the work.

The goal is simple: **if every chat history vanished tomorrow, the repo alone would be enough to carry on.**

## Reading order for a new agent or person

1. [`/AGENTS.md`](../../AGENTS.md): rules, commands, definition of done. Short on purpose.
2. [`docs/STATUS.md`](../STATUS.md): what works, what is in progress, what is next, what is blocked.
3. [`docs/log.md`](../log.md): newest entries first. Read the last few to see how we got here.
4. [`docs/index.md`](../index.md): the map. Open only the concepts relevant to the task.
5. The GitHub issue you were given, and any spec or ADR it links.

This is *progressive disclosure*: each level is small and points to the next, so an agent loads only what the task needs instead of the whole knowledge base.

## What goes where

| Kind of knowledge | Where | `type` |
|---|---|---|
| Rules that apply to all work | `AGENTS.md`, `docs/engineering/` | `Standard` |
| A decision and its reasoning | `docs/adr/NNNN-title.md` | `Decision` |
| What a feature must do, before it is built | `docs/specs/` | `Spec` |
| How the system fits together | `docs/architecture/` | `Architecture` |
| Current state and next steps | `docs/STATUS.md` | `Status` |
| Plan and phases | `docs/ROADMAP.md` | `Roadmap` |
| Outside facts, competitors, experiments | `docs/research/` | `Research` |
| How we measure models | `docs/evals/` | `Evaluation` |
| Maintainer procedures | `docs/maintainers/` | `Guide` |
| What happened and when | `docs/log.md` | (reserved file) |

Backlog and discussion live in **GitHub Issues and PRs**, not in `docs/`. The docs record durable facts and decisions; issues track work.

## Frontmatter every concept needs

```yaml
---
type: Decision                 # REQUIRED by OKF. Use a value from the table above.
title: Use Tauri for the desktop shell
description: One sentence that the index will show.   # keep it to one sentence
tags: [desktop, tauri]
status: stable                 # draft | stable | deprecated
generated:
  by: process:scribe           # who wrote it (see Actors)
  at: 2026-10-18T18:40:00Z     # ISO 8601 with offset, last meaningful change
---
```

Optional: `verified` (a list of `{by, at}`) when someone checked the content, `sources` for provenance, `stale_after` for facts that expire.

### Actors

Use the OKF actor convention in `generated.by` and `verified[].by`:

- `human:<github-username>` only for content a person wrote or confirmed.
- `process:<name>` for automation and agents, for example `process:scribe`, `process:implementer`.
- **Never put a model or vendor name in repository files.** The repo must stay neutral about which tool produced the work.

## The `log.md` format

Newest first. One `# ` title, then an `## YYYY-MM-DD` heading per day, then bullets that start with a bold label.

```markdown
# Project log

## 2026-10-18
* **Creation**: Added [the evals package](/evals/index.md) with an oracle adapter. PR #2.
* **Decision**: Chose Tauri over Electron, see [ADR 0001](/adr/0001-tauri-desktop-shell.md).
```

Labels: `Creation`, `Update`, `Decision`, `Deprecation`, `Milestone`, `Incident`. The log is **append-only**: never edit past entries. If something was wrong, add a new entry that corrects it.

## Recording work: the scribe step

Every time a unit of work is completed (a PR is opened or merged, a decision is made, a milestone is reached), run the scribe step. Any agent or person can do it; in Claude Code the `scribe` subagent (`.claude/agents/scribe.md`) does it on a small, fast model so the main agent is not slowed down.

**Input** (from the implementer): a short *work summary*: what changed, why, files touched, the PR link, decisions taken, follow-ups, known problems.

**Steps:**

1. Add an entry to `docs/log.md` (new date heading if needed).
2. Update every concept the work touched; if the work created a new durable fact, create a concept for it (small, one idea per file).
3. If a decision was made, write or update an ADR.
4. Update `docs/STATUS.md`: move items between *done*, *in progress*, *next*, *blocked*.
5. Regenerate indexes: `pnpm docs:index`.
6. Validate: `pnpm docs:okf`. Fix every error it reports.
7. Stage only `docs/`. The implementer or a maintainer commits it, so docs travel in the same PR as the code they describe.

## Context-engineering rules

- **Small concepts.** One idea per file, ideally under about 200 lines. Link to other concepts instead of repeating them.
- **Descriptions are the interface.** The index shows each concept's one-sentence `description`. Write it so an agent can decide whether to open the file.
- **Durable facts only.** No "I think", no chat transcripts, no TODO lists that belong in issues. Date anything that can go stale and use `stale_after` where it applies.
- **State uncertainty.** Mark unverified claims `(unverified)` and say what would verify them.
- **Keep `AGENTS.md` short.** Anything that is not needed on every task belongs in a concept the index points to.
- **Prefer deterministic tools** (the OKF scripts, lint, tests) over asking a model to remember a rule.

## Tooling

| Command | What it does |
|---|---|
| `pnpm docs:okf` | Validates the bundle against OKF v0.2 and our conventions. Runs in `pnpm check` and CI. |
| `pnpm docs:index` | Rewrites every `index.md` from the concepts' frontmatter. Run after adding or renaming a doc. |
