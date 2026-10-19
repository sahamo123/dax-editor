# packages/agent

Turns a chat message into edits by calling the command registry, for any model. Root rules in `/AGENTS.md` apply; read the "packages/agent" section of `docs/specs/product-v1.md` first.

The agent never edits a project any other way than `tryRunCommand` from `@dax/core` with `source: "ai"`, so every AI edit is validated, undoable and labelled in the history like a manual one. It has no UI, no server and no vendor SDK: providers use plain `fetch`.

## Module map

| File | Responsibility |
|---|---|
| `types.ts` | Provider-neutral vocabulary: `ChatMessage`, `ToolCall`, `AgentProvider`, `ProviderRequest/Response`. |
| `agent.ts` | `createAgent(...).run(message, {session, history, onEvent, signal, allowedRoots})`: the loop. Emits `AgentEvent` from `@dax/protocol`. |
| `tool-runner.ts` | Runs one call: parse/repair arguments, coerce types, validate, `tryRunCommand`, classify the outcome (`ok` / `failed` / `invalid`). |
| `tools.ts` | `ToolStyle` (`full`, `compact`, custom), `toolSignature`, `coerceArguments`. |
| `prompt.ts` | `DEFAULT_SYSTEM_PROMPT` and `buildSystemPrompt`. |
| `json-repair.ts` | `parseJsonLoose`: tolerant JSON parser (quotes, commas, fences, truncation). |
| `text-tool-calls.ts` | `extractTextToolCalls`: tool calls written as text; `stripThinking`. |
| `providers/openai.ts` | OpenAI-compatible `/chat/completions` (llama-server, Ollama, LM Studio, OpenAI, OpenRouter, Gemini compat). |
| `providers/anthropic.ts` | Anthropic `/v1/messages`. |
| `providers/http.ts` | Shared `postJson` (timeout, abort, retry on 429/5xx), SSE reader, `ProviderError`. |
| `scripted.ts` | `ScriptedProvider` for tests (also useful to the server and evals tests). |

## The loop in one paragraph

Build the system prompt (default rules + "you cannot export" note + optional `contextProvider` guidance). Call the provider. Strip `<think>` blocks. If it made no native tool calls, look for calls written as text. For each call (at most `maxToolCallsPerTurn`): parse and repair the arguments, coerce `"2"` to `2`, validate with the command's zod schema, run it. Feed the summary (plus compact JSON data) or a clear error back as a `tool` message. Stop when the model answers without tools, on cancel, on `maxTurns`, on a provider error, or when the same call has failed `maxRepeatedFailures` times.

## Rules for changing this package

- **The system prompt is the most important text here.** Keep it short (numbered rules, plain words). `prompt.test.ts` pins the key rules and fails if a tool name in the prompt does not exist in the registry. Change prompt and test together, and re-run the evals on a small local model before and after.
- Error messages go to a language model: say what was wrong and how to fix it (`Usage: delete_range(from: number, to: number)`).
- A repaired call counts as valid but is counted in `repaired`; a call that cannot run because the call itself was wrong counts as `invalid`; a valid call whose command reported a problem counts as `failed`. Evals report these numbers, so keep the definitions stable.
- Token counts are only what the backend reported. If any round trip lacks usage, `usageComplete` is false and callers must not present the sums as exact.
- Irreversible commands (`export_video`) are removed from the tools and refused at run time unless `allowIrreversible` is set. Do not add a way around this.
- Never log or echo request headers or API keys; `ProviderError` messages must not contain them.
- Tests use scripted `node:http` servers (`mock-server.test-util.ts`) and `ScriptedProvider`; no network, no committed media. `e2e.test.ts` uses the real `Session` and an FFmpeg-generated fixture and is skipped when FFmpeg is missing.

## Adding a provider

Implement `AgentProvider.chat` (one round trip, abortable, return `usage` only if the backend reports it, leave tool-call `arguments` as the raw string if you got a string), reuse `postJson`/`readSse`, export it from `index.ts`, and add a mock-server test file next to the others.
