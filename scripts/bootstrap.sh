#!/usr/bin/env bash
# One-command local setup for humans and agents: checks the toolchain,
# installs dependencies and enables the repo's git hooks.
# Safe to run repeatedly. Usage: pnpm bootstrap   (or: bash scripts/bootstrap.sh)
set -euo pipefail

cd "$(dirname "$0")/.."

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing: $1 -- $2" >&2
    return 1
  fi
}

missing=0
need node "install Node 22+ (see .node-version)" || missing=1
need pnpm "enable with: corepack enable" || missing=1
need ffmpeg "install FFmpeg (apt install ffmpeg | brew install ffmpeg | choco install ffmpeg)" || missing=1
need ffprobe "ships with FFmpeg" || missing=1
if [ "$missing" -ne 0 ]; then
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 20 ]; then
  echo "Node 20+ required, found $(node -v)" >&2
  exit 1
fi

pnpm install

# Hooks live in .githooks so they are versioned with the repo.
git config core.hooksPath .githooks
chmod +x .githooks/* 2>/dev/null || true

echo
echo "Setup complete. Run 'pnpm check' to confirm everything passes."
