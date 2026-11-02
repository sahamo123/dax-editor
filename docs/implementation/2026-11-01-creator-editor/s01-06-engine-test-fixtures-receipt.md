---
type: Guide
title: Engine test fixture typecheck repair
description: Evidence for correcting invalid project session fixtures without changing production code or compiler settings.
tags: [implementation, testing, engine, compatibility]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T18:25:00Z
---

# Engine test fixture typecheck repair

**State: IN_PROGRESS / self-reviewed.** [#258 / draft PR #261](https://github.com/sahamo123/dax-editor/pull/261), branch `codex/s01-06-engine-test-fixtures`, application/test head `7960135d19d8842fe9e6a5132d0eab6ed302ac76`, follows [PR #260](https://github.com/sahamo123/dax-editor/pull/260). This test-only child does not complete S01.06.

The extra engine-specific `pnpm --filter @dax/engine typecheck` previously failed nine `TS2554` errors on the preceding candidate and the earlier foundation. Existing runner and configuration tests called `new Session()` without the required project. They now use separate valid empty projects, preserving the test of distinct conversation sessions. Production code, TypeScript settings, dependencies and security/CI settings are unchanged.

The engine test-specific typecheck passed on the corrected candidate. Both affected test files passed 15 tests using local mock services. A full `pnpm check` passed at `7960135d19d8842fe9e6a5132d0eab6ed302ac76`: 1,955 package tests passed, 67 skipped, and 17 script tests passed (private log SHA-256 `f2d2201a6048b2abef8b4319cb305e2f4880fbb3b19c8c45108716771883b714`). A separate self-review checked the scoped diff and preserved assertions; this was not independent review.

The root `pnpm check` still invokes the production build rather than the extra engine test-specific typecheck. A future decision to expand the shared gate should be separately reviewed. The earlier intermittent bridge detector failures [#203](https://github.com/sahamo123/dax-editor/issues/203), actual keyboard-only picker and Narrator evidence [#177](https://github.com/sahamo123/dax-editor/issues/177), and native Windows/DPI acceptance remain open.
