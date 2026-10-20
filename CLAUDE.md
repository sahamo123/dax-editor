@AGENTS.md

# Claude Code specifics

Everything that matters is in `AGENTS.md` (imported above). To resume the build, start with `docs/engineering/handoff.md`. Only Claude Code-specific notes live here.

- A `SessionStart` hook (`.claude/hooks/session-start.sh`) installs dependencies in cloud sessions. Locally, run `pnpm bootstrap` once.
- Keep this file tiny. If a rule applies to every agent, put it in `AGENTS.md`, not here.
