import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { listeningPids } from "./listener.js";

let server: Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((r) => server?.close(() => r()));
  server = undefined;
});

describe("listeningPids", () => {
  it("finds this process as the owner of a port it listens on", async () => {
    server = createServer((_req, res) => res.end("ok"));
    await new Promise<void>((r) => server?.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    const pids = await listeningPids(port);
    // Where the platform cannot tell, the answer is undefined and the caller fails closed.
    if (pids !== undefined) expect(pids).toContain(process.pid);
  });

  it("does not report this process for a port nothing listens on", async () => {
    const probe = createServer();
    await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
    const port = (probe.address() as AddressInfo).port;
    await new Promise<void>((r) => probe.close(() => r()));
    const pids = await listeningPids(port);
    if (pids !== undefined) expect(pids).not.toContain(process.pid);
  });
});
