// Synthetic save-as publication races must never overwrite the competing destination.
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyProject } from "@dax/core";
import { expect, it } from "vitest";
import { EngineSession } from "./project-manager.js";

it("reports a partial publication and preserves a destination created during save-as", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dax-save-race-"));
  const original = join(dir, "original.dax.json");
  const target = join(dir, "target.dax.json");
  class RacingSession extends EngineSession {
    private publications = 0;

    protected override async publishSaveFile(staged: string, destination: string): Promise<void> {
      this.publications++;
      if (this.publications === 2) await writeFile(destination, "another process", { flag: "wx" });
      await super.publishSaveFile(staged, destination);
    }
  }
  try {
    const session = new RacingSession(emptyProject("Synthetic"), original, false);
    await session.save();
    await expect(session.saveAs(target)).rejects.toThrow("project copy was created");
    expect(session.savePath).toBe(original);
    expect(session.userSaved).toBe(false);
    expect(JSON.parse(await readFile(target, "utf8")).name).toBe("Synthetic");
    expect(await readFile(`${target}.history.json`, "utf8")).toBe("another process");
    expect(existsSync(`${target}.history.json`)).toBe(true);
    expect((await readdir(dir)).filter((name) => name.endsWith(".stage"))).toEqual([]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
