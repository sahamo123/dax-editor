// Tests that the launcher wires the CLI bridges into the provider list and closes them with the server.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CliBridges } from "@dax/bridges";
import { API, type ProviderStatus } from "@dax/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { launch } from "./launch.js";

let dataDir: string | undefined;
let running: { close(): Promise<void> } | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
  // Remove exactly the folder this file created.
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  dataDir = undefined;
});

/** A bridge double that reports one fixed status and counts how often it was closed. */
function fakeBridges(status: ProviderStatus): CliBridges & { closed: number } {
  const bridges = {
    closed: 0,
    async extraProviders() {
      return undefined;
    },
    async statuses() {
      return [status];
    },
    async close() {
      bridges.closed += 1;
    },
  };
  return bridges;
}

/** Fetch the provider list from a started engine, with its token. */
async function providers(info: { url: string; token: string }): Promise<ProviderStatus[]> {
  const res = await fetch(`${info.url}${API.providers}`, {
    headers: { Authorization: `Bearer ${info.token}` },
  });
  return (await res.json()) as ProviderStatus[];
}

describe("launch and the CLI bridges", () => {
  it("shows the injected bridge's status for cli-claude and closes the bridge with the server", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "dax-launch-"));
    const bridges = fakeBridges({
      kind: "cli-claude",
      available: true,
      detail: "Ready. Claude Code 2.1.302 will use your Claude subscription.",
      signedIn: true,
    });
    const server = await launch({ dataDir, port: 0, cliBridges: bridges });
    running = server;
    const claude = (await providers(server.info)).find((p) => p.kind === "cli-claude");
    expect(claude).toMatchObject({ available: true, signedIn: true });
    expect(bridges.closed).toBe(0);

    await server.close();
    running = undefined;
    expect(bridges.closed).toBe(1);
  });

  it("reports the cli providers as not installed in this build when bridges are turned off", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "dax-launch-"));
    const server = await launch({ dataDir, port: 0, cliBridges: false });
    running = server;
    const claude = (await providers(server.info)).find((p) => p.kind === "cli-claude");
    expect(claude).toMatchObject({
      available: false,
      detail: "Sign-in bridge not installed in this build",
    });
  });
});
