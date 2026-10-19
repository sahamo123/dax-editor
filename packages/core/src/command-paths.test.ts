// Command arguments that name assets or files: ids that look like object properties, symlinks out of the allowed folders,
// and AI-driven commands given no folders at all.

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { tryRunCommand } from "./commands.js";
import { Session } from "./session.js";
import { emptyProject } from "./timeline.js";

const root = mkdtempSync(join(tmpdir(), "dax-paths-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("asset ids from command arguments", () => {
  it("does not treat inherited object properties as assets", async () => {
    const session = new Session(emptyProject("t"));
    const r = await tryRunCommand({ session }, "detect_silence", { assetId: "__proto__" });
    // Before the fix "__proto__" resolved to Object.prototype and failed later with an unrelated message.
    expect(r).toMatchObject({
      ok: false,
      error: expect.stringContaining('Unknown asset "__proto__"'),
    });
  });
});

describe("file paths from command arguments", () => {
  it("refuses a symlink inside an allowed folder that points outside it", async () => {
    const allowed = join(root, "allowed");
    const outside = join(root, "outside");
    mkdirSync(allowed);
    mkdirSync(outside);
    const secret = join(outside, "secret.mp4");
    writeFileSync(secret, "not really a video");
    const link = join(allowed, "link.mp4");
    symlinkSync(secret, link);

    const session = new Session(emptyProject("t"));
    const r = await tryRunCommand(
      { session, allowedRoots: [allowed], source: "ai" },
      "import_media",
      { path: link },
    );
    // Before the fix the lexical check passed and the file was probed.
    expect(r).toMatchObject({
      ok: false,
      error: expect.stringContaining("outside the allowed folders"),
    });
  });

  it("refuses every path for an AI-driven command that was given no folders", async () => {
    const session = new Session(emptyProject("t"));
    const r = await tryRunCommand({ session, source: "ai" }, "import_media", {
      path: join(root, "anything.mp4"),
    });
    // Before the fix an unset folder list meant "anything allowed", for the AI as much as for the user.
    expect(r).toMatchObject({
      ok: false,
      error: expect.stringContaining("No folders are allowed"),
    });
  });
});
