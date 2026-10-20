# packages/engine

The launcher: starts `@dax/server` with the AI agent, skills, provider registry, the embedded local model and speech-to-text wired in. The last two are on by default (see below). This is the process the desktop app runs as its sidecar. Root rules in `/AGENTS.md` apply.

## Why a separate package

`@dax/server` deliberately imports neither `@dax/agent` nor the model runtimes (so it can be tested without them). This package is the one place that knows all of them. Anything that needs "the whole engine" (desktop sidecar, future headless mode) starts here.

## Module map

| File | Responsibility |
|---|---|
| `launch.ts` | `launch()`: builds the runner factory, provider registry and injects everything into `startServer`. Bridges are on by default (`createCliBridges`); inject `cliBridges` in tests or pass `false`. They close with the server. The built-in model and speech are on by default too (see below). `defaultSkillsDir()` finds the shipped `skills/` folder. |
| `local-model.ts` | `createLocalModelController()`: the built-in model on `@dax/local-llm`'s `LocalModelManager`. Maps its status to the protocol's `LocalModelStatus`, and gives the `local` provider the running server's address and key (`localConnection()`). |
| `speech.ts` | `createSpeechTranscriber()`: the default speech engine on `@dax/stt` (whisper.cpp). Turns a missing runtime or model into `transcription unavailable: <reason>`. |
| `runner.ts` | `createRunnerFactory()`: per chat message picks the provider from settings, attaches the skills matching the request, keeps conversation history per project session. `localProviderSettings()` decides how the `local` provider reaches the model. |
| `providers.ts` | `createProviderRegistry()`: availability and hints shown in Settings. The `cli-*` rows come from `cliStatuses` (the bridges). |
| `cli.ts` | The `dax-engine` executable (same flags and startup JSON line as `dax-server`). |

## Built-in model and speech

- **Defaults:** `launch()` builds both controllers. Source checkouts do not download, install or start a model by default. The packaged Windows x64 app seeds its verified bundled model/runtime and starts the local provider on first launch (ADR 0012); it never fetches model bytes at runtime. Saved external-provider choices and a recorded model uninstall are respected. Speech remains opt-in.
- **Offline bundle:** `offline-bundle.ts` verifies model, runtime archive and app-local C++ DLL hashes before seeding app data. `offlineBundleDir: false` disables seeding for tests/embedders. Runtime/model provenance is prepared at build time by `apps/desktop/scripts/prepare-offline-ai.mjs`.
- **Model choice:** the controller's `status().recommendation` is the catalog model for this machine (`recommendModel`). `install` takes an optional catalog id; `start` loads the installed model the manager would pick (recommended, then the default, then the first installed one), with its catalog context window.
- **Speech choice:** the whisper.cpp model is `SpeechModelManager.recommend()` for this machine, from the `@dax/stt` catalog, unless `speechOptions.modelId` says otherwise.
- **Injection:** `localModelController` (an instance, or `false` for "not supported in this build"), `localModelOptions` (test seams for the default manager: `detect`, `fetch`, `runtime`), `transcriber` (an instance, or `false`) and `speechOptions` (for example `binaryPath`, `autoInstall`).
- **Status mapping:** `toProtocolStatus()` is pure. `supported` is false when llama.cpp publishes no build for the platform. `baseUrl` is set only while the server runs. `detail` is one line for the UI, with the first line of any crash or start error.
- **Connection:** while the model runs, the `local` provider uses the server's base URL, its bearer key (the server always starts with one), the loaded model's catalog name and its context window. Settings override the name and the window. A controller without `connection()` (an injected fake) is read through its status, with no key.

## Rules

- Missing configuration is a message to the user (an `error` event saying what to set), never a crash.
- API keys come only from `RunnerEnv.getApiKey`; never log them. The built-in model's bearer key lives only in the running manager and the request header, and is never logged or returned.
- A broken skills folder must not stop the editor starting.
- Adding a provider: extend `makeProvider` (HTTP providers) or pass `extraProviders` (processes such as signed-in CLIs), then report its status in `providers.ts`.
- The `cli-*` providers are served by `@dax/bridges`. Do not spawn CLIs from this package. Their credentials are never read (see the bridges AGENTS.md).
- Nothing in this package downloads on its own. A model download is the user's `install`; speech downloads only when `speechOptions.autoInstall` is set, and the default is off.
- A transcription that fails because the runtime or model is missing says `transcription unavailable: <reason>`. Other failures (cancel, unreadable audio, timeout) keep their own error, so they are not mistaken for a setup problem.
- Tests inject a fake manager, a fake transcriber or a missing `binaryPath`. They must not touch the network. The live llama.cpp tests stay in `@dax/local-llm` (`DAX_LIVE_TESTS=1`).

## Rules

- Missing configuration is a message to the user (an `error` event saying what to set), never a crash.
- API keys come only from `RunnerEnv.getApiKey`; never log them.
- A broken skills folder must not stop the editor starting.
- Adding a provider: extend `makeProvider` (HTTP providers) or pass `extraProviders` (processes such as signed-in CLIs), then report its status in `providers.ts`.
- The `cli-*` providers are served by `@dax/bridges`. Do not spawn CLIs from this package. Their credentials are never read (see the bridges AGENTS.md).
