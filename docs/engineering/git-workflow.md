---
type: Standard
title: Git and pull request workflow
description: Trunk-based branching, Conventional Commits, small squash-merged pull requests, and what CI and review require.
tags: [standards, git, ci, review]
status: stable
generated:
  by: process:implementer
  at: 2026-10-18T19:00:00Z
---

# Git and pull request workflow

## Branches

- `main` is always releasable and protected (see [repository settings](/maintainers/repo-settings.md)). Nobody pushes to it directly.
- Branch from `main`: `feat/short-name`, `fix/short-name`, `docs/short-name`, `refactor/short-name`. Agents may use their tool's branch names.
- Keep branches short-lived. Merge `main` into your branch (or rebase your own unshared branch) when it falls behind. Never rewrite history on a branch someone else uses.

## Commits: Conventional Commits

Format: `type(scope): subject`, enforced by a git hook locally and by CI on the PR title.

| Type | Use for |
|---|---|
| `feat` | A new capability |
| `fix` | A bug fix |
| `docs` | Documentation and knowledge base only |
| `refactor` | Restructuring without behavior change |
| `test` | Tests only |
| `perf` | Performance improvement |
| `build`, `ci`, `chore` | Tooling, pipelines, housekeeping |
| `revert` | Reverting an earlier commit |

Scopes follow packages: `core`, `evals`, `cli`, `mcp`, `desktop`, `docs`. Use `!` for breaking changes: `feat(core)!: rename Range to TimeRange`. Subject is imperative and lower-case ("add keepRanges"), no trailing period.

## Pull requests

1. One issue per PR; link it ("Closes #123").
2. Small: roughly under 400 changed lines excluding lockfiles and generated files. Split larger work.
3. Fill in the template, especially *How I verified it* and the provenance checkbox.
4. CI must be green: lint, build and typecheck, documentation coverage, knowledge-base validation, dead code, tests, and the oracle eval.
5. A code owner approves. Reviewers check behavior, tests, comments, and that docs and `docs/STATUS.md` moved with the code.
6. **Squash-merge** with the PR title as the commit message, so history stays one commit per change.

## Documentation travels with the code

Update `docs/` in the same PR as the code it describes. After a unit of work, run the scribe step from the [knowledge protocol](/engineering/knowledge-protocol.md) (log entry, concept updates, STATUS, indexes) and include the `docs/` changes in the PR.

## Hooks

`pnpm bootstrap` enables the hooks in `.githooks/`:

- `pre-commit`: lint and typecheck (`pnpm check:fast`).
- `commit-msg`: Conventional Commits check.

Do not bypass hooks with `--no-verify`. If a hook is wrong, fix the hook.
