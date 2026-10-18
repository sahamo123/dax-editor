// The CLI's version string, read once from package.json (which sits one folder above both src/ and dist/).

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

/** Version of `@dax/cli`, printed by `dax --version`. */
export const CLI_VERSION: string = readVersion();
