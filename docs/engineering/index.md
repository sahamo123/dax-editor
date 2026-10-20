# Engineering standards

## Documents

* [Working with AI agents (the harness)](agent-workflow.md) - How any AI agent picks up, does and hands off work in this repo, how to onboard a new agent in minutes, and the guardrails that apply.
* [Coding standards and commenting](coding-standards.md) - Language, style, documentation and commenting rules for all code, enforced by Biome, TypeDoc and CI.
* [Frameworks and standards we adopted](frameworks.md) - Which existing standards, templates and tools the repo reuses instead of inventing its own, and where each one shows up.
* [Git and pull request workflow](git-workflow.md) - Trunk-based branching, Conventional Commits, small squash-merged pull requests, and what CI and review require.
* [Handoff: how another agent resumes dax-editor](handoff.md) - Where the build stopped, what is merged, every dependency and system tool the build needs and where each is pinned, the unfinished patch and its state, and the order of the remaining work. Read this first when resuming from the repository alone.
* [Knowledge protocol (how the repo remembers)](knowledge-protocol.md) - How work is recorded in docs/ as an Open Knowledge Format bundle so any agent or person can resume where the last one stopped.
* [Refactoring guide](refactoring.md) - When and how to refactor safely: separate commits, tests green throughout, small steps, and the tools that find candidates.
* [Testing standards](testing.md) - What to test, how, and what must never happen in tests (no network, no committed media), including how model behavior is evaluated.
* [Windows laptop implementation plan](windows-desktop-plan.md) - Two-hour implementation sequence, local dependency layout, acceptance gates, and follow-up scope for the first usable Windows desktop build.
