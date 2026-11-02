// Exercise Blender process cancellation and cleanup without an installed renderer.
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { MotionRequestSchema } from "@dax/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBlenderRenderer } from "./blender.js";

vi.mock("node:child_process", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:child_process")>();
  const { promisify } = await import("node:util");
  const execFile = Object.assign(vi.fn(), {
    [promisify.custom]: async () => ({ stdout: "Blender 4.5.0", stderr: "" }),
  });
  return { ...original, execFile, spawn: vi.fn() };
});

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  kill = vi.fn(() => true);
}

const roots: string[] = [];
const request = MotionRequestSchema.parse({ template: "title-card", text: "test" });

async function renderer() {
  const root = await mkdtemp(join(tmpdir(), "dax-blender-cancel-"));
  roots.push(root);
  return { root, motion: createBlenderRenderer(root) };
}

afterEach(async () => {
  vi.mocked(spawn).mockReset();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("Blender cancellation", () => {
  it("does not start a process for a pre-aborted request and removes its workspace", async () => {
    const { root, motion } = await renderer();
    const controller = new AbortController();
    controller.abort();
    await expect(motion.render(request, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(spawn).not.toHaveBeenCalled();
    expect(await readdir(join(root, "renders"))).toEqual([]);
  });

  it("waits for the child to close before reporting cancellation and removing its workspace", async () => {
    const { root, motion } = await renderer();
    const controller = new AbortController();
    const child = new FakeChild();
    vi.mocked(spawn).mockReturnValueOnce(child as unknown as ReturnType<typeof spawn>);
    let settled = false;
    const result = motion.render(request, { signal: controller.signal }).finally(() => {
      settled = true;
    });
    const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce());
    controller.abort();
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    child.emit("close", null, "SIGKILL");
    await rejected;
    expect(await readdir(join(root, "renders"))).toEqual([]);
  });

  it("keeps an already-exited process failure as an error when cancellation races it", async () => {
    const { root, motion } = await renderer();
    const controller = new AbortController();
    const child = new FakeChild();
    vi.mocked(spawn).mockReturnValueOnce(child as unknown as ReturnType<typeof spawn>);
    const result = motion.render(request, { signal: controller.signal });
    const rejected = expect(result).rejects.toMatchObject({
      name: "Error",
      message: expect.stringContaining("Blender render failed"),
    });
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce());
    child.exitCode = 1;
    controller.abort();
    expect(child.kill).not.toHaveBeenCalled();
    child.emit("close", 1, null);
    await rejected;
    expect(await readdir(join(root, "renders"))).toEqual([]);
  });
});
