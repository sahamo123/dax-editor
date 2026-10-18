// Command-line parsing for dax-server. Pure: turns argv and environment into ServerOptions, or throws a message fit to print.

import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { normalizeOrigin } from "./security.js";
import type { ServerOptions } from "./server.js";

/** Text printed for `--help`. */
export const USAGE = `dax-server: the dax-editor engine server (HTTP + WebSocket on 127.0.0.1)

Usage: node dist/cli.js [options]

  --port <n>              TCP port; 0 (default) picks a free one
  --data-dir <dir>        Folder for projects, cache, settings, secrets (default ~/.dax-editor)
  --origin <origin>       Allow this browser origin (repeatable), e.g. http://localhost:5173
  --allow-root <dir>      Folder imports/exports may use (repeatable; default: home + data dir)
  --verbose               Log every request (never the query string) to stderr
  --no-exit-on-stdin-close  Keep running when stdin closes (default: exit, so a dead parent leaves no orphan)
  -h, --help              Show this help

Environment: DAX_SERVER_TOKEN sets the auth token instead of generating one (min 16 chars).
On startup one JSON line {"url","token","port","version"} is printed to stdout.
`;

/** The result of parsing the command line. */
export interface ParsedArgs {
  /** Options to pass to `startServer`. */
  options: ServerOptions;
  /** Whether the process should exit when stdin closes. */
  exitOnStdinClose: boolean;
  /** True when `--help` was given; print {@link USAGE} and exit. */
  help: boolean;
}

/**
 * Parse `dax-server` arguments. Relative directories are resolved against the current directory.
 * @throws Error with a user-facing message for unknown flags, bad ports or malformed origins.
 */
export function parseServerArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): ParsedArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      port: { type: "string" },
      "data-dir": { type: "string" },
      origin: { type: "string", multiple: true },
      "allow-root": { type: "string", multiple: true },
      verbose: { type: "boolean" },
      "no-exit-on-stdin-close": { type: "boolean" },
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

  const options: ServerOptions = {
    dataDir: resolve(values["data-dir"] ?? join(homedir(), ".dax-editor")),
    port,
    origins: (values.origin ?? []).map(normalizeOrigin),
    verbose: values.verbose ?? false,
  };
  if (values["allow-root"]?.length)
    options.allowRoots = values["allow-root"].map((r) => resolve(r));
  if (env.DAX_SERVER_TOKEN) options.token = env.DAX_SERVER_TOKEN;

  return {
    options,
    exitOnStdinClose: !(values["no-exit-on-stdin-close"] ?? false),
    help: values.help ?? false,
  };
}
