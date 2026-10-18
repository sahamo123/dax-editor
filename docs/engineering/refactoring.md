---
type: Standard
title: Refactoring guide
description: "When and how to refactor safely: separate commits, tests green throughout, small steps, and the tools that find candidates."
tags: [standards, refactoring, quality]
status: stable
generated:
  by: process:implementer
  at: 2026-10-18T19:00:00Z
---

# Refactoring guide

Refactoring means changing structure without changing behavior. Done well it keeps the codebase easy for the next person or agent; done carelessly it hides bugs.

## Rules

1. **Never mix a refactor with a behavior change** in the same commit. Ideally not in the same PR. Reviewers cannot tell what changed otherwise.
2. **Tests first.** If the code you want to restructure is not covered, add characterization tests that pin down its current behavior, commit them, then refactor.
3. **Keep tests green at every step.** Work in steps small enough that `pnpm check:fast` and the relevant tests pass after each one.
4. **Do not change public behavior or exported names** as a side effect. If you must, that is a behavior change: its own commit, with a note in the PR.
5. **Leave touched code better, not the whole repo.** Clean up inside the area you are working on. Larger cleanups get their own issue labeled `refactor`.

## When to refactor

- The same logic appears a third time (rule of three): extract it.
- A function has grown past about 40 lines, takes more than three positional parameters, or needs a comment to explain *what* a block does.
- A name no longer matches what the thing does.
- A module has two unrelated reasons to change: split it.
- Knip reports unused files, exports or dependencies: delete them.

## Tools that find candidates

| Command | Finds |
|---|---|
| `pnpm deadcode` | Unused files, exports and dependencies (knip). |
| `pnpm lint` | Complexity and suspicious patterns (Biome). |
| `pnpm docs:check` | Public API that is not documented, often a sign it is not understood. |

## Recording it

A refactor that changes how modules relate to each other updates `docs/architecture/overview.md`. One that reverses an earlier design choice needs an ADR that supersedes the old one (mark the old one `deprecated`).
