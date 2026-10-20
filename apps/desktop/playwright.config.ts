// Playwright configuration for the end-to-end tests. They run the production build in the preinstalled
// Chromium against a mock engine server (e2e/mock-server.mjs) started per test.

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
    launchOptions: {
      // The sandbox ships Chromium at a fixed path; set PW_CHROMIUM to use another build.
      executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command:
      "pnpm exec vite build && pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
