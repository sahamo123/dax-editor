// Failure and autosave recovery stay visible using only isolated synthetic projects.
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "./fixtures";

test("restored interrupted and failed tasks are visible in the compact Work menu", async ({
  page,
  startServer,
  openApp,
  shot,
}) => {
  const server = await startServer();
  await server.stop();
  await writeFile(
    join(server.dataDir, "tasks.json"),
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
      {
        id: "running-speech",
        title: "Transcribe interview",
        kind: "transcribe",
        mode: "edit",
        status: "running",
        createdAt: 2,
      },
    ]),
  );
  await server.start();
  await page.setViewportSize({ width: 1000, height: 700 });
  await openApp(server);
  const work = page.getByLabel("Work status");
  await expect(work).toContainText("2 issues");
  for (const name of ["Settings", "Show side panel"]) {
    const action = page.getByRole("button", { name, exact: true });
    const bounds = await action.boundingBox();
    expect((bounds?.x ?? 1000) + (bounds?.width ?? 0)).toBeLessThanOrEqual(1000);
  }
  await work.focus();
  await page.keyboard.press("Enter");
  const list = page.getByRole("banner").getByRole("list", { name: "Task queue" });
  await expect(list).toContainText("Export");
  await expect(list).toContainText("Output unavailable");
  await expect(list).toContainText("Transcription");
  await expect(list).toContainText("interrupted");
  await expect(list).toContainText("Origin not recorded");
  await shot("s01-05-task-failures-compact");
});

test("a visible autosave failure can be repaired and saved without losing the edit", async ({
  page,
  startServer,
  openApp,
  shot,
}) => {
  const server = await startServer();
  await page.setViewportSize({ width: 1366, height: 768 });
  const snapshots: string[] = [];
  page.on("websocket", (socket) => {
    socket.on("close", () => snapshots.push("websocket closed"));
    socket.on("framereceived", ({ payload }) => {
      try {
        const event = JSON.parse(String(payload)) as {
          type?: string;
          state?: { saveError?: string; revision?: number };
        };
        if (event.type === "state")
          snapshots.push(
            `push revision=${event.state?.revision ?? "unknown"} saveError=${Boolean(event.state?.saveError)}`,
          );
      } catch {
        snapshots.push("websocket event could not be parsed");
      }
    });
  });
  page.on("response", async (response) => {
    if (!response.url().endsWith("/api/state") || !response.ok()) return;
    try {
      const state = (await response.json()) as { saveError?: string; revision?: number };
      snapshots.push(
        `state revision=${state.revision ?? "unknown"} saveError=${Boolean(state.saveError)}`,
      );
    } catch {
      snapshots.push("state response could not be parsed");
    }
  });
  await openApp(server);
  const projectsDir = join(server.dataDir, "projects");
  const projectName = (await readdir(projectsDir)).find((name) => name.endsWith(".dax.json"));
  if (!projectName) throw new Error("Synthetic scratch project not found");
  const projectPath = join(projectsDir, projectName);
  const original = await readFile(projectPath);
  await rm(projectPath);
  await mkdir(projectPath);
  let repaired = false;
  try {
    expect((await server.command("set_format", { preset: "square-1080" })).ok).toBe(true);
    await expect(page.getByText("Save failed", { exact: true })).toBeVisible();
    await page.getByText("Project", { exact: true }).click();
    try {
      await expect(page.getByText(/Your latest changes may not be on disk/)).toBeVisible();
    } catch (error) {
      throw new Error(`Autosave message disappeared; ${snapshots.join("; ")}`, { cause: error });
    }
    await shot("s01-05-autosave-failure");
    await rm(projectPath, { recursive: true });
    await writeFile(projectPath, original);
    repaired = true;
    await page.getByRole("button", { name: "Save project", exact: true }).click();
    await expect(page.getByText("Save failed", { exact: true })).toBeHidden();
    expect((await server.project()).timeline.width).toBe(1080);
    expect(JSON.parse(await readFile(projectPath, "utf8")).timeline.width).toBe(1080);
  } finally {
    if (!repaired) {
      await rm(projectPath, { recursive: true, force: true });
      await writeFile(projectPath, original);
    }
  }
});

test("compact controls stay in view with active, queued and failed work", async ({
  page,
  startServer,
  openApp,
}) => {
  const dataDir = await mkdtemp(join(tmpdir(), "dax-task-status-"));
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
  const server = await startServer({ aiReady: true, dataDir });
  try {
    await page.setViewportSize({ width: 1000, height: 700 });
    await openApp(server);
    await page.getByRole("button", { name: "Assistant view" }).click();
    const input = page.getByLabel("Message to the assistant");
    await expect(input).toBeEnabled();
    await input.fill("work slowly please");
    await input.press("Enter");
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
    await input.fill("Plan the next edit");
    await input.press("Enter");
    const work = page.getByLabel("Work status");
    await expect(work).toContainText("2 active/queued");
    await expect(work).toContainText("1 issue");
    for (const width of [1000, 800, 600]) {
      await page.setViewportSize({ width, height: 700 });
      for (const name of ["Settings", "Show side panel"]) {
        const action = page.getByRole("button", { name, exact: true });
        const bounds = await action.boundingBox();
        expect((bounds?.x ?? width) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
        expect((bounds?.y ?? 700) + (bounds?.height ?? 0)).toBeLessThanOrEqual(700);
      }
    }
    await page.getByRole("button", { name: "Stop", exact: true }).click();
  } finally {
    await server.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("a missing synthetic media file can be relinked through the Media panel", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer();
  const missing = join(dirname(sampleVideo), "temporary-relink-source.mp4");
  await copyFile(sampleVideo, missing);
  try {
    await server.importPaths([missing]);
    const before = await server.project();
    const asset = Object.values(before.assets)[0];
    if (!asset) throw new Error("Synthetic imported media not found");
    await rm(missing);
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(server);
    await page.getByRole("tab", { name: "Media", exact: true }).click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Relink temporary-relink-source.mp4" }).click();
    await (await chooser).setFiles(sampleVideo);
    await expect
      .poll(async () => (await server.project()).assets[asset.id]?.path)
      .not.toBe(missing);
  } finally {
    await rm(missing, { force: true });
  }
});
