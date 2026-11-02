// Inspect synthetic task live regions in the browser accessibility tree around a modal.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

async function inspectRegions(page: Page, phase: string): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Accessibility.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const { nodes: fullTree } = await cdp.send("Accessibility.getFullAXTree");
    for (const role of ["status", "alert"] as const) {
      const selector = `.sr-only[role="${role}"]`;
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
      if (!nodeId) throw new Error(`Missing synthetic ${role} live region`);
      const { nodes } = await cdp.send("Accessibility.getPartialAXTree", {
        nodeId,
        fetchRelatives: false,
      });
      const node = nodes[0];
      const fullNode = fullTree.find(
        (candidate) => candidate.backendDOMNodeId === node?.backendDOMNodeId,
      );
      const ancestors: { role: unknown; ignored: boolean }[] = [];
      let current = fullNode;
      const visited = new Set<string>();
      while (current && !visited.has(current.nodeId)) {
        visited.add(current.nodeId);
        ancestors.push({ role: current.role?.value, ignored: current.ignored });
        current = fullTree.find((candidate) => candidate.nodeId === current?.parentId);
      }
      const inModal = await page
        .locator(selector)
        .evaluate((element) => Boolean(element.closest('[role="dialog"][aria-modal="true"]')));
      const relevant = node?.properties?.filter((property) =>
        ["live", "atomic", "relevant"].includes(property.name),
      );
      expect(node?.ignored).toBe(false);
      expect(node?.role?.value).toBe(role);
      expect(fullNode).toBeDefined();
      expect(ancestors.some((ancestor) => ancestor.role === "RootWebArea")).toBe(true);
      expect(relevant).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "live",
            value: expect.objectContaining({ value: role === "status" ? "polite" : "assertive" }),
          }),
          expect.objectContaining({
            name: "atomic",
            value: expect.objectContaining({ value: true }),
          }),
        ]),
      );
      console.log(
        JSON.stringify({
          phase,
          role,
          inModal,
          ignored: node?.ignored,
          ignoredReasons: node?.ignoredReasons,
          axRole: node?.role?.value,
          includedInFullTree: Boolean(fullNode),
          ancestors,
          properties: relevant,
        }),
      );
    }
  } finally {
    await cdp.detach();
  }
}

test("records task live-region accessibility state around Settings and review", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer({
    modelStepMs: 300,
    speechWaitForCancel: true,
    speechFailureAfterCancel: true,
  });
  console.log(
    JSON.stringify({ browser: page.context().browser()?.version(), platform: process.platform }),
  );
  await openApp(server);
  const statusElement = await page.locator('.sr-only[role="status"]').elementHandle();
  const alertElement = await page.locator('.sr-only[role="alert"]').elementHandle();
  if (!statusElement || !alertElement) throw new Error("Missing synthetic live regions");
  const expectStableRegions = async () => {
    expect(
      await statusElement.evaluate(
        (element) => element === document.querySelector('.sr-only[role="status"]'),
      ),
    ).toBe(true);
    expect(
      await alertElement.evaluate(
        (element) => element === document.querySelector('.sr-only[role="alert"]'),
      ),
    ).toBe(true);
  };
  await inspectRegions(page, "before");
  await page.getByRole("button", { name: /Run a model on this computer/ }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.getByRole("button", { name: /Download/ }).click();
  await expect(
    dialog.getByRole("progressbar", { name: "Downloading the local model" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel download" }).click();
  await expect(page.locator('.sr-only[role="status"]')).toContainText(
    "Local model download cancelled.",
  );
  const speech = await server.api.call("POST", "/api/speech/install", {});
  if (
    !speech.body ||
    typeof speech.body !== "object" ||
    !("jobId" in speech.body) ||
    typeof speech.body.jobId !== "string"
  )
    throw new Error("Synthetic speech setup did not start");
  await server.api.call("POST", `/api/tasks/${speech.body.jobId}/cancel`, {});
  await expect(page.locator('.sr-only[role="alert"]')).toContainText("Cancelled");
  await expectStableRegions();
  await inspectRegions(page, "settings-open");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expectStableRegions();
  await inspectRegions(page, "after");
  await server.importPaths([sampleVideo]);
  await page.getByRole("button", { name: "Review effects", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Rendered effects preview" });
  await expect(review).toBeVisible();
  await expect
    .poll(
      async () =>
        (await server.api.state()).jobs.find((job) => job.label === "Render complete edit preview")
          ?.id,
    )
    .toBeDefined();
  await expectStableRegions();
  await inspectRegions(page, "review-open");
  await review.getByRole("button", { name: "Back to editing" }).click();
  await expect(review).toHaveCount(0);
  const reviewJob = (await server.api.state()).jobs.find(
    (job) => job.label === "Render complete edit preview",
  );
  if (reviewJob?.status === "running")
    await server.api.call("POST", `/api/tasks/${reviewJob.id}/cancel`, {});
  await server.api.settled(45000);
});
