#!/usr/bin/env node
/**
 * Verifies every `MODEL_CATALOG` entry against Hugging Face (HEAD request, size, SHA-256, licence,
 * gating). Needs network. Exits non-zero if any entry fails.
 *
 *   pnpm --filter @dax/local-llm build && pnpm --filter @dax/local-llm catalog:verify
 */
import { MODEL_CATALOG } from "../catalog.js";
import { verifyCatalogEntry } from "../catalog-verify.js";

let failed = 0;
for (const entry of MODEL_CATALOG) {
  const check = await verifyCatalogEntry(entry);
  const mb = check.contentLength ? `${(check.contentLength / 1e6).toFixed(0)} MB` : "?";
  console.log(
    `${check.ok ? "ok  " : "FAIL"} ${entry.id.padEnd(28)} HTTP ${check.status} ${mb.padStart(8)} licence=${check.remoteLicense}`,
  );
  for (const problem of check.problems) console.log(`       - ${problem}`);
  if (!check.ok) failed++;
}
if (failed > 0) {
  console.error(`${failed} catalog entr${failed === 1 ? "y" : "ies"} failed verification`);
  process.exit(1);
}
