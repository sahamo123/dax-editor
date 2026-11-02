import { copyFileSync, existsSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { expect, test } from "./fixtures";

// This benchmark is opt-in; it records timings rather than enforcing an unverified release target.
test.skip(!process.env.DAX_PERFORMANCE_BASELINE, "Opt in to the isolated performance baseline");

test("sample isolated browser acknowledgement and seeded 720p cached seeks", async ({
  page,
  startEngine,
  openApp,
  sampleVideo,
}) => {
  const engine = await startEngine();
  await openApp(engine);
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("banner").getByRole("button", { name: "Import" }).click();
  await (await picker).setFiles(sampleVideo);
  await expect(
    page.locator(".toasts").getByText("Imported interview.mp4.", { exact: true }),
  ).toBeVisible();
  await engine.api.settled(90_000);
  const assetId = Object.keys((await engine.api.project()).assets)[0];
  expect(assetId).toBeTruthy();
  const dataDir = realpathSync(engine.dataDir);
  const tempRoot = realpathSync(tmpdir());
  if (
    !dataDir.startsWith(`${tempRoot}${sep}`) ||
    !dataDir.split(sep).at(-1)?.startsWith("dax-engine-e2e-")
  )
    throw new Error("Unexpected engine test directory");
  const cacheDir = join(dataDir, "cache");
  const proxies = readdirSync(cacheDir)
    .map((entry) => join(cacheDir, entry, "proxy.mp4"))
    .filter(existsSync);
  const candidate = proxies[0];
  if (proxies.length !== 1 || !candidate) throw new Error("Expected one isolated proxy");
  const proxyPath = realpathSync(candidate);
  if (!proxyPath.startsWith(`${dataDir}${sep}`))
    throw new Error("Proxy escaped isolated engine directory");
  // The production pipeline only creates 480p proxies. Seed its isolated test cache with the generated
  // 720p H.264 source to measure player seeks without claiming the application generates 720p proxies.
  copyFileSync(sampleVideo, proxyPath);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.clearBrowserCache");
  await page.reload();
  await expect(page.getByRole("banner")).toBeVisible();
  const meta = await page.evaluate(
    async ({ base, token, id }) => {
      const response = await fetch(
        `${base}/api/media/${id}/proxy.mp4?token=${encodeURIComponent(token)}`,
      );
      if (!response.ok) throw new Error(`proxy HTTP ${response.status}`);
      const blob = await response.blob();
      const el = document.createElement("video");
      el.src = URL.createObjectURL(blob);
      await new Promise<void>((resolve, reject) => {
        el.onloadedmetadata = () => resolve();
        el.onerror = () => reject(new Error("proxy cannot decode"));
      });
      const result = { width: el.videoWidth, height: el.videoHeight, bytes: blob.size };
      URL.revokeObjectURL(el.src);
      return result;
    },
    { base: engine.url, token: engine.token, id: assetId },
  );
  expect(meta.height).toBe(720);
  await page.getByTestId("video-a").evaluate((video: HTMLVideoElement) => {
    const url = new URL(video.src);
    url.searchParams.set("benchmark_cache_buster", String(Date.now()));
    video.src = url.toString();
    video.load();
  });
  await expect
    .poll(() => page.getByTestId("video-a").evaluate((v: HTMLVideoElement) => v.videoHeight))
    .toBe(720);
  const ack: { startMs: number; endMs: number; durationMs: number }[] = [];
  for (let i = 0; i < 15; i++) {
    const split = await engine.api.command("split", { at: 2 });
    expect(split.ok).toBe(true);
    const undo = page.getByRole("banner").getByRole("button", { name: "Undo" });
    await expect(undo).toBeEnabled();
    const startMs = performance.now();
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/command") &&
          r.request().method() === "POST" &&
          r.request().postDataJSON()?.name === "undo",
      ),
      undo.click(),
    ]);
    expect((await response.json()).ok).toBe(true);
    const endMs = performance.now();
    ack.push({ startMs, endMs, durationMs: endMs - startMs });
  }
  const ruler = page.getByTestId("ruler-hit");
  const box = await ruler.boundingBox();
  if (!box) throw new Error("Timeline ruler is not visible");
  const scrub: { startMs: number; endMs: number; durationMs: number }[] = [];
  for (let i = 0; i < 15; i++) {
    await page.evaluate(() => {
      const ruler = document.querySelector('[data-testid="ruler-hit"]');
      const video = document.querySelector('[data-testid="video-a"]');
      if (!ruler || !video) throw new Error("Timeline or video element is missing");
      (
        window as Window & {
          __sample?: Promise<{ startMs: number; endMs: number; durationMs: number }>;
        }
      ).__sample = new Promise((resolve, reject) => {
        let start = 0;
        const timer = setTimeout(() => reject(new Error("seeked timeout")), 5000);
        ruler.addEventListener(
          "pointerdown",
          () => {
            start = performance.now();
          },
          { once: true, capture: true },
        );
        video.addEventListener(
          "seeked",
          () => {
            if (start) {
              clearTimeout(timer);
              const end = performance.now();
              resolve({ startMs: start, endMs: end, durationMs: end - start });
            }
          },
          { once: true },
        );
      });
    });
    await page.mouse.click(box.x + 64 + (i % 2 ? 240 : 80), box.y + 10);
    const sample = await page.evaluate(
      () =>
        (
          window as Window & {
            __sample?: Promise<{ startMs: number; endMs: number; durationMs: number }>;
          }
        ).__sample,
    );
    if (!sample) throw new Error("Missing scrub sample");
    scrub.push(sample);
  }
  const percentile = (items: typeof ack) => {
    const sorted = items
      .slice(3)
      .map((x) => x.durationMs)
      .sort((a, b) => a - b);
    return sorted[Math.ceil(sorted.length * 0.95) - 1];
  };
  if (!process.env.DAX_PERF_RESULT)
    throw new Error("Set DAX_PERF_RESULT to a new private result path");
  writeFileSync(
    process.env.DAX_PERF_RESULT,
    JSON.stringify(
      {
        method: "isolated browser/engine; 3 warmups and 12 measured; nearest-rank p95",
        proxy: meta,
        cacheSeededFrom720pSource: true,
        ack,
        scrub,
        ackP95Ms: percentile(ack),
        scrubP95Ms: percentile(scrub),
        scrubBoundary: "ruler pointerdown to media seeked; not painted frame",
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
});
