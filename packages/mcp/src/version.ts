// The server's name and version, read once from package.json (which sits one folder above both src/ and dist/).

import { readFileSync } from "node:fs";

function readVersion(): string {
  try {
    const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    const v = (JSON.parse(raw) as { version?: unknown }).version;
    return typeof v === "string" ? v : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Name reported to MCP clients in the `initialize` result. */
export const SERVER_NAME = "dax-editor";

/** Version of `@dax/mcp`, reported to MCP clients. */
export const SERVER_VERSION: string = readVersion();
