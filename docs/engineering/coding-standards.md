---
type: Standard
title: Coding standards and commenting
description: Language, style, documentation and commenting rules for all code, enforced by Biome, TypeDoc and CI.
tags: [standards, typescript, comments]
status: stable
generated:
  by: process:implementer
  at: 2026-10-18T19:00:00Z
---

# Coding standards and commenting

Tools enforce what they can (`pnpm check`); this page covers what they cannot.

## Language and style

- **TypeScript, strict mode.** No `any` (lint error). Use `unknown` and narrow it.
- Formatting and import order are automatic: run `pnpm format`. Do not argue about style in reviews; fix the config instead.
- Prefer **pure functions** and plain data. The core edit operations take a `Project` and return a new one; they never mutate their input. Undo depends on that.
- Prefer small modules with one responsibility. Function bodies longer than about 40 lines are a signal to split.
- More than three positional parameters: use an options object.
- No blind non-null assertions (`x!`) in source code. Check and throw an error that says what was wrong. Tests may use `!` on fixtures they just built.
- Errors: throw `Error` with a message that names the offending value and what was expected. Never swallow errors silently.
- **Units:** times are seconds (floating point). Name them: `sourceTime` vs `timelineTime`, `durationSec`. Bytes are bytes. Mixing source time and timeline time is the most common bug in this codebase.

## Comments and documentation

The rule is: **a reader who has never seen the project can understand what each piece is for, and why it is the way it is.**

### 1. Every exported symbol has a TSDoc comment (enforced)

`pnpm docs:check` (TypeDoc with `notDocumented`) fails the build if an exported function, class, interface, type, variable, method or accessor has no doc comment. Write what a caller needs:

- what it does, in one sentence;
- units and valid ranges;
- what it throws and when;
- side effects (files written, processes started);
- link related symbols with `{@link Name}`.

```ts
/**
 * Remove the timeline range [from, to) and close the gap.
 * Later clips slide left by `to - from`. Throws if `to <= from`.
 */
export function deleteRange(p: Project, from: number, to: number): Project { ... }
```

Do not restate the name ("Gets the clip" on `getClip`). If you have nothing to add, the name or the design is probably unclear.

### 2. Every non-trivial file starts with a purpose comment

One to three lines saying what the module is for and what it must not do. Example: *"Pure edit operations on the timeline. Never touches the filesystem or FFmpeg."*

### 3. Inside functions, explain *why*, not *what*

Comment decisions, constraints and surprises: a workaround, a numeric tolerance, an FFmpeg quirk, an ordering that matters. Do not narrate obvious code. If a comment is needed to explain *what* a block does, consider extracting a well-named function instead.

### 4. Every feature has a doc

A user-visible feature has a spec before it is built (`docs/specs/`) and, once built, is described in the docs and reflected in `docs/STATUS.md`. A significant design choice has an ADR. Comments explain code; the knowledge base explains the product and the decisions. See [knowledge protocol](/engineering/knowledge-protocol.md).

### 5. Keep comments true

A wrong comment is worse than none. Change code and comment together. Delete commented-out code; git remembers it.

## Dependencies

- Only permissive licenses (MIT, Apache-2.0, BSD, ISC) or LGPL used as a separate process or dynamic library. Never AGPL/GPL code. Never a dependency that requires a paid license for our use.
- Justify every new dependency in the PR (what it does, why not write it ourselves, license, maintenance health).
- Dead dependencies and unused exports are caught by `pnpm deadcode` (knip).

## Security

- Agent-facing tools accept typed, validated parameters. Never pass user, model or file-derived strings to a shell or as raw FFmpeg arguments.
- Validate every path against the allowed folders (`LocalConnector`). Treat file names, transcripts and cloud content as untrusted.
- No secrets in the repo or in project files.
