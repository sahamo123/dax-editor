---
type: Research
title: MCP server design for dax-editor
description: Recommends a loopback Streamable HTTP MCP server with a per-launch bearer token, Host and Origin checks, and a stdio shim for Claude Desktop, built on the v2 MCP TypeScript SDK and checked by runnable tests.
tags: [research, mcp, security, agents, tools]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T19:46:22Z
---

# Research: MCP server design for dax-editor

Written 2026-10-18. Test harness (not committed) lives in `/tmp/claude-0/-home-user-dax-editor/2f7e5b03-6060-578c-95f7-af9dd44657ba/scratchpad/mcp/` (`v1/`, `v2/`). The `/tmp/claude-0/mcp/` path requested in the brief was removed by the environment twice during the run, so the harness moved to the session scratchpad.

Source tags: **(fetched)** = page read in full or searched with WebFetch; **(search result)** = only a search snippet was seen; **(verified run)** = behaviour observed in our own test; **(unverified)** = not checked, stated as a belief or design choice.

## 1. Recommendation

1. **SDK line.** Build on `@modelcontextprotocol/server` 2.3.1 with `@modelcontextprotocol/node` 2.1.1 (v2). The name in the brief, `@modelcontextprotocol/sdk` 1.32.1, is the v1 line, which the SDK README says is kept for fixes only (fetched). Verified run: the v2 server accepts a v1 client on protocol 2025-11-25 and also runs stateless with no session id.
2. **Two entry points, one tool set.** Streamable HTTP on `127.0.0.1` for the in-app chat agent and CLI clients (Claude Code, Codex CLI, Gemini CLI, Cursor). A `dax mcp` stdio shim for Claude Desktop, whose config file documents only local stdio servers (fetched). The shim forwards to the running app over loopback.
3. **Auth.** A random 256-bit bearer token per launch, written to an owner-only file. Every request must present `Authorization: Bearer <token>`. The 2025-11-25 security guidance says servers that implement authorization MUST verify all inbound requests and MUST NOT use sessions for authentication (fetched). HTTP clients read the token from an environment variable.
4. **Browser defence.** Bind `127.0.0.1` only. Validate `Host` and `Origin` on every request, return 403 on mismatch, and send no CORS headers. Both SDK lines enforce this when configured (verified run).
5. **Tools.** Generate specs from `commandTools()` (33 commands in `packages/core/src/commands.ts`; 7 read-only; 1 irreversible, `export_video`). Typed, validated arguments only. No shell and no raw FFmpeg arguments (AGENTS.md).
6. **Results.** Return a short text summary, `structuredContent` for data, and `image` blocks for frames. Report failures with `isError: true`, which both SDKs deliver to the model (verified run).
7. **Drafts.** External edits go to a draft session (ADR 0006). The session id is a server-minted handle passed as a tool argument, not `Mcp-Session-Id`, because the 2026-07-28 spec removes that header (fetched).
8. **Irreversible actions.** Excluded from drafts. They need a separate, explicit confirmation, since the spec says a human should stay in the loop (fetched).
9. **Tests.** Unit-test handlers with the SDK in-memory transport (verified run). Run the Inspector CLI with its exit codes as a CI smoke gate (fetched; not run here).

## 2. Protocol version and transports

### 2.1 Spec versions and transports

- Current protocol version is **2026-07-28**. Clients and servers may support several versions at once (fetched: https://modelcontextprotocol.io/docs/2026-07-28/learn/versioning.md).
- 2026-07-28 key changes (fetched: https://modelcontextprotocol.io/specification/2026-07-28/changelog.md):
  - Protocol-level sessions and the `Mcp-Session-Id` header are removed from Streamable HTTP. List results no longer vary per connection.
  - The `initialize` handshake is removed. Each request carries version and capabilities in `_meta`.
  - `server/discover` is mandatory on servers.
  - SSE resumability (`Last-Event-ID`) is removed. A broken stream loses the in-flight request, and the client must re-issue it.
  - HTTP+SSE is reclassified as Deprecated. Migrate to Streamable HTTP.
  - Roots, Sampling and Logging are deprecated. Log to stderr on stdio.
- 2025-11-25 (fetched: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports): Streamable HTTP uses sessions and `MCP-Session-Id`. Servers SHOULD bind to 127.0.0.1 and MUST validate `Origin`.
- Transports: **stdio** is newline-delimited JSON-RPC over a child process's stdin and stdout. **Streamable HTTP** is one endpoint, POST for each message, replies as JSON or a request-scoped SSE stream. **HTTP+SSE** is deprecated: "The SSE (Server-Sent Events) transport is deprecated. Use HTTP servers instead, where available" (fetched: https://code.claude.com/docs/en/mcp).
- Which spec each shipping client speaks is **(unverified)** per product. Verified only with the SDK clients: the v1 client negotiated `2025-11-25` against the v2 server and got a session (verified run).

### 2.2 Client config

Snippets come from each client's documentation (fetched), except where marked.

**Claude Code**: `.mcp.json`. Accepts `type: "http"`, and `"streamable-http"` as an alias. `${VAR}` expands inside `url` and `headers`.

```json
{
  "mcpServers": {
    "dax": {
      "type": "http",
      "url": "http://127.0.0.1:53918/mcp",
      "headers": { "Authorization": "Bearer ${DAX_MCP_TOKEN}" }
    }
  }
}
```

Stdio form: `"type": "stdio", "command": "dax", "args": ["mcp"]`.

**Codex CLI**: `~/.codex/config.toml` (fetched: https://learn.chatgpt.com/docs/extend/mcp?surface=cli). The token is read from the named variable at connect time. Stdio uses `command` and `args` under the same table.

```toml
[mcp_servers.dax]
url = "http://127.0.0.1:53918/mcp"
bearer_token_env_var = "DAX_MCP_TOKEN"
```

**Gemini CLI**: `settings.json` (exact path **(unverified)**). `httpUrl` is Streamable HTTP, `url` is SSE, and `command` is stdio (fetched: https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/tools/mcp-server.md). Environment expansion inside `headers` is **(unverified)**.

```json
{
  "mcpServers": {
    "dax": {
      "httpUrl": "http://127.0.0.1:53918/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

**Cursor**: `.cursor/mcp.json` or `~/.cursor/mcp.json`. Supports stdio, SSE and Streamable HTTP. Remote entries use `url` and `headers`, and `${env:VAR}` works inside them (fetched: https://cursor.com/docs/context/mcp).

```json
{
  "mcpServers": {
    "dax": {
      "url": "http://127.0.0.1:53918/mcp",
      "headers": { "Authorization": "Bearer ${env:DAX_MCP_TOKEN}" }
    }
  }
}
```

**Claude Desktop**: `claude_desktop_config.json` takes local stdio servers (fetched: https://modelcontextprotocol.io/docs/develop/connect-local-servers). Remote servers are added under Settings, Connectors, "Add custom connector", which takes a URL and then OAuth or an API-key form (fetched: https://modelcontextprotocol.io/docs/develop/connect-remote-servers). Whether a loopback URL works there is **(unverified)**. Use an absolute `command`, because the working directory is undefined for client-launched stdio servers (fetched: https://modelcontextprotocol.io/docs/2026-07-28/tools/debugging.md).

```json
{
  "mcpServers": {
    "dax": { "command": "/absolute/path/to/dax", "args": ["mcp"] }
  }
}
```

### 2.3 Token delivery

A per-launch token cannot sit in a static client config, because it changes every launch. Options:

- The stdio shim reads the port and token from an owner-only discovery file at spawn time. Claude Desktop uses this path.
- HTTP clients reference `DAX_MCP_TOKEN` from the environment. The app writes it once, or the user sets it from `dax mcp token`. Whether per-launch rotation is worth that friction is an open decision **(design)**.

## 3. TypeScript SDK

### 3.1 Versions (npm registry, run 2026-10-18)

- `@modelcontextprotocol/sdk` 1.32.1, published 2026-10-05. v1 line.
- `@modelcontextprotocol/server` 2.3.1 and `@modelcontextprotocol/client` 2.3.1, published 2026-10-05. v2 line. `@modelcontextprotocol/node` 2.1.1.
- The v2 docs site is labelled "v2 beta" **(search result)**. Pin exact versions.
- Schemas use Standard Schema. We use Zod 4 in v2 (`import { z } from 'zod/v4'`) and Zod 3 in v1.

### 3.2 Streamable HTTP server with auth and Host/Origin checks (v2, verified run)

Trimmed from the tested file. `buildServer()` is the function that registers the tools in 3.3. Each request is answered in this order: token, Host, Origin, then the transport.

```ts
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { NodeStreamableHTTPServerTransport, localhostHostValidation, originValidation } from '@modelcontextprotocol/node';

const PORT = 53918;                              // example; pick a free port
const TOKEN = randomBytes(32).toString('hex');   // per launch; never logged
const validHost = localhostHostValidation();     // localhost, 127.0.0.1, [::1]
const validOrigin = originValidation(['localhost', '127.0.0.1']);
const transports = new Map<string, NodeStreamableHTTPServerTransport>();

createServer(async (req, res) => {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401).end(); return; }
  if (!validHost(req, res)) return;              // 403 already sent
  if (!validOrigin(req, res)) return;            // 403 already sent
  const sid = req.headers['mcp-session-id'];
  let transport = typeof sid === 'string' ? transports.get(sid) : undefined;
  if (!transport) {
    const t: NodeStreamableHTTPServerTransport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),    // omit for stateless (see 3.4)
      onsessioninitialized: (id) => transports.set(id, t),
    });
    await buildServer().connect(t);
    transport = t;
  }
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
  await transport.handleRequest(req, res, body);
}).listen(PORT, '127.0.0.1');
```

Verified results: no token gives 401. Bad Origin gives 403 `Invalid Origin`. Bad Host gives 403 `Invalid Host`.

### 3.3 Tools, images, progress, cancellation (v2, verified run)

```ts
server.registerTool('get_frame', {
  description: 'Return a still frame at a time, in seconds.',
  inputSchema: z.object({ t: z.number().min(0).describe('Timeline time in seconds') }),
  annotations: { readOnlyHint: true },
}, async ({ t }) => ({ content: [
  { type: 'text', text: `Frame at ${t}s` },
  { type: 'image', data: PNG_BASE64, mimeType: 'image/png' },
] }));

server.registerTool('export_video', {
  description: 'Export the timeline to a file.',
  inputSchema: z.object({ path: z.string() }),
  annotations: { destructiveHint: true, readOnlyHint: false, openWorldHint: false },
}, async ({ path }, ctx) => {
  const token = ctx.mcpReq._meta?.progressToken;   // present only if the client asked
  for (let i = 1; i <= 3; i++) {
    if (ctx.mcpReq.signal.aborted) return { isError: true, content: [{ type: 'text', text: 'cancelled' }] };
    if (token !== undefined) await ctx.mcpReq.notify({ method: 'notifications/progress',
      params: { progressToken: token, progress: i, total: 3, message: `encoding ${i}/3` } });
    await new Promise((r) => setTimeout(r, 50));
  }
  return { content: [{ type: 'text', text: `Exported ${path}` }] };
});
```

- `get_project` returned `structuredContent` alongside a text copy, with an `outputSchema` declared (verified run). Include the text copy for clients that ignore structured content.
- Client (verified run): `client.callTool({ name, arguments }, { onprogress, signal })`. Aborting the signal made the server's `ctx.mcpReq.signal.aborted` true, and the client threw `SdkError`.
- Bad arguments return `isError: true` with "Input validation error", not a thrown error. Progress arrived in order (1/3, 2/3, 3/3). The image block came back intact.
- v1 equivalents (verified run): `registerTool(name, { inputSchema: { t: z.number() }, annotations }, async (args, extra) => ...)`, progress through `extra._meta?.progressToken` and `extra.sendNotification`, and cancellation through `extra.signal`.

### 3.4 Stateful versus stateless (v2, verified run)

- Stateful: `sessionIdGenerator: () => randomUUID()`. The v1 client connected and got a session, negotiating 2025-11-25.
- Stateless: `sessionIdGenerator: undefined`, with a new `McpServer` and transport per request. The v2 client got no session id and made two calls.
- Recommendation: keep stateful for clients that still send `initialize` and `Mcp-Session-Id`. Store draft state under a server-minted handle, so either mode works.

### 3.5 v1 (`@modelcontextprotocol/sdk` 1.32.1) options (verified run)

```ts
new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
  allowedHosts: [`127.0.0.1:${PORT}`, `localhost:${PORT}`],
  allowedOrigins: [`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`], // [] DISABLES the Origin check
  enableDnsRebindingProtection: true,
});
```

### 3.6 Client, stdio, in-memory (verified runs)

- v2 client: `new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization } } })` from `@modelcontextprotocol/client`.
- v2 stdio: `StdioClientTransport` from `@modelcontextprotocol/client/stdio`. A child server built on `StdioServerTransport` from `@modelcontextprotocol/server/stdio` returned `echo: hi`.
- In-memory, both lines: `InMemoryTransport.createLinkedPair()` (v1 from `@modelcontextprotocol/sdk/inMemory.js`, v2 from `@modelcontextprotocol/server`). Connect the server to one end and the client to the other. No network.

### 3.7 Tool annotation caveat

Annotations are hints. Clients MUST consider annotations untrusted unless they come from trusted servers, and servers MUST validate all tool inputs (fetched: https://modelcontextprotocol.io/specification/2025-11-25/server/tools). Our server enforces safety itself and does not rely on `readOnlyHint`.

## 4. Security

### 4.1 Spec requirements, quoted

- Transports, 2025-11-25 (fetched): "Servers MUST validate the Origin header on all incoming connections to prevent DNS rebinding attacks. If the Origin header is present and invalid, servers MUST respond with HTTP 403 Forbidden." Also: "When running locally, servers SHOULD bind only to localhost (127.0.0.1) rather than all network interfaces (0.0.0.0)", and "Servers SHOULD implement proper authentication for all connections."
- Security best practices, 2025-11-25 (fetched): "MCP servers that implement authorization MUST verify all inbound requests. MCP Servers MUST NOT use sessions for authentication."
- Local server security, 2026-07-28 (fetched): "Binding to 127.0.0.1 is not an authentication boundary: such components need real authentication and origin validation." Also: "The stdio transport is not a sandbox." Tool definitions can change after approval (a rug pull).
- Tools (fetched): "there SHOULD always be a human in the loop with the ability to deny tool invocations." Servers MUST "Validate all tool inputs" and "Sanitize tool outputs". Clients SHOULD "Show tool inputs to the user before calling the server".

### 4.2 Why a web page must not reach the server

A web page can send a request to `http://127.0.0.1:<port>` from the user's browser, and a DNS-rebinding page can make a remote name resolve to 127.0.0.1. Both bypass "it only listens locally". The defence is a token the page cannot read, plus Host and Origin checks that reject the page's origin. Two real cases:

- SDK (CVE-2025-66414, GHSA-w48q-cv73-mx4w): TypeScript SDK HTTP servers before 1.24.0 shipped without DNS-rebinding protection. stdio servers were not affected **(search result: sentinelone and gitlab advisory pages)**.
- MCP Inspector (CVE-2025-49596, CVSS 9.4 per one source, fixed in 0.14.1): a local debugging proxy could be driven from a web page, and it could launch commands over stdio. The fix added a random session token **(search result: thehackernews, wiz)**.

### 4.3 Our checklist

| Control | How | Verified |
|---|---|---|
| Loopback bind | `listen(PORT, '127.0.0.1')` | by construction |
| Bearer token | 256-bit per launch; 401 without it | run (401) |
| Host check | `localhostHostValidation()` / `allowedHosts` | run (403) |
| Origin check | `originValidation([...])` / non-empty `allowedOrigins` | run (403) |
| No CORS | send no `Access-Control-*` headers | design |
| Argument validation | Zod schema from `commands.ts` | run (isError) |
| No shell or raw FFmpeg args | only typed commands are registered | design (AGENTS.md) |
| Path allow-list | `import_media` and `export_video` take paths only under a configured root | design (unverified) |
| Prompt injection | transcripts and file names are data; tool results never carry instructions to the agent | design |
| Confirmation | irreversible tools blocked in drafts; approval UI for export | design |

The local-server page warns that "Prompt injection in untrusted content can steer an honest server into the same overreach, using whatever access it was given" (fetched). File names and transcript text therefore need careful handling, and the server's own access must stay narrow.

## 5. Tool design

- **Count and names.** The registry has 33 commands and 7 read-only ones. Expose the same set through `commandTools()` so there is one source of truth. Names SHOULD be 1 to 128 characters from `[A-Za-z0-9_.-]`, unique, case-sensitive (fetched, tools page).
- **Ordering.** Return tools in deterministic order. The 2026-07-28 spec says this improves client caching and LLM prompt-cache hits (fetched, changelog minor change 3). Its list results also carry `ttlMs` and `cacheScope` (fetched, changelog minor change 5).
- **Compact results.** The registry already returns a one-line `summary` plus `data`. Keep payloads small, put bulk data behind a second call, and use `outputSchema` plus `structuredContent` for machine-readable data.
- **Pagination.** Long transcripts and asset lists should use an opaque `cursor` and `nextCursor`, as the tools page's `tools/list` example shows (fetched). Offset and limit are an alternative **(design)**.
- **Errors.** Use `isError: true` with a message the model can act on, for example "No clip at that time. Call get_project to see clip times." The spec says clients SHOULD pass tool execution errors to the model for self-correction (fetched).
- **Idempotency and dry-run.** `plan_cuts` already previews without changing anything (fetched from `commands.ts`). Apply the same pattern to every destructive command **(design, no primary source)**.
- **Drafts.** Per ADR 0006: a draft session applies as one undo step, and irreversible commands stay outside it. Check this against the existing undo history before building.

## 6. Testing

- **In-memory client** (verified run, both lines). Unit-test handlers with no HTTP, using `InMemoryTransport.createLinkedPair()`.
- **HTTP and security** (verified run). The tested file covers 401, 403 Host, 403 Origin, tool listing with annotations, image, structured content, progress, cancellation, and bad arguments.
- **MCP Inspector CLI** (fetched: https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/cli.md). Run `npx @modelcontextprotocol/inspector --cli --transport http <url> --method tools/list --format json` as a CI gate. Exit `0` is success, `3` is auth required, `4` is unreachable and `5` is a tool error. How to pass the token is **(unverified)**; we did not run it.
- Tests must not hit the network (AGENTS.md). A loopback test binds `127.0.0.1` on a random port.

## 7. Pitfalls

1. **v1 `allowedOrigins: []` silently disables the Origin check.** Observed: with an empty array a request with `Origin: https://evil.example` got 400, not 403. The v1 `webStandardStreamableHttp.js` checks Origin only when the list has entries (verified run). Fix: always pass an explicit list, or use the v2 `originValidation` guard.
2. **Old SDK HTTP servers had no DNS-rebinding protection.** Affected TypeScript SDK releases before 1.24.0 (CVE-2025-66414) **(search result)**. Fix: upgrade past the patched version and check Host on every request. stdio is not affected.
3. **Local debug tools became attack paths.** The MCP Inspector CVE-2025-49596 let a web page drive a localhost proxy, fixed in 0.14.1 **(search result)**. Lesson: `dax mcp` debug endpoints need the same token as the main one, and no unauthenticated listener on any port.
4. **Claude Code expands credential-named variables to empty.** Names such as `ANTHROPIC_AUTH_TOKEN` expand to nothing inside `url` and `headers`, so the header becomes `Bearer ` and the server returns 401. Fix: use our own name, such as `DAX_MCP_TOKEN` (fetched: https://code.claude.com/docs/en/mcp).
5. **Gemini CLI `url` means SSE, not Streamable HTTP.** Copying a Cursor or Claude Desktop remote entry into Gemini CLI can fail silently **(search result, one tutorial)**. Fix: use `httpUrl` (fetched: Gemini doc). A GitHub issue reports a "missing header" failure with `httpUrl`, whose resolution was not found **(search result: github/github-mcp-server issue 1219)**.

Also: stdout must carry only protocol messages, so log to stderr in stdio mode (fetched: debugging page).

## Sources

Fetched (read in full, or searched with WebFetch, or read with curl):

- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices
- https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- https://modelcontextprotocol.io/specification/2026-07-28/changelog.md
- https://modelcontextprotocol.io/docs/2026-07-28/learn/versioning.md
- https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/local-server-security.md
- https://modelcontextprotocol.io/docs/2026-07-28/tools/debugging.md
- https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/cli.md
- https://modelcontextprotocol.io/docs/develop/connect-local-servers
- https://modelcontextprotocol.io/docs/develop/connect-remote-servers
- https://modelcontextprotocol.io/llms.txt
- https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md
- https://code.claude.com/docs/en/mcp (redirected from docs.claude.com)
- https://learn.chatgpt.com/docs/extend/mcp?surface=cli (Codex; redirected from developers.openai.com)
- https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/tools/mcp-server.md
- https://cursor.com/docs/context/mcp (redirected from docs.cursor.com)

Search results only:

- CVE-2025-66414 / GHSA-w48q-cv73-mx4w: https://www.sentinelone.com/vulnerability-database/cve/cve-2025-66414/ and https://advisories.gitlab.com/pkg/npm/@modelcontextprotocol/sdk/CVE-2025-66414/
- CVE-2025-49596: https://thehackernews.com/2025/07/critical-vulnerability-in-anthropics.html and https://www.wiz.io/vulnerability-database/cve/cve-2025-49596
- github/github-mcp-server issue 1219: https://github.com/github/github-mcp-server/issues/1219

Registry and local runs:

- `npm view @modelcontextprotocol/sdk|server|client|node version time` (run 2026-10-18)
- Local runs in `/tmp/claude-0/-home-user-dax-editor/2f7e5b03-6060-578c-95f7-af9dd44657ba/scratchpad/mcp/`: `v1/test.mjs`, `v1/compat.mjs`, `v1/inmem.mjs`, `v2/test.mjs`, `v2/stateless.mjs`, `v2/stdio-test.mjs`, `v2/inmem.mjs`
- Repo: `packages/core/src/commands.ts`, `docs/adr/0006-draft-approve-for-external-agents.md`, `AGENTS.md`
