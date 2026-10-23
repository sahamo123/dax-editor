// Named snapshots isolate endpoint credentials and cannot be rewritten by ordinary settings clients.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Settings } from "@dax/protocol";
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";
import { SecretStore, SettingsStore } from "./stores.js";
import { startHarness } from "./test/harness.js";

describe("named connections", () => {
  it("isolates same-family accounts, keyless loads, restart and public settings", async () => {
    const h = await startHarness();
    const keyA = "sk-test-profile-ACCOUNT-A-123456";
    const keyB = "sk-test-profile-ACCOUNT-B-123456";
    try {
      const configure = async (baseUrl: string, key?: string) => {
        await h.post("/api/settings", {
          activeProvider: "local",
          providers: { "openai-compatible": { baseUrl, model: "model" } },
        });
        if (key) await h.post("/api/settings/api-key", { kind: "openai-compatible", apiKey: key });
      };
      const save = async (name: string) =>
        (
          await h.post("/api/settings/connections", {
            action: "save",
            kind: "openai-compatible",
            name,
          })
        ).json<Settings>();
      await configure("https://a.example/v1", keyA);
      const a = (await save("Account A")).savedConnections?.[0];
      expect(a).toBeDefined();
      await configure("https://b.example/v1", keyB);
      const b = (await save("Account B")).savedConnections?.[1];
      expect(b).toBeDefined();
      await configure("http://127.0.0.1:1234/v1");
      const empty = (await save("Keyless local")).savedConnections?.[2];
      expect(empty).toBeDefined();
      for (const [connection, key] of [
        [a, keyA],
        [b, keyB],
        [empty, undefined],
      ] as const) {
        const loaded = await h.post("/api/settings/connections", {
          action: "load",
          id: connection?.id,
        });
        expect(loaded.status).toBe(200);
        expect(loaded.json<Settings>().providers["openai-compatible"]).toEqual(connection?.config);
        expect(loaded.text()).not.toContain(keyA);
        expect(loaded.text()).not.toContain(keyB);
        const privateStore = new SecretStore(
          h.dataDir,
          createLogger(() => undefined),
        );
        await privateStore.load();
        expect(privateStore.get("openai-compatible")).toBe(key);
      }
      // A legacy client omitting snapshots must preserve them; forged metadata must not rebind a saved key.
      const current = (await h.req("/api/settings")).json<Settings>();
      await h.post("/api/settings", {
        ...current,
        savedConnections: [{ ...a, config: { baseUrl: "https://evil.example", model: "bad" } }],
      });
      const reloaded = (await h.req("/api/settings")).json<Settings>();
      expect(reloaded.savedConnections?.[0]).toEqual(a);
      await configure("https://other.example/v1");
      expect((await h.req("/api/settings")).json<Settings>().savedConnections).toHaveLength(3);
      const settings = new SettingsStore(
        h.dataDir,
        createLogger(() => undefined),
      );
      await settings.load();
      expect(settings.get().savedConnections).toHaveLength(3);
      expect(await readFile(join(h.dataDir, "settings.json"), "utf8")).not.toContain(keyA);
      expect(h.logs.join("\n")).not.toContain(keyA);
      expect(
        (await h.post("/api/settings/connections", { action: "remove", id: a?.id })).status,
      ).toBe(200);
      expect(
        (await h.post("/api/settings/connections", { action: "load", id: a?.id })).status,
      ).toBe(404);
    } finally {
      await h.cleanup();
    }
  });
});
