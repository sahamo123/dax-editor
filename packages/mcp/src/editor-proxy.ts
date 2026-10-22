#!/usr/bin/env node
// Stable stdio entry for local clients: discovers the current authenticated engine without copying tokens into config.
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

const args = process.argv.slice(2);
const index = args.indexOf("--data-dir");
if (index < 0 || !args[index + 1])
  throw new Error("Pass --data-dir with the editor's private data folder.");
const file = join(resolve(args[index + 1] ?? ""), "live-mcp.json");
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const info: unknown = JSON.parse(await readFile(file, "utf8"));
const connection = record(info) ? info[args.includes("--plan") ? "plan" : "edit"] : undefined;
if (
  !record(connection) ||
  typeof connection.url !== "string" ||
  typeof connection.token !== "string"
)
  throw new Error("Start Dax Editor before connecting.");
const url = new URL(connection.url);
if (
  url.protocol !== "http:" ||
  !["127.0.0.1", "[::1]"].includes(url.hostname) ||
  url.pathname !== "/mcp" ||
  url.search ||
  url.hash ||
  url.username ||
  url.password
)
  throw new Error("Invalid local MCP discovery endpoint.");
const token = connection.token;
let sessionId: string | undefined;
let protocol: string | undefined;
let chain = Promise.resolve();
const output = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`);
const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  chain = chain.then(async () => {
    let request: unknown;
    try {
      request = JSON.parse(line);
      if (!record(request)) throw new Error("Invalid request");
      const response = await fetch(url, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(600_000),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
          ...(protocol ? { "MCP-Protocol-Version": protocol } : {}),
        },
        body: line,
      });
      sessionId = response.headers.get("mcp-session-id") ?? sessionId;
      if (!response.ok)
        throw new Error(
          `Editor connection failed (HTTP ${response.status}). Restart the client connection.`,
        );
      const text = await response.text();
      if (text.length > 8 * 1024 * 1024)
        throw new Error("Editor response exceeded the local proxy limit.");
      const messages = response.headers.get("content-type")?.includes("text/event-stream")
        ? text.split(/\r?\n\r?\n/).flatMap((event) => {
            const data = event
              .split(/\r?\n/)
              .filter((value) => value.startsWith("data:"))
              .map((value) => value.slice(5).trimStart())
              .join("\n");
            return data ? [data] : [];
          })
        : text
          ? [text]
          : [];
      for (const message of messages) {
        const value: unknown = JSON.parse(message);
        if (
          record(value) &&
          record(value.result) &&
          typeof value.result.protocolVersion === "string"
        )
          protocol = value.result.protocolVersion;
        output(value);
      }
    } catch (error) {
      if (record(request) && "id" in request)
        output({
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : "Editor connection failed",
          },
        });
      else
        process.stderr.write(
          "Dax Editor connection unavailable. Start the editor and reconnect.\n",
        );
    }
  });
});
lines.on("close", () => {
  void chain.then(async () => {
    if (sessionId)
      await fetch(url, {
        method: "DELETE",
        redirect: "error",
        signal: AbortSignal.timeout(3000),
        headers: {
          Authorization: `Bearer ${token}`,
          "Mcp-Session-Id": sessionId,
          ...(protocol ? { "MCP-Protocol-Version": protocol } : {}),
        },
      }).catch(() => undefined);
  });
});
