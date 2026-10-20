#!/usr/bin/env node
// The `dax` executable. Thin: all logic is in main.ts so tests can run the whole command line in-process.

import { runCli } from "./main.js";

runCli(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`dax: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
