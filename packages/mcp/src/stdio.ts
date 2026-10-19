// stdio transport: newline-delimited JSON-RPC on stdin/stdout. stdout must carry protocol messages only; log to stderr.

import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createMcpServer, type DaxMcpServer, type McpServerOptions } from "./server.js";

/** A server connected to the process's stdin and stdout. */
export interface RunningStdioServer extends DaxMcpServer {
  /** Disconnect and release the transport. */
  close(): Promise<void>;
}

/**
 * Create a server (see {@link createMcpServer}) and connect it to stdin and stdout, the transport that
 * Claude Desktop, Claude Code and most other local clients use for a server they launch themselves.
 * Nothing else may write to stdout afterwards.
 */
export async function serveStdio(options: McpServerOptions = {}): Promise<RunningStdioServer> {
  const built = createMcpServer(options);
  await built.server.connect(new StdioServerTransport());
  return { ...built, close: () => built.server.close() };
}
