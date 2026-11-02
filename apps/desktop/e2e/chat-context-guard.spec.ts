// Reject stale chat context while an attachment is staged; use only synthetic projects and media.
import { readFile } from "node:fs/promises";
import { chatInput, expect, test } from "./fixtures";

test("reject a project switch during staging without losing the draft", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer({ aiReady: true });
  await server.importPaths([sampleVideo]);
  const initial = await server.api.state();
  if (!initial.projectId) throw new Error("Test engine did not provide a project identity");
  await openApp(server);
  await page.getByLabel("Chat mode").selectOption("plan");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach videos" }).click();
  await (await chooser).setFiles(sampleVideo);
  await chatInput(page).fill("Plan changes for the first project");
  let staging = false;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/import/upload**", async (route) => {
    staging = true;
    await gate;
    await route.continue();
  });
  try {
    await chatInput(page).press("Enter");
    await expect.poll(() => staging).toBe(true);
    const switched = await server.api.call("POST", "/api/project/new", {
      name: "Synthetic second",
    });
    expect(switched.status).toBe(200);
    const after = await server.api.state();
    expect(after.projectId).toBeDefined();
    expect(after.projectId).not.toBe(initial.projectId);
    const response = page.waitForResponse(
      (r) => r.url().endsWith("/api/chat") && r.request().method() === "POST",
    );
    release?.();
    expect((await response).status()).toBe(409);
    await expect(chatInput(page)).toHaveValue("Plan changes for the first project");
    await expect(page.getByRole("button", { name: /Remove attachment/ })).toBeVisible();
    expect(
      (await server.api.state()).tasks?.some(
        (item) => item.title === "Plan changes for the first project",
      ),
    ).toBe(false);
  } finally {
    release?.();
  }
});

test("reject a provider switch during staging without losing the draft", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer({ aiReady: true });
  await server.importPaths([sampleVideo]);
  const initial = await server.api.state();
  await openApp(server);
  await page.getByLabel("Chat mode").selectOption("plan");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach videos" }).click();
  await (await chooser).setFiles(sampleVideo);
  await chatInput(page).fill("Plan with the first provider");
  let staging = false;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/import/upload**", async (route) => {
    staging = true;
    await gate;
    await route.continue();
  });
  try {
    await chatInput(page).press("Enter");
    await expect.poll(() => staging).toBe(true);
    const changed = await server.api.call("POST", "/api/settings", {
      ...initial.settings,
      activeProvider: "openrouter",
    });
    expect(changed.status).toBe(200);
    const after = await server.api.state();
    expect(after.settings.activeProvider).not.toBe(initial.settings.activeProvider);
    const response = page.waitForResponse(
      (r) => r.url().endsWith("/api/chat") && r.request().method() === "POST",
    );
    release?.();
    expect((await response).status()).toBe(409);
    await expect(chatInput(page)).toHaveValue("Plan with the first provider");
    await expect(page.getByRole("button", { name: /Remove attachment/ })).toBeVisible();
    expect(
      (await server.api.state()).tasks?.some(
        (item) => item.title === "Plan with the first provider",
      ),
    ).toBe(false);
  } finally {
    release?.();
  }
});

for (const phase of ["between uploads", "before chat"] as const) {
  for (const context of ["project", "provider"] as const) {
    test(`reject a ${context} switch ${phase}`, async ({
      page,
      startServer,
      openApp,
      sampleVideo,
    }) => {
      const server = await startServer({ aiReady: true });
      await server.importPaths([sampleVideo]);
      const initial = await server.api.state();
      await openApp(server);
      await page.getByLabel("Chat mode").selectOption("plan");
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Attach videos" }).click();
      const bytes = await readFile(sampleVideo);
      await (await chooser).setFiles([
        { name: "first.mp4", mimeType: "video/mp4", buffer: bytes },
        { name: "second.mp4", mimeType: "video/mp4", buffer: bytes },
      ]);
      const message = `Plan ${context} ${phase}`;
      await chatInput(page).fill(message);
      let held = false;
      let uploads = 0;
      let requests = 0;
      let release: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      page.on("request", (request) => {
        if (request.url().endsWith("/api/chat") && request.method() === "POST") requests++;
      });
      await page.route("**/api/import/upload**", async (route) => {
        uploads++;
        if (phase === "between uploads" && uploads === 2) {
          held = true;
          await gate;
        }
        await route.continue();
      });
      if (phase === "before chat") {
        await page.route("**/api/chat", async (route) => {
          held = true;
          await gate;
          await route.continue();
        });
      }
      try {
        await chatInput(page).press("Enter");
        await expect.poll(() => held).toBe(true);
        const changed =
          context === "project"
            ? await server.api.call("POST", "/api/project/new", { name: "Second" })
            : await server.api.call("POST", "/api/settings", {
                ...initial.settings,
                activeProvider: "openrouter",
              });
        expect(changed.status).toBe(200);
        const response = page.waitForResponse(
          (r) => r.url().endsWith("/api/chat") && r.request().method() === "POST",
        );
        release?.();
        expect((await response).status()).toBe(409);
        await expect(chatInput(page)).toHaveValue(message);
        await expect(
          page.getByRole("button", { name: "Remove attachment first.mp4" }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Remove attachment second.mp4" }),
        ).toBeVisible();
        expect((await server.api.state()).tasks?.some((item) => item.title === message)).toBe(
          false,
        );
        expect(requests).toBe(1);
      } finally {
        release?.();
      }
    });
  }
}
