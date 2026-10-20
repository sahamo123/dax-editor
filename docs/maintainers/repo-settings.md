---
type: Guide
title: GitHub repository settings checklist
description: The repository settings a maintainer must turn on so the rules in this repo are enforced, not just written down.
tags: [maintainers, github, security, process]
status: stable
generated:
  by: process:implementer
  at: 2026-10-18T19:05:00Z
---

# GitHub repository settings checklist

Files in the repo can describe the rules, but several protections can only be switched on in GitHub's settings by an owner. Tick these off once; record the date in `docs/log.md`.

## Branch protection for `main` (Settings, Branches, Add rule)

- [ ] Require a pull request before merging.
- [ ] Require status checks to pass: select `check (ubuntu-latest)` and `pr-title`. Require branches to be up to date.
- [ ] Require review from Code Owners (`.github/CODEOWNERS`).
- [ ] Dismiss stale approvals when new commits are pushed.
- [ ] Require conversation resolution before merging.
- [ ] Block force pushes and deletions.
- [ ] Do not allow bypassing the rules, except see the note below.

**Solo maintainer note:** GitHub does not let you approve your own PR. Until there is a second maintainer, either set required approvals to 0 and rely on CI, or leave approvals on and allow the owner to bypass for their own PRs. Re-enable strict review as soon as another maintainer joins.

## Merging

- [ ] Allow squash merging only; disable merge commits and rebase merging.
- [ ] Default the squash commit message to the PR title.
- [ ] Automatically delete head branches after merge.

## Security

- [ ] Enable private vulnerability reporting (Settings, Code security). `SECURITY.md` and the issue chooser point to it.
- [ ] Enable Dependabot alerts and security updates. `.github/dependabot.yml` configures version updates.
- [ ] Enable secret scanning and push protection.
- [ ] In Actions settings, set default workflow permissions to read-only (the workflow file also declares `contents: read`).
- [ ] Require approval for workflow runs from first-time contributors.

## Community

- [ ] Enable Discussions for questions and ideas (issues stay for work items).
- [ ] Add repository topics and a description.
- [ ] Create labels used by the templates and docs: `bug`, `enhancement`, `task`, `good first issue`, `help wanted`, `refactor`, `docs`, `blocked`, `needs-spec`.
- [ ] Provide a conduct-report email address and replace the interim contact in `CODE_OF_CONDUCT.md`.

## Optional later

- A project board over Issues for the roadmap phases.
- Signed commits, if the contributor base grows.
- Pin third-party GitHub Actions to commit SHAs (Dependabot can keep them updated). Today only GitHub's own `actions/*` are used.
