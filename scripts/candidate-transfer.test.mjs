// Transport must preserve every byte, expose hashes and bound the total count before writing parts.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { splitCandidate } from "./candidate-transfer.mjs";

test("transport parts preserve bytes and each receipt hash, including a short final part", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dax-transfer-"));
  try {
    const bytes = Buffer.from("installer transport bytes");
    const source = join(directory, "candidate.exe"),
      output = join(directory, "parts");
    await writeFile(source, bytes);
    const receipt = await splitCandidate(source, output, 7);
    const parts = [];
    for (const part of receipt.parts) {
      const content = await readFile(join(output, `part-${part.index}`, "installer.bin"));
      assert.equal(content.length, part.bytes);
      assert.equal(createHash("sha256").update(content).digest("hex"), part.sha256);
      parts.push(content);
    }
    assert.deepEqual(Buffer.concat(parts), bytes);
    assert.equal(receipt.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.ok(receipt.parts.at(-1).bytes < 7);
    await assert.rejects(splitCandidate(source, join(directory, "too-many"), 0));
    await assert.rejects(splitCandidate(source, join(directory, "too-many"), 0.5));
    await writeFile(source, Buffer.alloc(33));
    await assert.rejects(splitCandidate(source, join(directory, "too-many"), 1), /32-part/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
