// Shared Playwright setup: a fresh mock engine per test, a generated fixture video per worker, and helpers to
// open the app against that engine and to save screenshots (which the developer then looks at).

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as base, expect, type Page } from "@playwright/test";
import {
  type MockServer,
  type MockServerOptions,
  makeFixtureVideo,
  startMockServer,
} from "./mock-server.mjs";

export { expect };

/** Folder where `shot()` writes PNGs; override with `SHOTS_DIR`. */
const SHOTS_DIR = process.env.SHOTS_DIR ?? join(process.cwd(), "test-results", "shots");

interface TestFixtures {
  /** Start a mock engine; it is closed automatically after the test. */
  startServer(options?: MockServerOptions): Promise<MockServer>;
  /** Open the app against `server` and wait for the first state. */
  openApp(server: MockServer): Promise<void>;
  /** Save a full-page screenshot as `<name>.png` in the screenshots folder. */
  shot(name: string): Promise<void>;
}

interface WorkerFixtures {
  /** Absolute path of a 6 second test video (tone and silence alternating). */
  sampleVideo: string;
}

/** `test` with the fixtures above. */
export const test = base.extend<TestFixtures, WorkerFixtures>({
  sampleVideo: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructuring pattern here
    async ({}, use) => {
      const dir = mkdtempSync(join(tmpdir(), "dax-e2e-video-"));
      await use(await makeFixtureVideo(join(dir, "interview.mp4")));
      rmSync(dir, { recursive: true, force: true });
    },
    { scope: "worker" },
  ],

  startServer: async ({ sampleVideo }, use) => {
    const started: MockServer[] = [];
    await use(async (options) => {
      const server = await startMockServer({ allowedRoots: [join(sampleVideo, "..")], ...options });
      started.push(server);
      return server;
    });
    for (const s of started) await s.close();
  },

  openApp: async ({ page }, use) => {
    await use(async (server) => {
      const qs = new URLSearchParams({ server: server.url, token: server.token });
      await page.goto(`/?${qs.toString()}`);
      await expect(page.getByRole("banner")).toBeVisible();
    });
  },

  shot: async ({ page }, use) => {
    mkdirSync(SHOTS_DIR, { recursive: true });
    await use(async (name) => {
      // Let CSS transitions and image loads settle so screenshots are stable.
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(SHOTS_DIR, `${name}.png`) });
    });
  },
});

/** The chat's message box. */
export const chatInput = (page: Page) => page.getByLabel("Message to the assistant");
