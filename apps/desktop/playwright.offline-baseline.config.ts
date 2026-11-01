// The opt-in offline walkthrough uses a fresh report folder and an isolated preview server.
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
  testMatch: "offline-baseline.spec.ts",
  timeout: 180_000,
  outputDir: resolve(root, "artifacts", "offline-baseline-results", randomUUID()),
  webServer: { ...base.webServer, reuseExistingServer: false },
});
