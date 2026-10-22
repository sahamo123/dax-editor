// Current release controls against the real engine with no installed AI or external services.
import { expect, test } from "./fixtures";

test("manual project copy preserves edits and laptop panels remain reachable without AI", async ({
  page,
  startEngine,
  openApp,
  sampleVideo,
  shot,
}) => {
  const engine = await startEngine();
  await page.setViewportSize({ width: 1024, height: 700 });
  await openApp(engine);
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("banner").getByRole("button", { name: "Import", exact: true }).click();
  await (await picker).setFiles(sampleVideo);
  await expect.poll(async () => Object.keys((await engine.api.project()).assets).length).toBe(1);
  await page.getByRole("button", { name: "Show side panel", exact: true }).click();
  await page.getByRole("tab", { name: "Tools", exact: true }).click();
  await page.getByLabel("Frame rate", { exact: true }).selectOption("24");
  await page.getByLabel("Output format", { exact: true }).selectOption("square-1080");
  await expect.poll(async () => (await engine.api.project()).timeline.width).toBe(1080);
  await expect.poll(async () => (await engine.api.project()).timeline.fps).toBe(24);
  expect((await engine.api.project()).timeline.fit).toBe("contain");
  await page.getByLabel("Title at playhead").fill("Manual release check");
  await page.getByRole("button", { name: "Add title", exact: true }).click();
  await expect
    .poll(async () => JSON.stringify(await engine.api.project()))
    .toContain("Manual release check");
  await shot("20-functional-laptop-tools");
  await page.getByRole("button", { name: "Close tools panel" }).click();
  await page.getByRole("banner").getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => JSON.stringify(await engine.api.project()))
    .not.toContain("Manual release check");
  await page.getByRole("banner").getByRole("button", { name: "Redo", exact: true }).click();
  await expect
    .poll(async () => JSON.stringify(await engine.api.project()))
    .toContain("Manual release check");
  await page.getByText("Project", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project as…", exact: true }).click();
  const copy = await download;
  const path = await copy.path();
  expect(path).toBeTruthy();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page
    .getByRole("dialog", { name: "New project" })
    .getByRole("textbox")
    .fill("Fresh manual project");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect.poll(async () => Object.keys((await engine.api.project()).assets).length).toBe(0);
  await page.getByLabel("Open Dax project").setInputFiles(path ?? "");
  await expect
    .poll(async () => JSON.stringify(await engine.api.project()))
    .toContain("Manual release check");
  await expect.poll(async () => (await engine.api.project()).timeline.height).toBe(1080);
});

test("live MCP setup is visible and missing optional runtimes have truthful states", async ({
  page,
  startEngine,
  openApp,
  shot,
}) => {
  const engine = await startEngine();
  await openApp(engine);
  await page.getByRole("tab", { name: "Connect AI", exact: true }).click();
  await expect(page.getByLabel("Codex MCP configuration")).toContainText("dax_planning");
  await expect(page.getByLabel("Claude Desktop / Claude Code MCP configuration")).not.toContainText(
    "Bearer",
  );
  await page.getByRole("tab", { name: "Speech", exact: true }).click();
  await expect(page.getByRole("button", { name: /Install.*speech/i })).toBeVisible();
  await page.getByRole("tab", { name: "Motion", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Render and add to timeline", exact: true }),
  ).toBeDisabled();
  await shot("21-functional-runtime-status");
});
