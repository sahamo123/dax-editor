// Shared Playwright setup: a fresh engine per test, a generated fixture video per worker, and helpers to open the
// app against that engine and to save screenshots (which the developer then looks at). Two kinds of engine:
// `startServer` is the real @dax/server in-process with a scripted assistant and fake local model (fast, controllable),
// `startEngine` is the real `dax-engine` process with its default behaviour (nothing faked).

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test as base, expect, type Page } from "@playwright/test";
import { type FakeModel, startFakeModel } from "./fake-model.mjs";
import { makeFixtureVideo } from "./fixture-video.mjs";
import { type MockServer, type MockServerOptions, startMockServer } from "./mock-server.mjs";
import { type RealEngine, startRealEngine } from "./real-engine.mjs";

export { expect };

/** Folder where `shot()` writes PNGs; override with `SHOTS_DIR`. */
const SHOTS_DIR = process.env.SHOTS_DIR ?? join(process.cwd(), "test-results", "shots");

/** The origin the Playwright preview server serves the app from; engines must allow it (`--origin`). */
const APP_ORIGIN = "http://127.0.0.1:4173";

/** Anything the app can connect to. */
interface Connectable {
  url: string;
  token: string;
}

interface TestFixtures {
  /** Start the in-process engine with fakes; it is closed automatically after the test. */
  startServer(options?: MockServerOptions): Promise<MockServer>;
  /** Start the real `dax-engine` process; it is stopped (and its temp data removed) after the test. */
  startEngine(): Promise<RealEngine>;
  /** Start a fake OpenAI-compatible model server (for the real engine's agent to talk to); closed after the test. */
  startModel(): Promise<FakeModel>;
  /** Open the app against `server` and wait for the first state. */
  openApp(server: Connectable): Promise<void>;
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
      const server = await startMockServer({
        allowedRoots: [dirname(sampleVideo)],
        ...options,
      });
      started.push(server);
      return server;
    });
    for (const s of started) await s.close();
  },

  startEngine: async ({ sampleVideo }, use) => {
    const started: RealEngine[] = [];
    await use(async () => {
      const engine = await startRealEngine({
        origin: APP_ORIGIN,
        allowRoots: [dirname(sampleVideo)],
      });
      started.push(engine);
      return engine;
    });
    for (const e of started) await e.close();
  },

  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructuring pattern here
  startModel: async ({}, use) => {
    const started: FakeModel[] = [];
    await use(async () => {
      const model = await startFakeModel();
      started.push(model);
      return model;
    });
    for (const m of started) await m.close();
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
