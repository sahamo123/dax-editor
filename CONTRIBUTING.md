# Contributing to dax-editor

Thanks for helping. This project is meant to be built by many people and many tools (human or AI), so the rules below are written down rather than assumed.

If you are an AI agent, read [AGENTS.md](AGENTS.md) first. It is the same information in the form agents need.

## Quick start

```sh
git clone https://github.com/sahamo123/dax-editor.git
cd dax-editor
corepack enable          # gives you the pinned pnpm
pnpm bootstrap           # checks Node + FFmpeg, installs deps, enables git hooks
pnpm check               # should pass before you change anything
```

You need Node 22+ and FFmpeg (`apt install ffmpeg`, `brew install ffmpeg`, or `choco install ffmpeg`).

## Finding something to do

- Work lives in **GitHub Issues**. Look for `good first issue` and `help wanted`.
- Comment on the issue to claim it before starting. One person (or agent) per issue.
- Have an idea that is not an issue yet? Open a feature request first so we can agree on the approach before you write code.
- Larger changes need a short spec in `docs/specs/` and, if they change the architecture, an ADR in `docs/adr/`.

## Making a change

1. Branch from `main`: `feat/short-description`, `fix/short-description`, `docs/...`.
2. Make the change in small steps. Add or update tests. Comment public code (TSDoc); `pnpm docs:check` enforces it.
3. Run `pnpm check`. It runs exactly what CI runs.
4. Commit with [Conventional Commits](https://www.conventionalcommits.org/): `feat(core): add keepRanges`, `fix(render): handle clips without audio`. A git hook checks this.
5. Open a pull request using the template. The PR title uses the same format.
6. Respond to review. Squash-merge happens once CI is green and a maintainer approves.

Keep pull requests small (roughly under 400 changed lines) and about one thing. Refactors go in their own PR or commit, separate from behavior changes.

## Standards

- [Coding standards and commenting](docs/engineering/coding-standards.md)
- [Testing](docs/engineering/testing.md)
- [Refactoring](docs/engineering/refactoring.md)
- [Git workflow](docs/engineering/git-workflow.md)
- [Working with AI agents](docs/engineering/agent-workflow.md)

## Licensing of contributions

The project is licensed under [Apache-2.0](LICENSE). By submitting a contribution you agree it is licensed under Apache-2.0, as described in section 5 of that license. You do not need to sign anything else.

**You must have the right to contribute what you submit.** In particular:

- Do not copy code from projects under incompatible licenses (AGPL, GPL, or "source-available" licenses). We study related projects such as OpenChatCut for *ideas* and record them in `docs/research/`, but we never copy their code.
- Do not add dependencies that need a paid license for our use, or that are not OSI-approved permissive/LGPL. Say why you need any new dependency in the PR.
- AI-generated code is welcome, but you are responsible for checking its provenance and license just as you would for code you wrote yourself.

## Security

Do not open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).

## Code of conduct

Everyone participating is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
