#!/bin/bash
# Claude Code cloud sessions: install dependencies so lint, typecheck and tests
# work immediately. Does nothing on a local machine (use `pnpm bootstrap` there).
# Idempotent and non-interactive.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# pnpm is provided through corepack; the exact version is pinned in package.json.
if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable
fi

# FFmpeg is required by the end-to-end tests. Install it only if missing.
if ! command -v ffmpeg >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    (apt-get update -qq && apt-get install -y -qq ffmpeg) || sudo apt-get install -y -qq ffmpeg
  fi
fi

# `install` rather than `--frozen-lockfile` so the cached container state stays reusable.
pnpm install

git config core.hooksPath .githooks
