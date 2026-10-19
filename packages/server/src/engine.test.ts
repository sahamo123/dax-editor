// Engine-level ordering tests that need no HTTP: a manual edit must never run inside an AI run.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Engine } from "./engine.js";
import { createLogger } from "./logger.js";
import { NullLocalModelController, NullProviderRegistry, ScriptedRunner } from "./stubs.js";

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

/** A started engine on a fresh data folder, with an AI runner that answers at once. */
async function makeEngine(): Promise<Engine> {
  const dir = await mkdtemp(join(tmpdir(), "dax-engine-"));
  dirs.push(dir);
  const engine = new Engine({
    dataDir: dir,
    allowedRoots: [dir],
    runner: new ScriptedRunner(),
    providers: new NullProviderRegistry(),
    localModel: new NullLocalModelController(),
    log: createLogger(() => undefined),
    emit: () => undefined,
    hasListeners: () => false,
  });
  await engine.init();
  return engine;
}

describe("Engine ordering of manual edits and AI runs", () => {
  it("refuses a manual edit that was requested before an AI run started but ran after it", async () => {
    const engine = await makeEngine();
    const widthBefore = engine.projects.session.project.timeline.width;

    // The edit is accepted first; the AI run starts before the edit gets its turn in the queue.
    const edit = engine.runCommand("set_format", { preset: "square-1080" });
    engine.startChat("make it square");
    const r = await edit;

    // Before the fix the edit checked for a run only when it was requested, so it applied during the run.
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ error: expect.stringContaining("AI edit is in progress") });
    expect(engine.projects.session.project.timeline.width).toBe(widthBefore);
    await engine.shutdown();
  });

  it("lets an edit that was queued before the run finish before the run starts", async () => {
    const engine = await makeEngine();
    const first = engine.runCommand("set_format", { preset: "square-1080" });
    const done = await first;
    expect(done.ok).toBe(true);
    engine.startChat("hello");
    await new Promise((r) => setTimeout(r, 50));
    expect(engine.busy).toBe(false);
    await engine.shutdown();
  });
});
