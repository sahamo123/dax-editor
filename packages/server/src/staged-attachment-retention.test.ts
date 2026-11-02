// Observe current staging lifetime with generated media in isolated test directories; never remove user files.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { StateResponse } from "@dax/protocol";
import { describe, expect, it, vi } from "vitest";
import { HAS_FFMPEG, type Harness, makeVideo, startHarness } from "./test/harness.js";

async function stage(h: Harness, name: string, bytes: Buffer): Promise<string> {
  const response = await h.req(`/api/import/upload?name=${name}&stage=true`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: bytes,
  });
  expect(response.status).toBe(200);
  const value = response.json<{ ok: boolean; data: { path: string } }>();
  expect(value.ok).toBe(true);
  return value.data.path;
}

describe.skipIf(!HAS_FFMPEG)("staged attachment retention", () => {
  it("retains an unsubmitted file after a later empty upload fails and after restart", async () => {
    const first = await startHarness();
    try {
      const bytes = await readFile(await makeVideo(first.workDir, "fixture.mp4"));
      const staged = await stage(first, "first.mp4", bytes);
      const failed = await first.req("/api/import/upload?name=empty.mp4&stage=true", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: Buffer.alloc(0),
      });
      expect(failed.status).toBe(400);
      expect((await readFile(staged)).equals(bytes)).toBe(true);
      expect(await readdir(join(first.dataDir, "uploads"))).toHaveLength(1);
      const before = (await first.req("/api/state")).json<StateResponse>();
      expect(Object.keys(before.project.assets)).toHaveLength(0);
      expect(before.tasks?.some((task) => task.kind === "chat")).toBe(false);
      await first.server.close();
      const second = await startHarness({ dataDir: first.dataDir });
      try {
        expect((await readFile(staged)).equals(bytes)).toBe(true);
        expect(
          (await second.req("/api/state"))
            .json<StateResponse>()
            .tasks?.some((task) => task.kind === "chat"),
        ).toBe(false);
      } finally {
        await second.cleanup();
      }
    } finally {
      await first.cleanup();
    }
  });

  it("retains project and queued-task sources through interruption and restart", async () => {
    let running = false;
    const first = await startHarness({
      agentRunner: {
        async run(_message, context) {
          running = true;
          await new Promise<void>((resolve) =>
            context.signal.addEventListener("abort", () => resolve(), { once: true }),
          );
        },
      },
    });
    try {
      const bytes = await readFile(await makeVideo(first.workDir, "fixture.mp4"));
      const projectSource = await stage(first, "project.mp4", bytes);
      const queuedSource = await stage(first, "queued.mp4", bytes);
      expect((await first.post("/api/import", { paths: [projectSource] })).json().ok).toBe(true);
      expect(
        (await first.post("/api/project/save", { path: join(first.workDir, "project.dax.json") }))
          .status,
      ).toBe(200);
      expect(
        (
          await first.post("/api/chat", {
            message: "running plan",
            mode: "plan",
            attachments: [projectSource],
          })
        ).status,
      ).toBe(202);
      await vi.waitFor(() => expect(running).toBe(true));
      expect(
        (
          await first.post("/api/chat", {
            message: "queued plan",
            mode: "plan",
            queue: true,
            attachments: [queuedSource],
          })
        ).status,
      ).toBe(202);
      const before = (await first.req("/api/state")).json<StateResponse>();
      expect(before.tasks?.find((task) => task.title === "queued plan")).toMatchObject({
        status: "queued",
        attachments: [queuedSource],
      });
      expect(
        Object.values(before.project.assets).some((asset) => asset.path === projectSource),
      ).toBe(true);
      await first.server.close();
      const second = await startHarness({
        dataDir: first.dataDir,
        allowRoots: [first.dataDir, first.workDir],
      });
      try {
        const after = (await second.req("/api/state")).json<StateResponse>();
        expect(after.tasks?.find((task) => task.title === "queued plan")).toMatchObject({
          status: "interrupted",
          attachments: [queuedSource],
        });
        expect(
          Object.values(after.project.assets).some((asset) => asset.path === projectSource),
        ).toBe(true);
        expect((await readFile(projectSource)).equals(bytes)).toBe(true);
        expect((await readFile(queuedSource)).equals(bytes)).toBe(true);
      } finally {
        await second.cleanup();
      }
    } finally {
      await first.cleanup();
    }
  });
});
