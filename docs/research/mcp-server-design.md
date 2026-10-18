---
type: Research
title: MCP server design for dax-editor
description: "Recommends a local Streamable HTTP MCP server on 127.0.0.1 with a per-launch bearer token and a stdio shim, built on the MCP TypeScript SDK, with a draft-session tool surface; research in progress, sections marked (pending) are not yet verified."
tags: [research, mcp, security, agents, tools]
status: draft
generated:
  by: process:scribe
  at: 2026-10-18T19:39:31Z
---

# Research: MCP server design for dax-editor

Written 2026-10-18. Status: **draft**. Sections marked **(pending)** are not yet verified. Each source is marked **(fetched)** when its page was read in full or by grep, or **(search result)** when only a snippet was seen. Claims with no source are marked **(unverified)**.

## 1. Recommendation

1. **Spec target.** Serve the 2025-11-25 protocol first, because that is what most clients speak today (verification pending in section 2). Keep the 2026-07-28 changes in mind: sessions and the `initialize` handshake are removed, and the HTTP GET stream becomes `subscriptions/listen`.
2. **SDK.** The npm name `@modelcontextprotocol/sdk` (1.32.1) is the v1 line. The current line is **v2**: `@modelcontextprotocol/server` (2.3.1) and `@modelcontextprotocol/client`, which the SDK README says implement the 2026-07-28 spec. Decide between them in section 3 after the runnable test.
3. **Transport.** Expose one Streamable HTTP endpoint bound to `127.0.0.1` for the in-app and CLI agents. Offer a stdio entry point only as a thin shim that forwards to the running app, so clients that only support stdio still work.
4. **Auth.** Generate a random bearer token at each app launch, store it with owner-only permissions, and require `Authorization: Bearer <token>` on every request. Binding to localhost is not authentication (spec, section 4).
5. **Browser defence.** Validate `Host` (must be `127.0.0.1:<port>` or `localhost:<port>`) and reject any request that carries an `Origin` header the server does not expect. The spec says a server MUST return 403 for an invalid `Origin`.
6. **Tools.** Expose only the typed commands from `packages/core/src/commands.ts` (44 today), built from `commandTools()`. Never expose shell or raw FFmpeg arguments (AGENTS.md safety rules).
7. **Writes.** External agents edit an isolated draft session. Applying a draft is one undo step. Irreversible commands (export, delete) are excluded from drafts, as ADR 0006 proposes.
8. **Results.** Return a short text summary plus `structuredContent`. Use image content for frames and contact sheets. Tag every result with `isError` on failure.
9. **Untrusted data.** Treat transcripts, file names and tool descriptions as data (section 4 and pitfalls).

## 2. Protocol version and transports (pending)

### 2.1 Current spec versions

- Current protocol version is **2026-07-28** (fetched: https://modelcontextprotocol.io/docs/2026-07-28/learn/versioning.md).
- The previous revision, **2025-11-25**, is what the transports page in this session describes with sessions and `MCP-Session-Id` (fetched: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).
- The 2026-07-28 key changes that matter here (fetched: https://modelcontextprotocol.io/specification/2026-07-28/changelog.md):
  - Remove protocol-level sessions and the `Mcp-Session-Id` header from Streamable HTTP. List endpoints no longer vary per connection. Cross-call state uses server-minted handles passed as tool arguments.
  - Remove the `initialize` and `notifications/initialized` handshake. Each request carries protocol version and client capabilities in `_meta`.
  - Add `server/discover`, which servers MUST implement.
  - Remove SSE resumability (`Last-Event-ID`). A broken stream loses the in-flight request, and the client must re-issue it.
  - Reclassify the HTTP+SSE transport as **Deprecated**. Migrate to Streamable HTTP.
  - Deprecate Roots, Sampling and Logging.

### 2.2 Transports

- **stdio**: newline-delimited JSON-RPC over the standard streams of a client-launched subprocess.
- **Streamable HTTP**: each message is an HTTP POST to a single MCP endpoint. Replies come back as a JSON object or a request-scoped SSE stream. The 2025-11-25 spec says the server SHOULD bind to localhost (127.0.0.1) and MUST validate `Origin`.
- **HTTP+SSE** (2024-11-05): deprecated since 2025-03-26. Do not build on it.

### 2.3 Client support and config (pending)

Not yet verified. Required for each of Claude Code, Codex CLI, Gemini CLI, Cursor and Claude Desktop: which transports, the exact JSON or TOML for a local HTTP URL with a bearer header, and the exact JSON for stdio.

## 3. TypeScript SDK (pending)

### 3.1 Versions (verified with `npm view`)

- `@modelcontextprotocol/sdk`: latest **1.32.1** (2026-10-05). This is the v1 line. The README says v1 keeps receiving fixes for at least six months after the v2 release on 2026-07-27 (fetched: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/README.md).
- `@modelcontextprotocol/server`: latest **2.3.1** (2026-10-05). `@modelcontextprotocol/client`: latest **2.3.1**. These are the v2 line, which implements the 2026-07-28 spec.
- Tool and prompt schemas use Standard Schema. Zod v4 is the example used (`import * as z from 'zod/v4'`).
- Middleware packages exist for Node `http`: `@modelcontextprotocol/node`. Express, Fastify and Hono helpers add Host-header validation.

### 3.2 Runnable snippets (pending)

Not yet run. Planned: v1 and v2 each run a tiny Streamable HTTP server with a tool that returns text, an image and `structuredContent`, plus the SDK's client calling it. Results will be recorded here.

## 4. Security (partial)

- Spec, 2025-11-25 transports (fetched): "Servers MUST validate the `Origin` header on all incoming connections to prevent DNS rebinding attacks. If the `Origin` header is present and invalid, servers MUST respond with HTTP 403 Forbidden." Also: "When running locally, servers SHOULD bind only to localhost (127.0.0.1) rather than all network interfaces (0.0.0.0). Servers SHOULD implement proper authentication for all connections." And: "Without these protections, attackers could use DNS rebinding to interact with local MCP servers from remote websites."
- Spec, 2025-11-25 security best practices (fetched: https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices): "MCP servers that implement authorization MUST verify all inbound requests. MCP Servers MUST NOT use sessions for authentication. MCP servers MUST use secure, non-deterministic session IDs." Confirmed on the 2026-07-28 page as well (see `local-server-security`).
- Spec, 2026-07-28 local-server guidance (fetched: https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/local-server-security.md): "Binding to 127.0.0.1 is not an authentication boundary: such components need real authentication and origin validation." It also says: "The stdio transport is not a sandbox," and warns of tool poisoning and rug pulls (tool definitions can change after approval).
- The remaining items (CORS, per-launch token, argument validation, path allow-lists, injection through tool results, confirmation for irreversible actions) are pending.

## 5. Tool design (pending)

Pending: tool count and naming, descriptions, compact summaries, pagination of long transcripts, idempotency, dry-run, the draft-session pattern and its undo step.

## 6. Testing (pending)

Pending: MCP Inspector, the SDK in-memory client, unit-testing handlers.

## 7. Pitfalls (pending)

Pending: three to five real pitfalls with fixes, each with a source.

## Sources

- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports (fetched)
- https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices (fetched)
- https://modelcontextprotocol.io/specification/2026-07-28/changelog.md (fetched)
- https://modelcontextprotocol.io/docs/2026-07-28/learn/versioning.md (fetched)
- https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/local-server-security.md (fetched)
- https://github.com/modelcontextprotocol/typescript-sdk/blob/main/README.md (fetched)
- npm registry: `@modelcontextprotocol/sdk`, `@modelcontextprotocol/server`, `@modelcontextprotocol/client` (`npm view`, run 2026-10-18)
- Repo: `packages/core/src/commands.ts` (`COMMANDS`, `commandTools`), `docs/adr/0006-draft-approve-for-external-agents.md`, `AGENTS.md`
