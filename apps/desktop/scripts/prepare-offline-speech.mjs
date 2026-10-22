// Build-time verified speech seed for the offline Windows installer; never used by tests.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(desktop, "../..");
const { downloadFile, modelUrl, RUNTIME_ASSETS, SpeechModelManager, MODEL_LICENSE } = await import(
  pathToFileURL(join(root, "packages/stt/dist/index.js")).href
);
const runtime = RUNTIME_ASSETS.find((asset) => asset.platform === "win32" && asset.arch === "x64");
if (!runtime) throw new Error("Pinned Windows speech runtime is missing");
const model = new SpeechModelManager().info("base.en-q5_1");
const output = join(desktop, "src-tauri/resources/local-ai");
await mkdir(output, { recursive: true });
await downloadFile(runtime.url, join(output, "speech-runtime.zip"), {
  sha256: runtime.sha256,
  expectedBytes: runtime.bytes,
});
await downloadFile(modelUrl(model), join(output, "speech-model.bin"), {
  sha256: model.sha256,
  expectedBytes: model.bytes,
});
for (const [name, url] of [
  [
    "LICENSE-speech-runtime.txt",
    `https://raw.githubusercontent.com/ggml-org/whisper.cpp/${runtime.version}/LICENSE`,
  ],
  ["LICENSE-speech-model.txt", "https://raw.githubusercontent.com/openai/whisper/main/LICENSE"],
]) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Required speech licence failed: ${response.status}`);
  await writeFile(join(output, name), await response.text());
}
await writeFile(
  join(output, "speech-provenance.json"),
  JSON.stringify(
    { model: { ...model, url: modelUrl(model), license: MODEL_LICENSE }, runtime },
    null,
    2,
  ),
);
console.log(
  `Offline speech seed verified: ${model.id}, ${model.bytes} bytes; runtime ${runtime.version}.`,
);
