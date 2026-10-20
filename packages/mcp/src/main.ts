// The process-level entry shared by the `dax-mcp` bin and `dax mcp`: parse flags, open the project, start a transport,
// stay up until a signal or end of input, then shut down cleanly. stdout belongs to the protocol (stdio) or to one startup line (HTTP).

import { chmod, rm, writeFile } from "node:fs/promises";
import { emptyProject, Session } from "@dax/core";
import { MCP_USAGE, type McpCliArgs, McpUsageError, parseMcpArgs } from "./args.js";
import { startHttpServer } from "./http.js";
import type { McpServerOptions } from "./server.js";
import { serveStdio } from "./stdio.js";

/** A started server that can be stopped. */
export interface RunningMcp {
  /** Stop serving and remove the token file, if any. Safe to call twice. */
  close(): Promise<void>;
  /** Resolves when the server has stopped: after {@link RunningMcp.close}, or when stdin ends in stdio mode. */
  closed: Promise<void>;
  /** The line to print on stdout for HTTP mode (no secret unless `--print-token`); undefined for stdio. */
  startupLine?: string;
}

/** Translate parsed flags into server options, opening (or creating) the project file. */
async function buildOptions(args: McpCliArgs): Promise<McpServerOptions> {
  const session = args.project
    ? await Session.open(args.project)
    : new Session(emptyProject("Untitled"));
  return {
    session,
    allowedRoots: args.allowedRoots,
    readOnly: args.readOnly,
    allowIrreversible: !args.noExport,
    previewFrames: !args.noPreview,
  };
}

/**
 * Start the server described by `argv` and return a handle; does not touch signals or exit the process.
 * @throws Error for bad flags, an unreadable project file, or a port that cannot be bound.
 */
export async function startMcpFromArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<RunningMcp> {
  const args = parseMcpArgs(argv, env);
  const options = await buildOptions(args);

  if (!args.http) {
    const stdio = await serveStdio(options);
    let done: () => void = () => undefined;
    const closed = new Promise<void>((resolveClosed) => {
      done = resolveClosed;
    });
    // A client that disappears closes our stdin; without this the process would linger as an orphan.
    process.stdin.once("end", done);
    process.stdin.once("close", done);
    return {
      closed,
      async close() {
        await stdio.close();
        done();
      },
    };
  }

  const http = await startHttpServer({
    ...options,
    port: args.port,
    host: args.host,
    allowedOrigins: args.allowedOrigins,
    stateless: args.stateless,
    ...(args.token ? { token: args.token } : {}),
  });
  if (args.tokenFile) {
    // Owner-only: other local users must not be able to read the token. chmod covers a file that already existed.
    await writeFile(args.tokenFile, `${http.token}\n`, { mode: 0o600 });
    await chmod(args.tokenFile, 0o600);
  }
  const startup: Record<string, unknown> = { url: http.url, port: http.port, host: http.host };
  if (args.tokenFile) startup.tokenFile = args.tokenFile;
  if (args.printToken) startup.token = http.token;

  let closing: Promise<void> | undefined;
  let done: () => void = () => undefined;
  const closed = new Promise<void>((resolveClosed) => {
    done = resolveClosed;
  });
  return {
    closed,
    startupLine: JSON.stringify(startup),
    close() {
      closing ??= (async () => {
        await http.close();
        if (args.tokenFile) await rm(args.tokenFile, { force: true });
        done();
      })();
      return closing;
    },
  };
}

/**
 * Run the MCP server as a process: handles `--help`, installs SIGINT/SIGTERM/SIGHUP handlers, prints the HTTP startup line,
 * and resolves with an exit code (0 normal, 2 for bad flags, 1 for a failure to start) once the server has stopped.
 * Messages go to stderr.
 */
export async function runMcpMain(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  let running: RunningMcp;
  try {
    if (argv.includes("--help") || argv.includes("-h")) {
      process.stdout.write(MCP_USAGE);
      return 0;
    }
    running = await startMcpFromArgs(argv, env);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`dax-mcp: ${message}\n`);
    return err instanceof McpUsageError ? 2 : 1;
  }
  if (running.startupLine) process.stdout.write(`${running.startupLine}\n`);

  const stop = (why: string) => {
    process.stderr.write(`dax-mcp: shutting down (${why})\n`);
    // If graceful shutdown hangs on a stuck render, still go away.
    setTimeout(() => process.exit(1), 10_000).unref();
    void running.close();
  };
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
  const handlers = signals.map((sig) => {
    const handler = () => stop(sig);
    process.on(sig, handler);
    return [sig, handler] as const;
  });
  await running.closed;
  for (const [sig, handler] of handlers) process.off(sig, handler);
  return 0;
}
