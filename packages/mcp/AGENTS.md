# packages/mcp

The MCP server: every core command as a tool, so Claude Code, Codex CLI, Gemini CLI, Cursor, Claude Desktop and any other MCP client can edit a project. Root rules in `/AGENTS.md` apply; this file adds package specifics. Design and sources: `docs/research/mcp-server-design.md` (read it before changing security or SDK usage). Overview: `docs/architecture/cli-and-mcp.md`.

Run: `pnpm --filter @dax/mcp build && node packages/mcp/dist/cli.js --project my.dax.json` (stdio) or `... --http --token-file /path/to/token` (loopback HTTP).
Test: `pnpm --filter @dax/mcp test` (FFmpeg tests skip without FFmpeg; `cli.test.ts` runs the compiled bin and skips until `build`).

## Module map

| File | Responsibility |
|---|---|
| `server.ts` | `createMcpServer(options)`: registers one tool per `commandTools()` entry, plus `preview_frame` and two resources. Runs commands, serialises edits, maps results, progress and cancellation. |
| `http.ts` | `startHttpServer()`: loopback Streamable HTTP listener, session map, body limit, calls the gate before the MCP transport. |
| `security.ts` | The gate (Host -> Origin -> bearer token), token generation, constant-time compare. Pure. |
| `paths.ts` | Allowed-root check with symlink resolution, applied to `import_media` and `export_video` before they run. |
| `frame.ts` | `locateFrame` (timeline time to clip and source time, pure) and `extractFrame` (one JPEG via FFmpeg, array args). |
| `stdio.ts` | `serveStdio()`: connect to stdin/stdout. |
| `args.ts`, `main.ts`, `cli.ts` | Flag parsing, process lifecycle (signals, token file, startup line), the `dax-mcp` bin. `runMcpMain` is also what `dax mcp` calls. |
| `test/media.ts` | Test helpers: FFmpeg detection, temp dirs, lavfi clip. |

## How a tool call works

`createMcpServer` loops over `commandTools()` and registers each with its JSON Schema (`fromJsonSchema`). The SDK validates against that schema; core validates again with the zod schema inside `tryRunCommand`, and its message is what the model sees on failure (`isError: true`, never a protocol error). `readOnly` becomes `readOnlyHint` and `idempotentHint`; `irreversible` becomes `destructiveHint`. Annotations are hints only, so the server enforces safety itself (allowed roots, `allowIrreversible`, `readOnly`).

Results carry the summary and compact data as text (for clients that only show text) and the same facts as `structuredContent` (`{ summary, data }`).

## Invariants (break these and things go subtly wrong)

- **Do not add a second edit path.** Tools come from `commandTools()`. New behaviour is a new core command, not a hand-written tool here. The only non-registry tool is `preview_frame`, which never changes the project.
- **Every HTTP request passes the gate in this order: Host, Origin, token.** No route skips it. Loopback hosts and origins on the listening port are always allowed, so an empty `allowedOrigins` list can never turn the Origin check off (the v1 SDK pitfall). Bind loopback only; `host` other than `127.0.0.1`/`::1` throws. Never send CORS headers. Never accept the token in the query string. Never log or print the token except in an owner-only file or on explicit `--print-token`.
- **stdout belongs to the protocol (stdio) or to one startup line (HTTP).** Log to stderr.
- **Edits run one at a time per `Session`** (queue keyed by session in a `WeakMap`), because every command reads the project, awaits FFmpeg, then applies. Read-only and irreversible commands run outside the queue on an immutable snapshot.
- **Cancellation**: read-only and irreversible calls stop waiting when the client cancels. Editing commands always run to completion (they apply atomically and are undoable), but a call cancelled before it starts does not run. Core cannot interrupt an FFmpeg render, so a cancelled `export_video` finishes in the background and the server then deletes the file it created. If core gains an `AbortSignal` in `CommandContext`, wire it through `runCommandTool` and drop that workaround.
- **File paths** from a client go through `checkInsideRoots` (realpath on both sides) in addition to core's `allowedRoots`. Asset paths from a project file are untrusted and are re-checked before `preview_frame` runs FFmpeg.
- **Persist after editing.** `runCommandTool` calls `session.save()` after a successful editing command, because some commands (`save_checkpoint`) change only in-memory history.
- Tests never touch the network beyond `127.0.0.1` and never write to a shared temp folder: use `makeTempDir()`/`removeTempDir()` and remove only that exact folder.

## Not built yet

- **Draft-and-approve** ([ADR 0006](../../docs/adr/0006-draft-approve-for-external-agents.md) is still proposed). Tools edit the live session; edits are labelled `ai` in the history and can be undone. Irreversible commands are only gated by `allowIrreversible` and the client's own confirmation (the tool has `destructiveHint: true`).
- Pagination for long transcripts, `outputSchema`, resource subscriptions, `dax://frame/{time}` resource template, MCP prompts, OAuth.
- The 2026-07-28 protocol (no sessions, no `initialize`). `stateless: true` already runs without sessions; revisit when clients move.

## Client configuration

Stdio (Claude Desktop, Claude Code, Cursor, Codex): command `dax-mcp` (or `dax mcp`) with args `["--project", "/abs/path/talk.dax.json"]`. Use an absolute `command`; the working directory of a client-launched server is undefined.

HTTP: start `dax-mcp --http --token-file ~/.dax/mcp-token` (add `--port 53918` for a stable port), read the URL from the startup line, and point the client at it with `Authorization: Bearer <token>`. Per-client snippets (Claude Code `.mcp.json`, Codex `config.toml`, Gemini `httpUrl`, Cursor) are in the research report, section 2.2. Name the environment variable `DAX_MCP_TOKEN`, not anything credential-shaped, or Claude Code expands it to empty.

## Dependencies (pinned exactly, all permissive)

`@modelcontextprotocol/server` 2.3.1 and `@modelcontextprotocol/node` 2.1.1 (Apache-2.0; the v2 line, per the research). `@modelcontextprotocol/client` 2.3.1 is a dev dependency used only by tests. The v2 packages are labelled beta: bump deliberately and re-run the whole test suite, including `http.test.ts`.
