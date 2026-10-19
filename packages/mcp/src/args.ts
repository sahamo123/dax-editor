// Command-line parsing for dax-mcp (and `dax mcp`). Pure: turns argv and environment into options, or throws a message fit to print.

import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { MIN_TOKEN_LENGTH, normalizeOrigin } from "./security.js";

/** Text printed for `--help`. */
export const MCP_USAGE = `dax-mcp: the dax-editor MCP server (every editing command as a tool)

Usage: dax-mcp [options]          (also: dax mcp [options])

Transport (default is stdio, for clients that launch the server themselves):
  --http                  Serve Streamable HTTP on loopback instead (needs a token, see below)
  --port <n>              HTTP port; 0 (default) picks a free one
  --host <addr>           127.0.0.1 (default) or ::1. Other addresses are refused.
  --token-file <file>     Write the bearer token to this file (mode 0600); removed on exit
  --print-token           Include the token in the startup line on stdout (it is a secret)
  --allow-origin <o>      Accept this browser origin as well as loopback (repeatable)
  --stateless             No MCP sessions: a fresh server per request

Project and safety:
  --project <file>        Project file (.dax.json) to open or create; omit for an unsaved scratch project
  --allow-root <dir>      Folder that imports, exports and previews may use (repeatable;
                          default: your home folder and the project's folder)
  --read-only             Offer only the inspect-only commands
  --no-export             Hide commands that write files and cannot be undone (export_video)
  --no-preview            Do not offer the preview_frame image tool
  -h, --help              Show this help

Environment: DAX_MCP_TOKEN sets the HTTP bearer token instead of generating one (min ${MIN_TOKEN_LENGTH} chars).
With --http one JSON line {"url","port","host","tokenFile"} is printed to stdout when ready; logs go to stderr.
`;

/** The result of parsing the command line. */
export interface McpCliArgs {
  /** True when `--help` was given; print {@link MCP_USAGE} and exit. */
  help: boolean;
  /** Serve Streamable HTTP rather than stdio. */
  http: boolean;
  /** Absolute project file, if given. */
  project?: string;
  /** Allowed folders (absolute). */
  allowedRoots: string[];
  /** HTTP port (0 = any free port). */
  port: number;
  /** Loopback address to bind. */
  host: "127.0.0.1" | "::1";
  /** Token from `DAX_MCP_TOKEN`, if set. */
  token?: string;
  /** Where to write the token, if requested. */
  tokenFile?: string;
  /** Whether to print the token on stdout. */
  printToken: boolean;
  /** Extra allowed origins (normalised). */
  allowedOrigins: string[];
  /** HTTP without sessions. */
  stateless: boolean;
  /** Only inspect-only commands. */
  readOnly: boolean;
  /** Hide irreversible commands. */
  noExport: boolean;
  /** Hide the preview tool. */
  noPreview: boolean;
}

/** Thrown for bad command-line input, as opposed to a failure while starting; the message is fit to print. */
export class McpUsageError extends Error {}

/**
 * Parse `dax-mcp` arguments. Relative paths are resolved against the current directory.
 * @throws McpUsageError for unknown flags, bad ports, bad origins or an HTTP server nobody could authenticate to.
 */
export function parseMcpArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): McpCliArgs {
  try {
    return parseUnchecked(argv, env);
  } catch (err) {
    throw err instanceof McpUsageError
      ? err
      : new McpUsageError(err instanceof Error ? err.message : String(err));
  }
}

/** The parsing itself; any Error it throws is turned into a {@link McpUsageError} by {@link parseMcpArgs}. */
function parseUnchecked(argv: string[], env: NodeJS.ProcessEnv): McpCliArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      http: { type: "boolean" },
      port: { type: "string" },
      host: { type: "string" },
      "token-file": { type: "string" },
      "print-token": { type: "boolean" },
      "allow-origin": { type: "string", multiple: true },
      stateless: { type: "boolean" },
      project: { type: "string" },
      "allow-root": { type: "string", multiple: true },
      "read-only": { type: "boolean" },
      "no-export": { type: "boolean" },
      "no-preview": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
    allowPositionals: false,
  });

  let port = 0;
  if (values.port !== undefined) {
    port = Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new Error(`--port must be an integer from 0 to 65535, got "${values.port}"`);
    }
  }
  const host = values.host ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "::1") {
    throw new Error(`--host must be 127.0.0.1 or ::1 (loopback only), got "${host}"`);
  }

  const project = values.project ? resolve(values.project) : undefined;
  const roots = (values["allow-root"] ?? []).map((r) => resolve(r));
  const allowedRoots = roots.length ? roots : [homedir(), ...(project ? [dirname(project)] : [])];

  const token = env.DAX_MCP_TOKEN || undefined;
  if (token && token.length < MIN_TOKEN_LENGTH) {
    throw new Error(`DAX_MCP_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters`);
  }
  const http = values.http ?? false;
  // A random token nobody can read would make the server unusable, so insist on a way to deliver it.
  if (http && !token && !values["token-file"] && !values["print-token"]) {
    throw new Error(
      "--http needs a way to hand the token to clients: set DAX_MCP_TOKEN, or pass --token-file <file> or --print-token",
    );
  }

  const args: McpCliArgs = {
    help: values.help ?? false,
    http,
    allowedRoots,
    port,
    host,
    printToken: values["print-token"] ?? false,
    allowedOrigins: (values["allow-origin"] ?? []).map(normalizeOrigin),
    stateless: values.stateless ?? false,
    readOnly: values["read-only"] ?? false,
    noExport: values["no-export"] ?? false,
    noPreview: values["no-preview"] ?? false,
  };
  if (project) args.project = project;
  if (token) args.token = token;
  if (values["token-file"]) args.tokenFile = resolve(values["token-file"]);
  return args;
}
