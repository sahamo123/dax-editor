// Synthetic redistributable layouts; no system SDK, network or binary execution is required.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { findRedist, redistComponents } from "./find-redist.mjs";

test("finds newer complete VC release layouts and ignores debug or incomplete folders", async () => {
  const root = await mkdtemp(join(tmpdir(), "dax-redist-"));
  try {
    for (const path of [
      "14.9/x64/Microsoft.VC143.CRT",
      "14.9/x64/Microsoft.VC143.OpenMP",
      "14.50/x64/Microsoft.VC145.CRT",
      "14.50/x64/Microsoft.VC145.OpenMP",
      "99/x64/Microsoft.VC145.DebugCRT",
    ])
      await mkdir(join(root, path), { recursive: true });
    const found = await findRedist([join(root, "missing"), root]);
    assert.equal(found?.directory, join(root, "14.50", "x64"));
    assert.deepEqual(found?.components, ["Microsoft.VC145.CRT", "Microsoft.VC145.OpenMP"]);
    assert.equal(await redistComponents(join(root, "99", "x64")), undefined);
    assert.equal(
      (await findRedist([join(root, "14.9", "x64")]))?.directory,
      join(root, "14.9", "x64"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
