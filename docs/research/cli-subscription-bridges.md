---
type: Research
title: CLI subscription bridges
description: Whether dax-editor can let users drive their own ChatGPT, Claude or Gemini subscriptions through the official CLIs, which flags make that possible, and where the vendor terms draw the line.
tags: [research, agents, mcp, licensing, cli, subscriptions]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T20:00:00Z
---

# CLI subscription bridges

> **Not legal advice.** An engineering reading of vendor pages fetched on 2026-10-18. Quotes are verbatim unless marked "summarized fetch", which means they must be checked against the live page. Unverified claims are marked (unverified).

## Recommendation

1. **Build first: a Claude Code bridge.** Spawn the user's own installed `claude`, already signed in with their own account, against our localhost MCP server. Anthropic's compliance page allows an end user to sign in "to the unmodified Claude Code binary with their own Claude subscription". We never read, copy or store the credential.
2. **Build second: a Codex bridge that prefers an API key (`CODEX_API_KEY`).** OpenAI directs programmatic and CI use to API keys. ChatGPT sign-in is allowed by the CLI but has no explicit grant for third-party apps, so keep it opt-in with a warning.
3. **Do not build a Gemini consumer-account bridge.** Google's terms call "using third-party software, tools, or services" with CLI OAuth a violation, and the Gemini CLI stopped serving consumer accounts on 2026-06-18.
4. **Always offer an API-key provider** (Anthropic, OpenAI, Gemini) that calls the vendor with the user's own key, stored only on their machine.
5. **Never** read `~/.claude/.credentials.json`, the macOS Keychain item, `~/.codex/auth.json` or any OAuth token. Never ask users to paste a subscription token. Never run a hosted proxy that forwards subscription logins.

Compliance stance: a desktop-only, single-user bridge that spawns the user's own official binary is the closest reading of the published rules. A hosted multi-user version would be intermediation, which every vendor below prohibits.

## 1. Claude Code (`claude`)

**Detect and check login**

- `claude --version`.
- `claude auth status`: "Exits with code 0 if logged in, 1 if not." The JSON `authMethod` is `none`, `claude.ai`, `oauth_token`, `api_key`, `api_key_helper` or `third_party`.
- Precedence: "In non-interactive mode (`-p`), the key is always used when present." An `ANTHROPIC_API_KEY` beats the subscription login in `-p` runs.

**Run headless**

```sh
claude -p "<prompt>" \
  --output-format stream-json --verbose --include-partial-messages \
  --safe-mode \
  --strict-mcp-config --mcp-config "$SESSION_DIR/mcp.json" \
  --tools "" \
  --allowedTools "mcp__dax__*" \
  --permission-mode dontAsk --permission-prompts none \
  --append-system-prompt-file "$SESSION_DIR/system.txt" \
  --max-turns 25 --max-budget-usd 2
```

- `--tools ""`: "Use `""` to disable all" built-in tools. "The flag doesn't affect MCP tools."
- `--allowedTools`: tools that "execute without prompting". It only auto-approves. It is not a sandbox.
- `--permission-mode dontAsk`: "Claude Code denies every call that would otherwise prompt." `--permission-prompts none` needs v2.1.259 or later.
- `--safe-mode` (version unverified): "Authentication, model selection, built-in tools, and permissions work normally". It disables CLAUDE.md, hooks, plugins and MCP servers.
- `--max-budget-usd` is a client-side estimate. `--max-turns` "Exits with an error when the limit is reached."
- **Do not use `--bare` with a subscription.** "In bare mode, Claude Code never reads OAuth credentials or the system keychain."
- Exit codes: "code 0 on success and a non-zero code when the run fails". In-run failures, such as missing authentication, "print the failure as the result on stdout". Read `is_error` as well as the exit code.

**MCP config JSON**

HTTP, the preferred transport (see Pitfall 1):

```json
{
  "mcpServers": {
    "dax": {
      "type": "http",
      "url": "http://127.0.0.1:47831/mcp",
      "headers": { "Authorization": "Bearer ${DAX_SESSION_TOKEN}" }
    }
  }
}
```

Stdio fallback, a small shim that proxies to the same endpoint:

```json
{
  "mcpServers": {
    "dax": {
      "type": "stdio",
      "command": "/path/to/dax-mcp-shim",
      "args": ["--url", "http://127.0.0.1:47831/mcp"],
      "env": { "DAX_SESSION_TOKEN": "${DAX_SESSION_TOKEN}" }
    }
  }
}
```

Allow rules name tools as `mcp__<server>__<tool>`, so `mcp__dax__*` matches every tool from our server.

**Readiness, streaming, cancellation**

- Check `system/init` for `mcp_servers` (`name`, `status`) and `mcp_server_errors` before sending any prompt.
- Stream events: `system`, `stream_event` (text deltas), `assistant` and `user` messages (tool_use and tool_result blocks), then a final `result` with `result`, `session_id`, `total_cost_usd` and `permission_denials`.
- Cancellation: "If you stop a `claude -p` run with SIGTERM ... Claude Code exits with code 143 ... leaves the turn that was in progress unfinished." "To end the turn instead, send SIGINT."
- Background work can keep a `-p` run open up to 10 minutes. Control with `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS`.

## 2. OpenAI Codex CLI (`codex`)

Sources are learn.chatgpt.com pages (the developers.openai.com URLs redirect there).

**Sign-in and detection**

- "Sign in with ChatGPT for subscription access" or "Sign in with an API key for usage-based access".
- `codex login status` shows "the active authentication method". `codex login --device-auth` is for headless machines (beta).
- Storage: "Codex caches login details locally in a plaintext file at `~/.codex/auth.json` or in your OS-specific credential store." "Treat `~/.codex/auth.json` like a password."

**Run headless**

```sh
CODEX_API_KEY="$USER_KEY" codex exec --json --ephemeral \
  --sandbox read-only \
  --cd "$SESSION_DIR" --skip-git-repo-check \
  -o "$SESSION_DIR/last-message.txt" \
  "<prompt>"
```

- Progress goes to stderr and the final message to stdout. `--json` "makes `stdout` a JSON Lines stream": `thread.started`, `turn.started`, `turn.completed`, `turn.failed`, `item.*`, `error`.
- `--sandbox`: `read-only` (default), `workspace-write`, `danger-full-access`. "`--full-auto` is no longer supported."
- `--cd` appears on the redirected reference, not the exec page (unverified on this page). Exit codes are not documented (unverified).
- "Do not set `OPENAI_API_KEY` or `CODEX_API_KEY` as a job-level environment variable" in workflows that run repository-controlled code.

**MCP config (`~/.codex/config.toml`, or a trusted project's `.codex/config.toml`)**

```toml
[mcp_servers.dax]
url = "http://127.0.0.1:47831/mcp"
bearer_token_env_var = "DAX_SESSION_TOKEN"      # the token is read from the environment, never written here
enabled_tools = ["get_timeline", "apply_edit"]  # example names; use our real tool list
startup_timeout_sec = 10                        # default 10
tool_timeout_sec = 120                          # default 60
required = true                                 # codex exec fails if this server does not start

[features]
shell_tool = false    # "Enable command execution tools" (default on)
apps = false
multi_agent = false
web_search = "disabled"
```

- `enabled_tools` is an allow list. `disabled_tools` applies after it.
- Per-run `-c key=value` overrides are not confirmed on these pages (unverified).

## 3. Google Gemini CLI, and its replacement

**Consumer access has ended.** The Gemini CLI docs say "Gemini CLI was replaced by Antigravity CLI on June 18th, 2026," for "Unpaid tier and Google One users". Google's Antigravity CLI announcement calls it "the most lightweight way to invoke, monitor, and interact with Antigravity agents". Its headless flags and MCP config were not confirmed (unverified). Its binary is `agy`.

**Gemini CLI, API-key use only (legacy)**

- Auth: "Sign in with Google (recommended for most users)", a "Gemini API key from Google AI Studio, set as `GEMINI_API_KEY`", or Vertex AI.
- Headless: triggered by a non-TTY run or by `-p`/`--prompt`. `-o` takes `text`, `json` or `stream-json`. `--approval-mode` takes `default`, `auto_edit`, `yolo`, `plan`.
- Exit codes: `0` success, `1` general or API failure, `42` bad input, `53` turn limit.
- MCP in `settings.json`: transport is chosen by key (`command`, `url` for SSE, `httpUrl` for HTTP). Options include `headers`, `timeout` (default 600000 ms), `trust` (default `false`), `includeTools`, `excludeTools`.

```sh
GEMINI_API_KEY="$USER_KEY" gemini -p "<prompt>" -o stream-json \
  --approval-mode default --allowed-mcp-server-names dax
```

Do not build a Gemini subscription path. A direct API call with the user's key is simpler.

## 4. Policy

**Anthropic** ([legal-and-compliance](https://code.claude.com/docs/en/legal-and-compliance), verbatim)

- "OAuth authentication is intended exclusively for purchasers of Claude Free, Pro, Max, Team, and Enterprise subscription plans and is designed to support ordinary use of Claude Code and other native Anthropic applications."
- "Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users. Moreover, developers may not collect, store, or intermediate Claude.ai credentials or session tokens — sign-in to a Claude account must complete through Anthropic's own flow."
- "Nor does it prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription."
- "The Claude Code binary must not be modified." "Anthropic reserves the right to take measures to enforce these restrictions and may do so without prior notice."
- "For questions about permitted authentication methods for your use case, please contact sales." Use this to confirm the bridge in writing.

**Anthropic Consumer Terms** ([consumer-terms](https://www.anthropic.com/legal/consumer-terms), summarized fetch)

- Section 3 bars access "through automated or non-human means, whether through a bot, script, or otherwise," "Except when you are accessing our Services via an Anthropic API Key or where we otherwise explicitly permit it."
- Section 2: "You may not share your Account login information, Anthropic API key, or Account credentials with anyone else."
- Our reading: the unmodified-binary sentence is the explicit permission the automation clause refers to. This is our interpretation, not Anthropic's.
- `claude setup-token` is documented as "Generate a long-lived OAuth token for CI and scripts." Do not collect or store it in our app.

**OpenAI**

- Codex auth ([learn.chatgpt.com/docs/auth](https://learn.chatgpt.com/docs/auth), verbatim): "Access tokens are intended for trusted scripts, schedulers, and private CI runners." "Use API key authentication for programmatic Codex CLI workflows, such as CI/CD jobs."
- A maintainer on 2026-02-09 called the terms "quite permissive" and noted that "OSS projects like OpenCode are doing things similar" ([discussion #8338](https://github.com/openai/codex/discussions/8338), summarized fetch). That is not a grant, and no maintainer addressed ChatGPT sign-in for third-party tools.
- OpenAI Terms of Use ([openai.com/policies/terms-of-use](https://openai.com/policies/terms-of-use/)): HTTP 403, not read. Secondary reports describe generic "automatically or programmatically" language (unverified).

**Google** ([geminicli.com tos-privacy](https://geminicli.com/docs/resources/tos-privacy/), summarized fetch)

- "using third-party software, tools, or services (for example, using OpenClaw with Gemini CLI OAuth) is a violation of applicable terms and policies." "Such actions may be grounds for suspension or termination of your account."

**Third-party reports (context only).** Search results describe Anthropic blocking third-party tools from subscription OAuth in early 2026, with enforcement from April. These are news and blog sources, not primary, so they are not used as citations.

## 5. Reference design: OpenChatCut (ideas only, AGPL-3.0)

Read from its README on 2026-10-18. No code read or copied. See [OpenChatCut learnings](openchatcut-learnings.md).

- Streamable HTTP MCP at `http://localhost:5199/api/external-mcp/mcp`. Claude Code: `claude mcp add --transport http openchatcut <url>`. Codex: a `[mcp_servers.openchatcut]` block with `url`.
- A bearer token from `OPENCHATCUT_MCP_TOKEN`. "designed for one user on one machine".
- Drafts via `begin_edit_session` and `review_edit_session`, with `approvalMode` `manual` or `auto`. The draft commits as one undo step. Generation, export and deletion are excluded from drafts.

We take the shared tool surface, single-user localhost bridge and draft-with-one-undo. We do not copy any code.

## 6. Design

- **Discovery.** Look up binaries on `PATH` (`command -v`, or `where` on Windows). Read `--version`. Show what was found, and refuse unknown versions.
- **Login check.** Claude: `claude auth status`, exit 0 means logged in. Warn when `authMethod` is `api_key`, because `-p` will bill the key. Codex: `codex login status` on stdout (exit code unverified).
- **Per-session setup.** Create `~/.dax/sessions/<id>/` at mode 0700, with an empty workspace. Never run in the user's project: without `--bare`, `-p` loads a project's `.mcp.json` and hooks "even in a folder you've never trusted". Write `mcp.json` with `${DAX_SESSION_TOKEN}` as a placeholder. The token never lands in a file.
- **Token.** 256-bit random per session. The server accepts it only for that session's tools, and revokes it on end or idle timeout. "One-time" means single-session, since a session makes many calls.
- **Localhost server.** Bind `127.0.0.1`. Reject `Host` and `Origin` headers that are not localhost, which blocks DNS rebinding. Require the bearer token.
- **Allow-list, three layers.** (1) CLI: Claude `--tools ""`, `--strict-mcp-config`, `--allowedTools "mcp__dax__*"`, `dontAsk`; Codex `features.shell_tool = false`, `web_search = "disabled"`, `enabled_tools`, `--sandbox read-only`. (2) Server: `tools/list` returns only editing tools, and `tools/call` rejects everything else, so a CLI flag change cannot widen access. (3) Code: typed, validated parameters, with no shell and no raw FFmpeg arguments, as AGENTS.md requires.
- **Spawn.** `spawn` with `detached: true` so the child has its own process group. Minimal environment: `PATH`, `HOME`, and what the CLI's credential store needs, plus `DAX_SESSION_TOKEN`. In subscription mode, remove `ANTHROPIC_API_KEY` from the child environment so the subscription is used.
- **Streaming.** Parse stdout as NDJSON line by line. Show text deltas, and a progress card per `mcp__dax__*` tool call. Take the edit record from our server, not the CLI stream, since the server log is the authority for undo.
- **Cancellation.** SIGINT to the group, wait 5 seconds, then SIGTERM, then SIGKILL. Revoke the token, discard any open draft, and kill MCP children (Pitfall 2).
- **Timeouts.** Wall clock (for example 20 minutes total, 5 idle). Claude `--max-turns`, `--max-budget-usd`, `MCP_TIMEOUT`. Codex `startup_timeout_sec`, `tool_timeout_sec`.
- **Exit handling.** Exit 0 with `is_error: false` is success. Exit 0 with no output is a failure (Pitfall 1). Capture stderr, but never log tokens.
- **Fallback.** If the CLI is missing, not logged in, or an unknown version, offer the API-key provider. Never log in on the user's behalf.

## 7. Pitfalls

1. **HTTP MCP can exit silently.** A report against Claude Code 2.1.71 says `claude -p` with `"type":"http"` exited 0 with no stdout or stderr. It was closed as a duplicate and no fix is named. Fix: check `system/init` before the first prompt, and use the stdio shim fallback. Source: [claude-code#32191](https://github.com/anthropics/claude-code/issues/32191).
2. **MCP children outlive `-p` runs.** A report against 2.1.81 describes orphaned `bun` processes, "OOM at ~236 sessions". `--strict-mcp-config` did not stop project `.mcp.json` children. Fix: process group plus group kill on finish, an empty working directory, and `{"mcpServers": {}}` for runs that need no tools. Source: [claude-code#40927](https://github.com/anthropics/claude-code/issues/40927).
3. **A stray API key silently changes billing.** `-p` always uses `ANTHROPIC_API_KEY` when set, so a user who thinks they are on a subscription is billed by API. Fix: strip the variable in subscription mode and show `authMethod` in the UI ([authentication](https://code.claude.com/docs/en/authentication)).
4. **`--bare` is the wrong flag here.** It never reads OAuth or keychain, so a subscription user gets an authentication error. Use `--safe-mode`, and confirm its version on the target CLI.
5. **Consumer access can disappear.** Gemini CLI ended for consumer accounts on 2026-06-18, and third-party OAuth use was blocked for other harnesses in early 2026. Fix: detect capability at runtime, keep the API-key provider as the default fallback, re-read the policy pages each release, and never make consumer OAuth a shipped dependency.
6. **Codex config and auth can conflict.** A third-party recipe points `CODEX_HOME` at a minimal directory and symlinks `auth.json` into it (unverified, not official). Relocating `CODEX_HOME` can hide the user's login (inference from the file location). Fix: use only supported config paths or the API-key route, and never copy or link `auth.json`.

## Sources

Fetched 2026-10-18.

- Claude Code: [headless](https://code.claude.com/docs/en/headless), [CLI reference](https://code.claude.com/docs/en/cli-reference), [authentication](https://code.claude.com/docs/en/authentication), [legal and compliance](https://code.claude.com/docs/en/legal-and-compliance), [MCP](https://code.claude.com/docs/en/mcp), [permissions](https://code.claude.com/docs/en/permissions)
- Anthropic: [Consumer Terms](https://www.anthropic.com/legal/consumer-terms) (summarized fetch); [consumer-terms update, 2025-08-28](https://www.anthropic.com/news/updates-to-our-consumer-terms) (no relevant text)
- Codex, redirected to learn.chatgpt.com: [auth](https://learn.chatgpt.com/docs/auth), [non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), [MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [config reference](https://learn.chatgpt.com/docs/config-file/config-reference)
- OpenAI: [Codex discussion #8338](https://github.com/openai/codex/discussions/8338); [Terms of Use](https://openai.com/policies/terms-of-use/) (HTTP 403, not read)
- Gemini CLI: [headless (repo)](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md), [headless (site)](https://geminicli.com/docs/cli/headless/), [CLI reference (repo)](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md), [MCP servers (repo)](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md), [authentication (site)](https://geminicli.com/docs/get-started/authentication/), [terms (site)](https://geminicli.com/docs/resources/tos-privacy/)
- Antigravity: [CLI migration](https://antigravity.google/docs/cli/gcli-migration) (redirected), [CLI announcement](https://antigravity.google/blog/introducing-google-antigravity-cli); [replacement news](https://ostechnix.com/google-is-replacing-gemini-cli-with-google-antigravity/) (secondary)
- OpenChatCut: [README](https://github.com/0xsline/OpenChatCut)
- Developer reports: [claude-code#32191](https://github.com/anthropics/claude-code/issues/32191), [claude-code#40927](https://github.com/anthropics/claude-code/issues/40927)

Not used: claudeissues.com mirrors (HTTP 503 when fetched); a Zylos Research article from 2026-07-13 (fetched, secondary analysis only).
