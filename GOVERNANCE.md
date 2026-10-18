# Governance

dax-editor is a young project with a single founding maintainer. This document keeps decision-making clear now and describes how it opens up as more people join.

## Roles

- **Maintainer:** merges pull requests, manages releases, and owns the roadmap. Listed in `.github/CODEOWNERS`.
- **Contributor:** anyone who opens an issue, a PR, or reviews. Contributors are welcome from day one.

## How decisions are made

- Day-to-day changes: a PR with passing CI and a maintainer's approval.
- Anything that changes the architecture, a public interface, the license, or a major dependency: write an **ADR** in `docs/adr/` and discuss it in the PR. A maintainer decides after discussion; the ADR records the outcome and the alternatives considered.
- Disagreements are settled on the merits in the open (issue or PR). If consensus fails, the lead maintainer decides.

## Becoming a maintainer

After sustained, high-quality contributions (code, review, or triage) over a few months, an existing maintainer may invite you. Maintainers are expected to review promptly, follow the [Code of Conduct](CODE_OF_CONDUCT.md), and protect the project's constraints in [AGENTS.md](AGENTS.md): free and open source, agent-agnostic, GitHub as source of truth.

## Project principles

1. Entirely free and open source; no feature requires a paid service.
2. Local-first: user media stays on the user's machine unless they choose otherwise.
3. Every capability is reachable three ways: desktop app, CLI, MCP.
4. The repo is self-describing: someone (or some agent) new can pick it up from the files alone.
