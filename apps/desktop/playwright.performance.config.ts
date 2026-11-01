// Isolated opt-in performance runs use a fresh report folder and never attach to an existing preview server.
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

if (!base.webServer || Array.isArray(base.webServer))
  throw new Error("Expected one preview server");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export default defineConfig({
  ...base,
  testMatch: "performance-baseline.spec.ts",
  timeout: 180_000,
  outputDir: resolve(root, "artifacts", "performance-results", randomUUID()),
  webServer: { ...base.webServer, reuseExistingServer: false },
});
