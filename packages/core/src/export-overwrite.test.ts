// Export overwrite safety: the assistant may never replace an existing file, while a manual export still may.
// The checks run before any rendering, so these tests need no FFmpeg.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tryRunCommand } from "./commands.js";
import { Session } from "./session.js";
import { emptyProject } from "./timeline.js";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "dax-overwrite-"));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("export_video overwrite", () => {
  it("refuses an AI overwrite of an existing file and leaves the file alone", async () => {
    const out = join(dir, "family.mp4");
    writeFileSync(out, "precious");
    const session = new Session(emptyProject());
    const r = await tryRunCommand({ session, source: "ai", allowedRoots: [dir] }, "export_video", {
      path: out,
      overwrite: true,
    });
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error).toMatch(/cannot overwrite/);
    expect(readFileSync(out, "utf8")).toBe("precious");
  });

  it("still refuses a plain export over an existing file, for the assistant and for manual runs", async () => {
    const out = join(dir, "plain.mp4");
    writeFileSync(out, "keep");
    const session = new Session(emptyProject());
    for (const source of ["ai", "manual"] as const) {
      const r = await tryRunCommand({ session, source, allowedRoots: [dir] }, "export_video", {
        path: out,
      });
      expect(r.ok).toBe(false);
      expect(r.ok ? "" : r.error).toMatch(/already exists/);
    }
  });
});
