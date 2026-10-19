# packages/bridges

Chat backends that drive the user's own, already installed and signed-in command-line agents, with dax's MCP tools exposed to them. Root rules in `/AGENTS.md` apply; this file adds package specifics. Design and policy: `docs/architecture/cli-bridges.md` and `docs/research/cli-subscription-bridges.md` (read the research before changing anything that spawns a CLI or changes its flags).

Test: `pnpm --filter @dax/bridges test` (fake CLI, no network, no real CLI). Build first if you run a dependent package alone: `pnpm --filter @dax/bridges build`.

## The rules this package lives by

- **Never read credentials.** Do not open `~/.claude/.credentials.json`, the macOS Keychain item, `~/.codex/auth.json`, or any token or key file of a CLI. Never ask a user to paste a token. Never run `setup-token` or `login` on the user's behalf. Sign-in state comes only from the CLI's own status command (exit code and non-secret fields).
- **Spawn the unmodified binary, nothing else.** No `--bare` (it turns off subscription login). No `--dangerously-skip-permissions`. Do not change the policy flags in `claude/command.ts` without a research update and a test change.
- **Only dax's tools.** The CLI may call only `mcp__dax__*`, and every built-in tool is off. Adding a tool to the allow-list is a security change: it needs a PR reason and a test.
- **The token never leaves memory, the MCP endpoint and the child's environment.** No argv, no file except the owner-only run folder, no log line, no chat event. Logs go through `redactSecrets`. The MCP config holds only `${DAX_MCP_TOKEN}`.
- **Environment is an allow-list** (`env.ts`). Never pass the whole `process.env` to a child. Credential-shaped names (`*_API_KEY`, `*_TOKEN`, `CLAUDE_CODE_*`) must stay out.
- **Prompts are data.** They go to stdin. Never build a shell string. Never log prompt text.
- **Filesystem hygiene.** Remove only the exact folder `mkdtemp` returned (per-run `run-*` folders and our own temp root). Never delete a parent folder. Tests use `makeTempDir()` and `removeTempDir()` from `src/test/fake-cli.ts`.
- **Process hygiene.** Children are spawned detached and ended by process group (`proc.ts`), with SIGTERM then SIGKILL. Every run must finish with its child gone, its endpoint closed and its folder removed, on normal end, error, cancel, timeout and `close()`.

## Module map

| File | Responsibility |
|---|---|
| `bridges.ts` | `createCliBridges()`: returns `{ extraProviders, statuses, close }` for the engine. Owns the detectors, the run registry and the temp root. |
| `claude/detect.ts` | `ClaudeDetector`: finds the binary, checks version and required flags, reads `claude auth status`. Caches per file and briefly per answer. |
| `claude/command.ts` | `buildClaudeArgs()` (the only place the command line is decided), `buildMcpConfig()`, the system prompt, the denied built-in list. Pure. |
| `claude/runner.ts` | `createClaudeRunner()`: one run = a loopback MCP endpoint on the engine's session, a spawn, stream mapping, cleanup. `RunRegistry` for shutdown. |
| `claude/events.ts` | `ClaudeEventMapper`: stream-json lines to `AgentEvent`s, stateful per run. Ignores unknown lines. |
| `codex.ts` | `CodexDetector`: detection only, reports "not supported yet" with the sign-in state. |
| `status.ts` | `BridgeStatus` and its conversion to `ProviderStatus`; version parsing. |
| `locate.ts` | Finds executables on `PATH` and in common install folders. Accepts `.exe`/`.com` only on Windows (no `.cmd` shims). |
| `env.ts` | `buildChildEnv()`: the environment allow-list. |
| `proc.ts` | `runProbe()` (short commands, timeouts, no shell) and `signalProcessTree()`. |
| `redact.ts` | `redactSecrets()`. |
| `test/fake-cli.ts`, `test/fixtures/` | The fake `claude` executable and a trimmed recording of a real run. |

## Adding or changing a CLI

1. Read the research doc section for that CLI and confirm its flags on the installed version (`--help`), not from memory.
2. Detection first: a status with a clear "next step" for every state. Test every state with the fake.
3. A runner only when the CLI can be restricted to our tools with flags that are confirmed. Otherwise leave it "not supported yet".
4. Map its event stream in its own mapper. Never reuse `ClaudeEventMapper` for another CLI's format.
5. Record a real run (scrubbed of ids and text) as a fixture, as `test/fixtures/claude-edit.jsonl` was made.

## Gemini

Deliberately not built. `GEMINI_DETAIL` in `bridges.ts` states why. Do not add a consumer-account path (see the research doc, section 3).
