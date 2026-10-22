// Seed pinned offline speech resources without network access, respecting later user removal.
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureBinary, RUNTIME_ASSETS, SpeechModelManager, sha256File } from "@dax/stt";

/** Install shipped speech bytes after hash/size checks. Missing seed returns false; corrupt seed throws. */
export async function seedOfflineSpeech(
  dataDir: string,
  bundleDir = fileURLToPath(new URL("../local-ai/", import.meta.url)),
): Promise<boolean> {
  const source = join(bundleDir, "speech-model.bin");
  try {
    await stat(source);
  } catch {
    return false;
  }
  const manager = new SpeechModelManager({ dataDir });
  const model = manager.info("base.en-q5_1");
  const marker = join(dataDir, "offline-speech-seed.json");
  const previous: unknown = await readFile(marker, "utf8")
    .then(JSON.parse)
    .catch(() => undefined);
  if (
    typeof previous === "object" &&
    previous !== null &&
    "sha256" in previous &&
    previous.sha256 === model.sha256 &&
    !(await manager.isInstalled(model.id))
  )
    return false;
  if ((await stat(source)).size !== model.bytes || (await sha256File(source)) !== model.sha256)
    throw new Error("Bundled speech model checksum mismatch");
  const runtime = RUNTIME_ASSETS.find(
    (asset) => asset.platform === process.platform && asset.arch === process.arch,
  );
  if (!runtime) return false;
  const archive = join(bundleDir, "speech-runtime.zip");
  if (
    (await stat(archive)).size !== runtime.bytes ||
    (await sha256File(archive)) !== runtime.sha256
  )
    throw new Error("Bundled speech runtime checksum mismatch");
  await ensureBinary({
    dataDir,
    autoInstall: true,
    fetchImpl: async (url) => {
      if (String(url) !== runtime.url)
        throw new Error("Offline speech attempted an unexpected download");
      return new Response(new Uint8Array(await readFile(archive)), {
        headers: { "Content-Length": String(runtime.bytes) },
      });
    },
  });
  if (!(await manager.verify(model.id))) {
    const destination = manager.pathOf(model.id);
    await mkdir(join(dataDir, "speech", "models"), { recursive: true });
    await copyFile(source, `${destination}.seeding`);
    if ((await sha256File(`${destination}.seeding`)) !== model.sha256)
      throw new Error("Copied speech model checksum mismatch");
    await rename(`${destination}.seeding`, destination);
  }
  await writeFile(marker, JSON.stringify({ modelId: model.id, sha256: model.sha256 }));
  return true;
}
