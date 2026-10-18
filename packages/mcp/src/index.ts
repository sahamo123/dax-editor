// Public surface of @dax/mcp: the server factory, both transports, and the process entry used by `dax mcp`.

export { MCP_USAGE, type McpCliArgs, McpUsageError, parseMcpArgs } from "./args.js";
export { FRAME_WIDTH_RANGE, type FrameLocation, locateFrame } from "./frame.js";
export {
  type HttpServerOptions,
  MCP_PATH,
  type RunningHttpServer,
  startHttpServer,
} from "./http.js";
export { type RunningMcp, runMcpMain, startMcpFromArgs } from "./main.js";
export { MIN_TOKEN_LENGTH } from "./security.js";
export {
  createMcpServer,
  type DaxMcpServer,
  type McpServerOptions,
  PREVIEW_FRAME_TOOL,
} from "./server.js";
export { type RunningStdioServer, serveStdio } from "./stdio.js";
export { SERVER_NAME, SERVER_VERSION } from "./version.js";
