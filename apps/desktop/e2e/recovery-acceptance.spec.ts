// Exercise recovery using generated media and persisted synthetic failure records.
import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { chatInput, expect, test } from "./fixtures";

test("active work can be cancelled from Work while the assistant is hidden", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer({ aiReady: true });
  await server.importPaths([sampleVideo]);
  await page.setViewportSize({ width: 1000, height: 700 });
  await openApp(server);
  await page.getByRole("button", { name: "Assistant view" }).click();
  await chatInput(page).fill("work slowly please");
  await chatInput(page).press("Enter");
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await chatInput(page).fill("work slowly later");
  await chatInput(page).press("Enter");
  await expect(page.getByLabel("Work status")).toContainText("2 active/queued");
  await page.getByRole("button", { name: "Edit view" }).click();
  await page.getByLabel("Work status").click();
  const list = page.getByRole("banner").getByRole("list", { name: "Task queue" });
  const active = list.locator("li").filter({ hasText: "work slowly please" });
  const queued = list.locator("li").filter({ hasText: "work slowly later" });
  await expect(queued).toContainText("queued");
  await active.getByRole("button", { name: "Cancel task" }).click();
  await expect(active).toContainText("cancelled");
  await expect(queued).not.toContainText("cancelled");
});

for (const width of [1000, 1366]) {
  test(`failed export can be inspected and explicitly exported again at ${width}px`, async ({
    page,
    startServer,
    openApp,
    sampleVideo,
  }) => {
    test.setTimeout(90_000);
    const dataDir = await mkdtemp(join(tmpdir(), "dax-export-recovery-"));
    const outputDir = await mkdtemp(join(dirname(sampleVideo), "recovery-export-"));
    await writeFile(
      join(dataDir, "tasks.json"),
      JSON.stringify([
        {
          id: "failed-export",
          title: "Export draft",
          kind: "export",
          mode: "edit",
          status: "failed",
          createdAt: 1,
          error: "Output unavailable",
        },
      ]),
    );
    const server = await startServer({ dataDir });
    try {
      await server.importPaths([sampleVideo]);
      await page.setViewportSize({ width, height: 768 });
      let exportRequests = 0;
      page.on("request", (request) => {
        if (request.method() !== "POST" || !request.url().endsWith("/api/command")) return;
        const body = request.postDataJSON() as { name?: string };
        if (body.name === "export_video") exportRequests++;
      });
      await openApp(server);
      const work = page.getByLabel("Work status");
      await expect(work).toContainText("1 issue");
      await work.focus();
      await page.keyboard.press("Enter");
      const list = page.getByRole("banner").getByRole("list", { name: "Task queue" });
      await expect(list).toContainText("Export");
      await expect(list).toContainText("Output unavailable");
      const before = (await server.api.state()).tasks;
      await work.focus();
      await page.keyboard.press("Enter");
      const exportButton = page.getByRole("button", { name: "Export", exact: true });
      await exportButton.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Export video" });
      await expect(dialog).toBeVisible();
      expect((await server.api.state()).tasks).toEqual(before);
      expect(exportRequests).toBe(0);
      const output = join(outputDir, "recovered.mp4");
      await dialog.getByLabel("Save as").fill(output);
      await dialog.getByRole("button", { name: "Export", exact: true }).click();
      await expect(page.getByText("Exported recovered.mp4.")).toBeVisible({ timeout: 60_000 });
      expect(exportRequests).toBe(1);
      execFileSync(process.env.DAX_FFMPEG ?? "ffmpeg", [
        "-v",
        "error",
        "-xerror",
        "-i",
        output,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0",
        "-f",
        "null",
        "-",
      ]);
    } finally {
      await server.close();
      await rm(outputDir, { recursive: true, force: true });
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  test(`missing media can be relinked using the keyboard at ${width}px`, async ({
    page,
    startServer,
    openApp,
    sampleVideo,
  }) => {
    const server = await startServer();
    const sourceDir = await mkdtemp(join(dirname(sampleVideo), "recovery-source-"));
    const missing = join(sourceDir, "missing.mp4");
    await copyFile(sampleVideo, missing);
    try {
      await server.importPaths([missing]);
      const asset = Object.values((await server.project()).assets)[0];
      if (!asset) throw new Error("Synthetic imported media not found");
      await rm(missing);
      await page.setViewportSize({ width, height: 768 });
      await openApp(server);
      if (width === 1000) await page.getByRole("button", { name: "Show side panel" }).click();
      await page.getByRole("tab", { name: "Media", exact: true }).click();
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: `Relink ${basename(missing)}` }).focus();
      await page.keyboard.press("Enter");
      await (await chooser).setFiles(sampleVideo);
      await expect
        .poll(async () => {
          const path = (await server.project()).assets[asset.id]?.path;
          return Boolean(path && path !== missing);
        })
        .toBe(true);
      const relinked = (await server.project()).assets[asset.id];
      if (!relinked) throw new Error("Relink removed the original asset");
      expect((await stat(relinked.path)).isFile()).toBe(true);
      expect((await server.command("set_format", { preset: "square-1080" })).ok).toBe(true);
    } finally {
      await rm(sourceDir, { recursive: true, force: true });
    }
  });
}
