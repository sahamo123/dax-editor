// The app against the REAL engine process (`dax-engine`, started the way the desktop shell starts it), with nothing
// faked: real routes, real FFmpeg media pipeline, real settings/secret stores and the real agent. These are the
// tests that catch the UI and the server disagreeing about an API shape; the other specs run the real server
// in-process with a scripted assistant and are faster to steer.

import { statSync } from "node:fs";
import { join } from "node:path";
import { chatInput, expect, test } from "./fixtures";

test("imports a clip, runs a manual edit, and the UI follows the engine", async ({
  page,
  startEngine,
  openApp,
  sampleVideo,
  shot,
}) => {
  const engine = await startEngine();
  await openApp(engine);

  // Import selected bytes through the authenticated upload route; the engine pushes state over WebSocket.
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("banner").getByRole("button", { name: "Import" }).click();
  await (await picker).setFiles(sampleVideo);
  await expect(page.getByText("Imported interview.mp4.", { exact: true })).toBeVisible();
  await expect(page.getByText("Drop a video here or click Import")).toBeHidden();

  const imported = await engine.api.project();
  const [assetId] = Object.keys(imported.assets);
  expect(assetId).toBeTruthy();
  expect(imported.timeline.tracks.flatMap((t) => t.clips)).toHaveLength(1);

  // The Media tab: the card and its thumbnail, made by the engine's FFmpeg pipeline and served with the token.
  await page.getByRole("tab", { name: "Media" }).click();
  await expect(
    page.getByRole("tabpanel", { name: "Media" }).getByText("video-interview.mp4", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("img.thumb")
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);

  // Other media files, fetched by the page itself: cross-origin, token in the query, Range honoured.
  await engine.api.settled();
  const media = await page.evaluate(
    async ([base, token, id]) => {
      const q = `?token=${encodeURIComponent(token ?? "")}`;
      const url = (kind: string) => `${base}/api/media/${id}/${kind}${q}`;
      const proxy = await fetch(url("proxy.mp4"), { headers: { Range: "bytes=0-99" } });
      const wave = await fetch(url("waveform.json"));
      // The editor's own <img> request for this file (no-cors, so no CORS headers) may already sit in the browser cache,
      // and fetch() would then reuse that entry and fail its CORS check: ask the network.
      const strip = await fetch(url("filmstrip.jpg"), { cache: "no-store" });
      const bitmap = await createImageBitmap(await strip.blob());
      return {
        stripFrames: Number(strip.headers.get("x-dax-frames")),
        stripSize: [bitmap.width, bitmap.height],
        proxyStatus: proxy.status,
        proxyType: proxy.headers.get("content-type"),
        proxyRange: proxy.headers.get("content-range"),
        wave: (await wave.json()) as {
          version: number;
          peaksPerSecond: number;
          peaks: number[];
          duration: number;
        },
      };
    },
    [engine.url, engine.token, assetId],
  );
  expect(media.proxyStatus).toBe(206);
  expect(media.proxyType).toBe("video/mp4");
  expect(media.proxyRange).toMatch(/^bytes 0-99\//);
  // Formats the editor relies on (defined in @dax/protocol): 96x54 frames in one row, the count in a header.
  expect(media.stripFrames).toBeGreaterThanOrEqual(4);
  expect(media.stripSize).toEqual([media.stripFrames * 96, 54]);
  expect(media.wave).toMatchObject({ version: 1, peaksPerSecond: 50 });
  expect(media.wave.peaks.length).toBeGreaterThan(10);
  expect(media.wave.duration).toBeGreaterThan(5);

  // A manual edit, sent the way the editor sends it (POST /api/command).
  const edit = await engine.api.command("split", { at: 2 });
  expect(edit).toMatchObject({ ok: true });
  expect((await engine.api.project()).timeline.tracks.flatMap((t) => t.clips)).toHaveLength(2);

  // No reload: the UI already knows. The History tab lists it as the user's, and Undo is now available.
  await page.getByRole("tab", { name: "History" }).click();
  const entry = page.getByRole("button", { name: /Split at 2s/ });
  await expect(entry).toContainText("You");
  await expect(entry).toHaveAttribute("aria-current", "step");
  await shot("10-real-engine-edit");

  // Undo from the UI goes back through the engine and the new state comes back over the socket.
  await page.getByRole("banner").getByRole("button", { name: "Undo" }).click();
  await expect(entry).not.toHaveAttribute("aria-current", "step");
  expect((await engine.api.project()).timeline.tracks.flatMap((t) => t.clips)).toHaveLength(1);
  expect(engine.logs.join("\n")).not.toContain(engine.token);
});

test("saves settings and an API key, lists the providers, and never shows the key again", async ({
  page,
  startEngine,
  startModel,
  openApp,
  shot,
}) => {
  const engine = await startEngine();
  const model = await startModel();
  await openApp(engine);

  // Nothing is configured, so the chat says what to do instead of failing; editing is untouched.
  await expect(chatInput(page)).toBeDisabled();
  await expect(page.getByTestId("provider-status")).toBeVisible();
  const before = await engine.api.providers();
  expect(before.map((p) => p.kind).sort()).toEqual(
    [
      "anthropic",
      "cli-claude",
      "cli-codex",
      "cli-gemini",
      "local",
      "openai",
      "openai-compatible",
      "openrouter",
    ].sort(),
  );
  expect(before.every((p) => !p.available && !p.hasApiKey)).toBe(true);

  await page.getByRole("button", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });

  // The real launcher wires a runtime manager, but a fresh data folder has no downloaded model.
  await dialog.getByRole("button", { name: /Local model/ }).click();
  await expect(dialog.getByTestId("local-model-status")).toHaveText("Not downloaded");
  await expect(dialog.getByRole("button", { name: /Download/ })).toBeVisible();

  // The bridge status must agree with the real engine, regardless of this machine's installed CLIs.
  await dialog.getByRole("button", { name: /Claude Code/ }).click();
  const claude = before.find((provider) => provider.kind === "cli-claude");
  if (!claude) throw new Error("Engine omitted the Claude CLI provider");
  await expect(dialog.getByText(claude.detail, { exact: true })).toBeVisible();

  // An OpenAI-compatible provider, pointed at the fake model server.
  await dialog.getByRole("button", { name: /OpenAI-compatible API/ }).click();
  await dialog.getByLabel("Base URL").fill(model.baseUrl);
  await dialog.getByLabel("Model", { exact: true }).fill("scripted-model");
  await dialog.getByLabel("API key").fill("sk-real-engine-key");
  await dialog.getByLabel(/Use OpenAI-compatible API for chat/).check();
  await shot("11-real-engine-settings");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await expect(dialog).toBeHidden();

  // What the engine stored, read back through its own API.
  expect(await engine.api.settings()).toEqual({
    activeProvider: "openai-compatible",
    providers: { "openai-compatible": { baseUrl: model.baseUrl, model: "scripted-model" } },
  });
  const after = await engine.api.providers();
  expect(after.find((p) => p.kind === "openai-compatible")).toMatchObject({
    available: true,
    hasApiKey: true,
  });
  expect(after.find((p) => p.kind === "anthropic")).toMatchObject({
    available: false,
    hasApiKey: false,
  });
  // The key is on disk in an owner-only file, and in no API answer or log.
  if (process.platform !== "win32") {
    expect(statSync(join(engine.dataDir, "secrets.json")).mode & 0o777).toBe(0o600);
  }
  const everything = JSON.stringify([
    await engine.api.state(),
    after,
    await engine.api.settings(),
    engine.logs,
  ]);
  expect(everything).not.toContain("sk-real-engine-key");

  // The UI caught up: chat unlocked, and reopening Settings shows "Key saved" with an empty box.
  await expect(page.getByTestId("provider-status")).toContainText(
    "Configured (connection not tested)",
  );
  await expect(chatInput(page)).toBeEnabled();
  await page.getByRole("button", { name: "Settings" }).click();
  const again = page.getByRole("dialog", { name: "Settings" });
  await expect(again.getByLabel("API key")).toHaveValue("");
  await expect(again.getByText("Key saved")).toBeVisible();
  expect(await page.content()).not.toContain("sk-real-engine-key");
});

test("a chat message goes through the real agent, edits the project, and can be undone", async ({
  page,
  startEngine,
  startModel,
  openApp,
  sampleVideo,
}) => {
  const engine = await startEngine();
  const model = await startModel();
  // Configure the provider the way Settings does, so this test is about chat and not about the dialog.
  expect(
    (
      await engine.api.call("PUT", "/api/settings", {
        activeProvider: "openai-compatible",
        providers: { "openai-compatible": { baseUrl: model.baseUrl, model: "scripted-model" } },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await engine.api.call("POST", "/api/settings/api-key", {
        kind: "openai-compatible",
        apiKey: "sk-chat-key",
      })
    ).status,
  ).toBe(200);
  expect(await engine.api.importPaths([sampleVideo])).toMatchObject({ ok: true });
  await openApp(engine);

  await expect(page.getByTestId("provider-status")).toContainText(
    "Configured (connection not tested)",
  );
  await chatInput(page).fill("Add a title");
  await chatInput(page).press("Enter");

  // The agent called a real command, as the assistant, and said what it did.
  const log = page.getByRole("log", { name: "Conversation" });
  const step = log.locator("details.tool", { hasText: "Add overlay" });
  await expect(step).toContainText("Succeeded");
  await expect(log.getByText("I added the title you asked for.")).toBeVisible();
  const project = await engine.api.project();
  expect(project.timeline.overlays).toHaveLength(1);
  const history = await engine.api.history();
  expect(history.at(-1)).toMatchObject({ source: "ai" });

  // The stored key reached the model, as a bearer token, and nowhere else.
  expect(model.requests.length).toBeGreaterThanOrEqual(2);
  expect(model.requests[0]?.authorization).toBe("Bearer sk-chat-key");
  expect(await page.content()).not.toContain("sk-chat-key");

  // "Undo this change" reverts the whole run through the engine.
  await page.getByRole("button", { name: "Undo this change" }).click();
  await expect(log.getByText("Change undone.")).toBeVisible();
  expect((await engine.api.project()).timeline.overlays).toHaveLength(0);
});
