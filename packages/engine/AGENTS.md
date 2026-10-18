# packages/engine

The launcher: starts `@dax/server` with the AI agent, skills, provider registry and, when supplied, the local model and speech-to-text wired in. This is the process the desktop app runs as its sidecar. Root rules in `/AGENTS.md` apply.

## Why a separate package

`@dax/server` deliberately imports neither `@dax/agent` nor the model runtimes (so it can be tested without them). This package is the one place that knows all of them. Anything that needs "the whole engine" (desktop sidecar, future headless mode) starts here.

## Module map

| File | Responsibility |
|---|---|
| `launch.ts` | `launch()`: builds the runner factory, provider registry and injects everything into `startServer`. `defaultSkillsDir()` finds the shipped `skills/` folder. |
| `runner.ts` | `createRunnerFactory()`: per chat message picks the provider from settings, attaches the skills matching the request, keeps conversation history per project session. |
| `providers.ts` | `createProviderRegistry()`: availability and hints shown in Settings. |
| `cli.ts` | The `dax-engine` executable (same flags and startup JSON line as `dax-server`). |

## Rules

- Missing configuration is a message to the user (an `error` event saying what to set), never a crash.
- API keys come only from `RunnerEnv.getApiKey`; never log them.
- A broken skills folder must not stop the editor starting.
- Adding a provider: extend `makeProvider` (HTTP providers) or pass `extraProviders` (processes such as signed-in CLIs), then report its status in `providers.ts`.
