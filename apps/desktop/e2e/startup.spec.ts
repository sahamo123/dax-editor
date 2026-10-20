// The native shell freezes Object.prototype; exercise the same constraint in the browser build.
import { expect, test } from "./fixtures";

test("starts with the native shell's frozen Object prototype", async ({
  page,
  startServer,
  openApp,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.addInitScript(() => Object.freeze(Object.prototype));
  const engine = await startServer();
  try {
    await openApp(engine);
  } catch {
    throw new Error(JSON.stringify({ errors, body: await page.locator("body").innerText() }));
  }
  await expect(page.getByRole("banner")).toBeVisible();
  expect(errors).toEqual([]);
});
