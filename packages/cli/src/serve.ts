// `dax serve`: run the engine server (dax-server from @dax/server) in the foreground. The CLI does not depend on the
// server package; it looks for the executable and starts it as a child process, so installing the server is optional.

import { spawn } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { constants as osConstants } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { CliError, type CliIo, EXIT } from "./io.js";

/** How to start the server: a JavaScript file run with Node, or a native executable run directly. */
export interface ServerCommand {
  command: string;
  args: string[];
}

/** First executable file called `name` on PATH, or undefined. */
function findOnPath(name: string, env: NodeJS.ProcessEnv): string | undefined {
  const exts = process.platform === "win32" ? [".cmd", ".exe", ""] : [""];
  for (const dir of (env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, name + ext);
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Not here; keep looking.
      }
    }
  }
  return undefined;
}

/** The `dax-server` entry of an installed @dax/server package, found through Node's module resolution. */
function findInstalledServer(): string | undefined {
  try {
    const pkgPath = createRequire(import.meta.url).resolve("@dax/server/package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { bin?: Record<string, string> };
    const bin = pkg.bin?.["dax-server"];
    return bin ? resolve(dirname(pkgPath), bin) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Locate the engine server: `DAX_SERVER_BIN`, else an installed `@dax/server` package, else `dax-server` on PATH.
 * @throws CliError when none is found, with a message saying how to fix it.
 */
export function findServer(io: CliIo): ServerCommand {
  const explicit = io.env.DAX_SERVER_BIN;
  const path = explicit
    ? resolve(io.cwd, explicit)
    : (findInstalledServer() ?? findOnPath("dax-server", io.env));
  if (!path || !existsSync(path)) {
    throw new CliError(
      explicit
        ? `DAX_SERVER_BIN points to ${path}, which does not exist.`
        : "dax-server was not found. Install @dax/server (pnpm add -g @dax/server), put dax-server on PATH, or set DAX_SERVER_BIN to its path.",
      EXIT.failure,
    );
  }
  // A .js entry runs under the same Node that runs the CLI; anything else is a launcher script or binary.
  return /\.(c|m)?js$/.test(path)
    ? { command: process.execPath, args: [path] }
    : { command: path, args: [] };
}

/**
 * Start the server with `serverArgs` and wait for it to exit; resolves with its exit code.
 *
 * The child's stdout and stderr are ours, so its one-line startup JSON reaches the caller. Its stdin is a pipe we
 * never write to: dax-server exits when that pipe closes, so a killed CLI cannot leave an orphan server behind.
 * SIGINT, SIGTERM and SIGHUP are forwarded to the child.
 */
export async function runServe(io: CliIo, serverArgs: string[]): Promise<number> {
  const server = findServer(io);
  const child = spawn(server.command, [...server.args, ...serverArgs], {
    stdio: ["pipe", "inherit", "inherit"],
    env: io.env,
  });
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
  const handlers = signals.map((sig) => {
    const handler = () => {
      child.kill(sig);
    };
    process.on(sig, handler);
    return [sig, handler] as const;
  });
  try {
    return await new Promise<number>((resolveExit, rejectExit) => {
      child.on("error", (err) =>
        rejectExit(new CliError(`Could not start ${server.command}: ${err.message}`, EXIT.failure)),
      );
      child.on("exit", (code, signal) =>
        resolveExit(code ?? (signal ? 128 + (osConstants.signals[signal] ?? 0) : 1)),
      );
    });
  } finally {
    for (const [sig, handler] of handlers) process.off(sig, handler);
  }
}
