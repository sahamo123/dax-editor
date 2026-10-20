// Initialize a writable local-model install from verified installer resources, without network access.
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractArchive,
  findInstalledRuntime,
  getModel,
  type ModelEntry,
  PINNED_RUNTIME_DIGESTS,
  PINNED_RUNTIME_TAG,
  sha256File,
} from "@dax/local-llm";

/** Catalog model included in the first Windows offline installer. */
export const OFFLINE_MODEL_ID = "qwen3.5-2b-q4km";

/** Trusted build-time specification and I/O seams for installing an offline seed. */
export interface OfflineBundleOptions {
  /** Installer resources; defaults to `../local-ai` beside the bundled engine entry. */
  bundleDir?: string;
  /** Catalog entry; defaults to the bundled small Qwen model. Tests use tiny verified bytes. */
  model?: ModelEntry;
  /** Trusted runtime release tag; defaults to the source pin. */
  runtimeTag?: string;
  /** Trusted archive digest; defaults to the Windows x64 CPU source pin. */
  runtimeSha256?: string;
  /** Archive extraction seam. Production uses the bounded, containment-checked extractor. */
  extract?: typeof extractArchive;
}

/** Check both file size and digest. A missing or corrupt cached file is not an installed model. */
async function matches(path: string, hash: string, size?: number): Promise<boolean> {
  try {
    if (size !== undefined && (await stat(path)).size !== size) return false;
    return (await sha256File(path)) === hash;
  } catch {
    return false;
  }
}

/**
 * Install the shipped model and CPU runtime under `dataDir`, with completion manifests written last.
 * Returns false when no offline seed is shipped (ordinary source/developer builds). Never downloads.
 * Refuses mismatched source bytes before writing an install marker; preserves unrelated app data.
 */
export async function seedOfflineBundle(
  dataDir: string,
  options: OfflineBundleOptions = {},
): Promise<boolean> {
  const bundleDir = options.bundleDir ?? fileURLToPath(new URL("../local-ai/", import.meta.url));
  const sourceModel = join(bundleDir, "model.gguf");
  try {
    await stat(sourceModel);
  } catch {
    return false;
  }
  const model = options.model ?? getModel(OFFLINE_MODEL_ID);
  const modelDir = join(dataDir, "models", model.id);
  const destination = join(modelDir, model.source.file);
  const seedMarker = join(dataDir, "offline-seed.json");
  const previous: unknown = await readFile(seedMarker, "utf8")
    .then(JSON.parse)
    .catch(() => undefined);
  if (
    typeof previous === "object" &&
    previous !== null &&
    "sha256" in previous &&
    previous.sha256 === model.sha256
  ) {
    // Respect a user who uninstalled the bundled model; do not reinstall on every restart.
    try {
      await stat(destination);
    } catch {
      return false;
    }
  }
  const tag = options.runtimeTag ?? PINNED_RUNTIME_TAG;
  const assetName = `llama-${tag}-bin-win-cpu-x64.zip`;
  const runtimeHash = options.runtimeSha256 ?? PINNED_RUNTIME_DIGESTS[assetName];
  const archive = join(bundleDir, "runtime.zip");
  if (!runtimeHash || !(await matches(archive, runtimeHash)))
    throw new Error("Bundled AI runtime checksum mismatch");
  if (!(await matches(sourceModel, model.sha256, model.sizeBytes)))
    throw new Error("Bundled AI model checksum mismatch");

  const runtime = await findInstalledRuntime({ dataDir, tag, target: { backend: "cpu" } });
  if (!runtime?.verified) {
    const runtimeDir = join(dataDir, "runtime", `${tag}-${process.platform}-${process.arch}-cpu`);
    await (options.extract ?? extractArchive)(archive, runtimeDir);
    await writeFile(
      join(runtimeDir, "runtime.json"),
      JSON.stringify({ tag, assetName, verified: true }),
    );
  }
  const installedRuntime = await findInstalledRuntime({ dataDir, tag, target: { backend: "cpu" } });
  if (!installedRuntime) throw new Error("Bundled AI runtime contains no usable server binary");
  const crt: unknown = await readFile(join(bundleDir, "crt/manifest.json"), "utf8")
    .then(JSON.parse)
    .catch(() => undefined);
  if (crt && typeof crt === "object" && !Array.isArray(crt)) {
    for (const [name, hash] of Object.entries(crt)) {
      if (
        !/^[a-zA-Z0-9_.-]+\.dll$/.test(name) ||
        typeof hash !== "string" ||
        !/^[a-f0-9]{64}$/.test(hash)
      )
        throw new Error("Invalid bundled C++ runtime manifest");
      const source = join(bundleDir, "crt", name);
      if (!(await matches(source, hash))) throw new Error("Bundled C++ runtime checksum mismatch");
      await copyFile(source, join(installedRuntime.dir, name));
    }
  }
  if (!(await matches(destination, model.sha256, model.sizeBytes))) {
    await mkdir(dirname(destination), { recursive: true });
    const temporary = `${destination}.seeding`;
    await copyFile(sourceModel, temporary);
    if (!(await matches(temporary, model.sha256, model.sizeBytes)))
      throw new Error("Copied AI model checksum mismatch");
    await rename(temporary, destination);
  }
  await writeFile(
    join(modelDir, "manifest.json"),
    JSON.stringify({
      id: model.id,
      file: model.source.file,
      sizeBytes: model.sizeBytes,
      sha256: model.sha256,
      installedAt: new Date().toISOString(),
    }),
  );
  // Keep provenance/licences with the writable install too; optional for tiny test fixtures.
  for (const name of ["LICENSE-model.txt", "LICENSE-runtime.txt", "provenance.json"]) {
    const content = await readFile(join(bundleDir, name)).catch(() => undefined);
    if (content) await writeFile(join(modelDir, name), content);
  }
  await writeFile(seedMarker, JSON.stringify({ modelId: model.id, sha256: model.sha256 }));
  return true;
}
