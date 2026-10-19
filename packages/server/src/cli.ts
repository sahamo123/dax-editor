#!/usr/bin/env node
// The `dax-server` executable. Prints one JSON ServerInfo line on stdout when ready; everything else goes to stderr.
// Exits cleanly on SIGTERM/SIGINT and when stdin closes, so a crashed parent (the desktop shell) never leaves an orphan.

import { parseServerArgs, USAGE } from "./args.js";
import { type RunningServer, startServer } from "./server.js";

async function main(): Promise<void> {
  const parsed = parseServerArgs(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(USAGE);
    return;
  }

  // Signal handlers are installed before the server starts, and before the startup line is printed:
  // a launcher may send SIGTERM the instant it reads the line, and the default action would kill us uncleanly.
  let starting: Promise<RunningServer> | undefined;
  let stopping = false;
  const stop = (why: string) => {
    if (stopping) return;
    stopping = true;
    process.stderr.write(`dax-server: shutting down (${why})\n`);
    // If graceful shutdown hangs (a stuck child process), still go away.
    setTimeout(() => process.exit(1), 10_000).unref();
    (starting ?? Promise.resolve(undefined))
      .then((server) => (server ? server.close() : undefined))
      .then(
        () => process.exit(0),
        () => process.exit(1),
      );
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGHUP", () => stop("SIGHUP"));
  if (parsed.exitOnStdinClose) {
    process.stdin.on("end", () => stop("stdin closed"));
    process.stdin.on("close", () => stop("stdin closed"));
    process.stdin.on("error", () => stop("stdin error"));
    process.stdin.resume(); // needed for 'end' to fire; incoming bytes are ignored
  }

  starting = startServer(parsed.options);
  const server = await starting;
  if (stopping) return; // asked to stop while starting; the stop() chain closes the server and exits
  // The launcher reads exactly this line; keep stdout free of anything else.
  process.stdout.write(`${JSON.stringify(server.info)}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`dax-server: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
