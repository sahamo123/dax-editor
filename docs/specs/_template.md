---
type: Template
title: Spec template
description: "Copy this to start a feature spec: problem, user stories, acceptance criteria, design, risks and how it will be verified."
tags: [template, specs]
status: stable
generated:
  by: process:implementer
  at: 2026-10-18T19:05:00Z
---

# Spec template

Copy this file to `docs/specs/<feature-name>.md`, change `type` to `Spec`, `status` to `draft`, and fill in the frontmatter. Delete this paragraph. Keep the spec short: a page or two. Write it before the code, update it when reality changes.

---

## Problem

Who is trying to do what, and why is it hard today? Describe the editing task, not the implementation.

## Goals and non-goals

- Goal: ...
- Non-goal (explicitly not doing now): ...

## User stories

- As a *tutorial creator*, I want *to remove filler words by typing "remove the ums"* so that *I do not scrub the timeline by hand*.

## Acceptance criteria

Each item is testable. These become the checklist on the GitHub issue.

- [ ] Given ..., when ..., then ...
- [ ] Works from the desktop app, the CLI and MCP (or states which are out of scope).

## Design

How it works at the level a new contributor can follow: which modules change, new types and functions, data flow. Link the [architecture](/architecture/overview.md) and any ADR. If this needs a new architectural decision, write the ADR first.

## Edge cases and failure modes

What happens with empty input, very long input, missing audio, a model that returns bad parameters, a cancelled job?

## Security and privacy

Files read or written, processes started, data leaving the machine, prompt-injection exposure.

## Verification

Tests to add (unit, engine end to end), eval tasks to add, manual checks.

## Open questions

Anything undecided, with who can answer it.
