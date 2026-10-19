# packages/local-llm

Runs the embedded open-weight model. Root rules in `/AGENTS.md` apply. The product requirements are in `docs/specs/product-v1.md` (section "packages/local-llm"); how models are judged is in `docs/evals/model-evaluation-plan.md`.

## What it does

| Module | Job |
|---|---|
| `hardware.ts` | `detectHardware()`: RAM, CPU, Apple Silicon, GPUs (best effort, never throws). |
| `catalog.ts` | `MODEL_CATALOG` (verified URLs, sizes, SHA-256, licences, tool-calling notes), `recommendModel()` by RAM tier. |
| `catalog-verify.ts` | Network check of catalog entries (`pnpm --filter @dax/local-llm catalog:verify`). |
| `download.ts` | `downloadFile()`: HTTP Range resume, `.part` + atomic rename, SHA-256, disk check, progress, abort. |
| `archive.ts` | `.tar.gz` and `.zip` extraction on `node:zlib` (zip-slip safe, keeps symlinks and modes). |
| `runtime.ts` | `ensureRuntime()`: pick the llama.cpp release asset for OS/arch/backend, verify the published digest, extract. |
| `process-guard.ts` | Kill process trees, parent-death watchdog, exit registry, pid-file reaping. |
| `server.ts` | `LlamaServer`: spawn, free port, health wait, `baseUrl`, crash detection, log ring buffer, stop. |
| `manager.ts` | `LocalModelManager`: `status() / install() / start() / stop() / uninstall()` plus events. |

The server (`packages/server`) and the agent use only what `src/index.ts` exports.

## Rules

- **Catalog entries must be verified.** Add a model only if its licence permits commercial use and redistribution (quote the model card), the repo is ungated, and `pnpm --filter @dax/local-llm build && pnpm --filter @dax/local-llm catalog:verify` passes. URLs are pinned to a commit hash; never use `main`. Update the tool-calling notes only with things you observed or the card says.
- **Never block on or require the network in default tests.** Tests use local mock servers (`src/test-helpers/file-server.ts`), generated archives (`archives.ts`) and a fake server script (`fake-llama-server.mjs`). Anything that needs the internet or a real `llama-server` goes in `src/live.test.ts` behind `DAX_LIVE_TESTS=1`.
- **No orphan processes.** Every spawned `llama-server` must be (a) in its own process group, (b) behind the shell watchdog on POSIX, (c) registered for exit cleanup, (d) recorded in the pid file. Do not weaken one of these without replacing it. Windows has no watchdog; it relies on (c) and (d), and the Tauri shell should add a job object.
- **Never build shell strings.** Arguments are always passed as an argv array. The watchdog script receives them as positional parameters.
- **The server listens on 127.0.0.1 only and always gets a random `--api-key`** unless the caller turns it off. Never log the key.
- The package has one runtime dependency (`zod`). Archive handling is ours on purpose; do not add `tar`/`unzip` packages or call OS archive tools.
- Sizes are bytes, times are milliseconds unless the name says seconds.

## Developing

```sh
pnpm --filter @dax/local-llm build
pnpm --filter @dax/local-llm test            # no network, no real model
pnpm --filter @dax/local-llm docs:check
pnpm exec biome check --write packages/local-llm
# real model, needs network and a llama-server binary (DAX_LLAMA_SERVER overrides the download):
DAX_LIVE_TESTS=1 pnpm --filter @dax/local-llm test live
DAX_LLAMA_SERVER=/path/llama-server node packages/local-llm/dist/scripts/live-bench.js --model gemma-4-e2b-qat-q4_0
```

Environment: `DAX_LLAMA_SERVER` (use this binary instead of downloading one). Unit tests clear it.
