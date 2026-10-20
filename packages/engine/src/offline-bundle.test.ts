// Offline installer initialization verifies bytes, commits completion markers last, and never fetches.
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModel, serverBinaryName } from "@dax/local-llm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type OfflineBundleOptions, seedOfflineBundle } from "./offline-bundle.js";

const folders: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const path of folders.splice(0)) rmSync(path, { recursive: true, force: true });
});
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "dax-offline-"));
  folders.push(root);
  const dataDir = join(root, "data");
  const model = {
    ...getModel("qwen3.5-2b-q4km"),
    sizeBytes: 5,
    sha256: hash("model"),
    source: { ...getModel("qwen3.5-2b-q4km").source, file: "tiny.gguf" },
  };
  writeFileSync(join(root, "model.gguf"), "model");
  writeFileSync(join(root, "runtime.zip"), "archive");
  const extract = vi.fn(async (_archive: string, destination: string) => {
    await mkdir(destination, { recursive: true });
    await writeFile(join(destination, serverBinaryName()), "test binary, never executed");
  });
  const options: OfflineBundleOptions = {
    bundleDir: root,
    model,
    runtimeTag: "test",
    runtimeSha256: hash("archive"),
    extract,
  };
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    throw new Error("Unexpected network access");
  });
  return { root, dataDir, model, options, extract };
}

describe("offline installer seed", () => {
  it("respects removal of the bundled model after its initial install", async () => {
    const f = fixture();
    await seedOfflineBundle(f.dataDir, f.options);
    rmSync(join(f.dataDir, "models", f.model.id), { recursive: true });
    expect(await seedOfflineBundle(f.dataDir, f.options)).toBe(false);
    expect(existsSync(join(f.dataDir, "models", f.model.id))).toBe(false);
  });
  it("verifies app-local C++ runtime files before copying them", async () => {
    const f = fixture();
    await mkdir(join(f.root, "crt"));
    writeFileSync(join(f.root, "crt/vcruntime140.dll"), "runtime");
    writeFileSync(
      join(f.root, "crt/manifest.json"),
      JSON.stringify({ "vcruntime140.dll": hash("wrong") }),
    );
    await expect(seedOfflineBundle(f.dataDir, f.options)).rejects.toThrow(
      "C++ runtime checksum mismatch",
    );
    expect(existsSync(join(f.dataDir, "models"))).toBe(false);
  });
  it("leaves a source checkout unchanged when no model is shipped", async () => {
    const f = fixture();
    expect(
      await seedOfflineBundle(f.dataDir, { ...f.options, bundleDir: join(f.root, "absent") }),
    ).toBe(false);
    expect(existsSync(f.dataDir)).toBe(false);
    expect(f.extract).not.toHaveBeenCalled();
  });
  it("installs verified bytes without network access, reuses them, and preserves unrelated data", async () => {
    const f = fixture();
    await mkdir(f.dataDir);
    writeFileSync(join(f.dataDir, "settings.json"), "keep me");
    expect(await seedOfflineBundle(f.dataDir, f.options)).toBe(true);
    const modelDir = join(f.dataDir, "models", f.model.id);
    expect(readFileSync(join(modelDir, "tiny.gguf"), "utf8")).toBe("model");
    expect(JSON.parse(readFileSync(join(modelDir, "manifest.json"), "utf8"))).toMatchObject({
      id: f.model.id,
      sha256: f.model.sha256,
      sizeBytes: 5,
    });
    expect(await seedOfflineBundle(f.dataDir, f.options)).toBe(true);
    expect(f.extract).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(f.dataDir, "settings.json"), "utf8")).toBe("keep me");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects a modified runtime before extraction or model installation", async () => {
    const f = fixture();
    writeFileSync(join(f.root, "runtime.zip"), "tampered");
    await expect(seedOfflineBundle(f.dataDir, f.options)).rejects.toThrow(
      "runtime checksum mismatch",
    );
    expect(f.extract).not.toHaveBeenCalled();
    expect(existsSync(join(f.dataDir, "models"))).toBe(false);
  });
  it("rejects a modified model before writing completion markers", async () => {
    const f = fixture();
    writeFileSync(join(f.root, "model.gguf"), "wrong");
    await expect(seedOfflineBundle(f.dataDir, f.options)).rejects.toThrow(
      "model checksum mismatch",
    );
    expect(f.extract).not.toHaveBeenCalled();
    expect(existsSync(f.dataDir)).toBe(false);
  });
});
