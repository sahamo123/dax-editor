// The Project disclosure retains native keyboard activation without starting playback.
import { expect, test } from "./fixtures";

test("Space opens and closes the Project menu without changing playback", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await openApp(server);
  const summary = page.locator("details.project-menu > summary").filter({ hasText: /^Project$/ });
  const menu = summary.locator("..");
  const play = page.getByTestId("stage").getByRole("button", { name: "Play", exact: true });
  await expect(play).toBeVisible();
  await summary.focus();
  await expect(summary).toBeFocused();
  await page.keyboard.press("Space");
  await expect(menu).toHaveAttribute("open", "");
  await expect(play).toBeVisible();
  await page.keyboard.press("Space");
  await expect(menu).not.toHaveAttribute("open", "");
  await expect(play).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("open", "");
  await page.keyboard.press("Enter");
  await expect(menu).not.toHaveAttribute("open", "");
  const workStatus = page.getByLabel("Work status");
  const workMenu = workStatus.locator("..");
  await workStatus.focus();
  await expect(workStatus).toBeFocused();
  await page.keyboard.press("Space");
  await expect(workMenu).toHaveAttribute("open", "");
  await expect(play).toBeVisible();
  await page.keyboard.press("Space");
  await expect(workMenu).not.toHaveAttribute("open", "");
  await page.keyboard.press("Enter");
  await expect(workMenu).toHaveAttribute("open", "");
  await page.keyboard.press("Enter");
  await expect(workMenu).not.toHaveAttribute("open", "");
  await expect(play).toBeVisible();
  await workStatus.evaluate((element: HTMLElement) => element.blur());
  await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await page.keyboard.press("Space");
  await expect(
    page.getByTestId("stage").getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
});
