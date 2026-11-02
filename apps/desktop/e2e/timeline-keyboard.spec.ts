// The timeline listbox has one tab stop, explicit selection and contextual transport shortcuts.
import { expect, test } from "./fixtures";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1000, height: 700 },
]) {
  test(`timeline keyboard selection preserves transport at ${viewport.width}`, async ({
    page,
    startServer,
    openApp,
    sampleVideo,
    shot,
  }) => {
    await page.setViewportSize(viewport);
    const server = await startServer();
    await server.importPaths([sampleVideo]);
    expect((await server.command("split", { at: 2 })).ok).toBe(true);
    expect(
      (
        await server.command("add_overlay", {
          preset: "title-fade",
          text: "Sample title",
          start: 0,
          duration: 3,
        })
      ).ok,
    ).toBe(true);
    const original = await server.project();
    await openApp(server);
    const timeline = page.getByRole("listbox", { name: "Timeline" });
    const clips = timeline.getByTestId("clip");
    const overlay = timeline.getByTestId("overlay");
    await expect(clips).toHaveCount(2);
    await expect(overlay).toHaveCount(1);
    await expect(timeline.locator('[role="option"][tabindex="0"]')).toHaveCount(1);
    await expect(clips.first()).toHaveAttribute("aria-posinset", "1");
    await expect(overlay).toHaveAttribute("aria-posinset", "2");
    await expect(clips.nth(1)).toHaveAttribute("aria-setsize", "3");
    expect(
      await timeline
        .getByRole("option")
        .evaluateAll((options) => options.map((option) => option.getAttribute("aria-posinset"))),
    ).toEqual(["1", "2", "3"]);
    await clips.first().focus();
    await page.keyboard.press("Enter");
    await expect(clips.first()).toHaveAttribute("aria-selected", "true");
    const time = page.getByTestId("timecode");
    const before = await time.innerText();
    await page.keyboard.press("ArrowRight");
    await expect(overlay).toBeFocused();
    await expect(clips.first()).toHaveAttribute("aria-selected", "true");
    await expect(time).toHaveText(before);
    await page.keyboard.press("Enter");
    await expect(overlay).toHaveAttribute("aria-selected", "true");
    await expect(overlay).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(clips.nth(1)).toBeFocused();
    await expect(overlay).toHaveAttribute("aria-selected", "true");
    await expect(clips.nth(1)).toHaveAttribute("aria-selected", "false");
    await expect(clips.nth(1)).toHaveCSS("outline-style", "solid");
    await shot(`timeline-keyboard-focus-${viewport.width}`);
    await page.keyboard.press("Control+ArrowRight");
    await expect(time).not.toHaveText(before);
    await expect(clips.nth(1)).toBeFocused();
    const afterFrame = await time.innerText();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(time).not.toHaveText(afterFrame);
    await expect(clips.nth(1)).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.getByTestId("play")).toHaveAttribute("aria-label", "Pause");
    await page.keyboard.press("Space");
    await expect(page.getByTestId("play")).toHaveAttribute("aria-label", "Play");
    await page.keyboard.press("Tab");
    await expect(timeline.locator(":focus")).toHaveCount(0);
    await page.getByRole("button", { name: "Settings", exact: true }).focus();
    const outsideBefore = await time.innerText();
    await page.keyboard.press("ArrowRight");
    await expect(time).not.toHaveText(outsideBefore);
    expect(await server.project()).toEqual(original);
  });
}

test("arrow navigation reaches virtualized offscreen timeline items", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  expect((await server.command("split", { at: 3 })).ok).toBe(true);
  expect(
    (
      await server.command("add_overlay", {
        preset: "title-fade",
        text: "Distant title",
        start: 5,
        duration: 1,
      })
    ).ok,
  ).toBe(true);
  const original = await server.project();
  await openApp(server);
  const slider = page.getByTestId("zoom-slider");
  await slider.focus();
  await slider.press("End");
  const timeline = page.getByRole("listbox", { name: "Timeline" });
  const clips = timeline.getByTestId("clip");
  await expect(clips).toHaveCount(1);
  await expect(timeline.getByTestId("overlay")).toHaveCount(0);
  await clips.first().focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");
  await expect(timeline.getByTestId("clip").last()).toBeFocused();
  await expect(page.getByTestId("timeline-scroll")).not.toHaveJSProperty("scrollLeft", 0);
  await page.keyboard.press("ArrowRight");
  await expect(timeline.getByTestId("overlay")).toBeFocused();
  await expect(timeline.getByTestId("overlay")).toHaveAttribute("aria-selected", "false");
  expect(await server.project()).toEqual(original);
});

test("deleting the focused item keeps a usable timeline focus", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  expect((await server.command("split", { at: 3 })).ok).toBe(true);
  await openApp(server);
  const timeline = page.getByRole("listbox", { name: "Timeline" });
  const clips = timeline.getByTestId("clip");
  await clips.first().focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Delete");
  await expect(clips).toHaveCount(1);
  await expect(clips.first()).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Delete");
  await expect(clips).toHaveCount(0);
  await expect(timeline).toBeFocused();
});

test("deletion does not reclaim focus after the user moves elsewhere", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  expect((await server.command("split", { at: 3 })).ok).toBe(true);
  await openApp(server);
  const clips = page.getByRole("listbox", { name: "Timeline" }).getByTestId("clip");
  let release = () => {};
  let started = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route("**/api/command", async (route) => {
    if (route.request().method() === "POST") {
      started();
      await held;
    }
    await route.continue();
  });
  try {
    await clips.first().focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Delete");
    await requested;
    const settings = page.getByRole("button", { name: "Settings", exact: true });
    await settings.focus();
    release();
    await expect(clips).toHaveCount(1);
    await expect(settings).toBeFocused();
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("an externally removed focused clip recovers focus without selecting another clip", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  expect((await server.command("split", { at: 3 })).ok).toBe(true);
  await openApp(server);
  const timeline = page.getByRole("listbox", { name: "Timeline" });
  const clips = timeline.getByTestId("clip");
  await clips.first().focus();
  const id = await clips.first().getAttribute("data-clip-id");
  if (!id) throw new Error("Clip id missing");
  expect((await server.command("remove_clip", { clipId: id })).ok).toBe(true);
  await expect(clips).toHaveCount(1);
  await expect(clips.first()).toBeFocused();
  await expect(clips.first()).toHaveAttribute("aria-selected", "false");
});
