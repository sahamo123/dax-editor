#!/usr/bin/env node
// The `dax-mcp` executable. Thin: all logic is in main.ts so `dax mcp` can share it.

import { runMcpMain } from "./main.js";

runMcpMain(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`dax-mcp: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
