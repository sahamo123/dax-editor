---
type: Standard
title: Testing standards
description: What to test, how, and what must never happen in tests (no network, no committed media), including how model behavior is evaluated.
tags: [standards, testing, evals]
status: stable
generated:
  by: process:implementer
  at: 2026-10-18T19:00:00Z
---

# Testing standards

## Layers

| Layer | Tool | What it covers | Speed |
|---|---|---|---|
| Unit | Vitest | Pure logic: timeline operations, parsers, scoring. | milliseconds |
| Engine end to end | Vitest + FFmpeg | Real media in, real media out (probe, detect, render). Skipped automatically if FFmpeg is missing. | seconds |
| Scripts | `node --test` | The OKF validator and index generator in `scripts/`. | milliseconds |
| Model evals | `packages/evals` | Whether a model can edit video. See [evaluation overview](/evals/overview.md). | slower |

## Rules

1. **Every behavior change comes with a test.** Every bug fix comes with a regression test that fails before the fix.
2. **No network in tests.** Anything that needs a service is behind an interface and tested with a fake.
3. **Do not commit media.** Generate it with FFmpeg's `lavfi` sources (see `packages/evals/src/fixtures.ts` and `engine.test.ts`) so every machine gets identical inputs.
4. **Separate parsing from running.** Functions that parse FFmpeg output are pure and unit-tested with captured text; the functions that run FFmpeg are covered by the end-to-end tests.
5. **Name tests as behaviors**: `it("deletes a range spanning a clip boundary")`, not `it("test 3")`.
6. **Test the contract, not the implementation.** Prefer asserting on the resulting timeline over asserting on which helper was called.
7. Time-based assertions use tolerances, never exact floating-point equality, unless the value is constructed exactly.
8. Tests clean up their temp files.

## Running

```sh
pnpm test               # all tests (runs package tests, then script tests)
pnpm build              # packages that depend on each other must be built first
pnpm check              # everything CI runs
```

## Agent behavior is tested with evals, not unit tests

A model's output is non-deterministic, so it is measured over a set of tasks with outcome-based checks. The deterministic oracle adapter proves the harness itself works and runs in CI.
