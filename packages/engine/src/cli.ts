#!/usr/bin/env node
// The `dax-engine` executable: same command line and startup line as dax-server, with the AI agent wired in.

import { parseServerArgs, type RunningServer, USAGE } from "@dax/server";
import { launch } from "./launch.js";

async function main(): Promise<void> {
  const parsed = parseServerArgs(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(USAGE.replace("dax-server", "dax-engine"));
    return;
  }
  // Install signal handlers before starting so an early SIGTERM from the desktop shell is handled cleanly.
  let starting: Promise<RunningServer> | undefined;
  let stopping = false;
  const stop = (why: string) => {
    if (stopping) return;
    stopping = true;
    process.stderr.write(`dax-engine: shutting down (${why})\n`);
    setTimeout(() => process.exit(1), 10_000).unref();
    (starting ?? Promise.resolve(undefined))
      .then((s) => s?.close())
      .then(
        () => process.exit(0),
        () => process.exit(1),
      );
  };
  for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"] as const) process.on(sig, () => stop(sig));
  if (parsed.exitOnStdinClose) {
    process.stdin.on("end", () => stop("stdin closed"));
    process.stdin.on("close", () => stop("stdin closed"));
    process.stdin.on("error", () => stop("stdin error"));
    process.stdin.resume();
  }
  starting = launch(parsed.options);
  const server = await starting;
  if (stopping) return;
  process.stdout.write(`${JSON.stringify(server.info)}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`dax-engine: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
