// Playwright configuration for the editor's end-to-end tests: starts the mock server and the Vite dev harness,
// then drives them with the preinstalled Chromium (set PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers).

import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const chromium = "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "src/editor/dev/e2e",
  outputDir: "src/editor/dev/.artifacts/results",
  timeout: 60_000,
  workers: 1, // tests share one mock server and reset it between runs
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5180",
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      ...(existsSync(chromium) ? { executablePath: chromium } : {}),
      args: ["--autoplay-policy=no-user-gesture-required"],
    },
  },
  webServer: [
    {
      command: "node src/editor/dev/mock-server.ts --port 4390",
      url: "http://127.0.0.1:4390/api/health",
      timeout: 120_000,
      reuseExistingServer: true,
    },
    {
      command: "pnpm exec vite --config vite.editor.config.ts",
      url: "http://127.0.0.1:5180",
      timeout: 60_000,
      reuseExistingServer: true,
    },
  ],
});
