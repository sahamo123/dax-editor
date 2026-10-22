// Build-time only: download and verify the model/runtime seed for a completely offline Windows installer.
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findRedist } from "./find-redist.mjs";

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(desktop, "..", "..");
const {
  getModel,
  downloadFile,
  resolveRuntimeAsset,
  PINNED_RUNTIME_TAG,
  PINNED_RUNTIME_DIGESTS,
  sha256File,
} = await import(pathToFileURL(join(root, "packages/local-llm/dist/index.js")).href);
const model = getModel("qwen3.5-2b-q4km");
const destination = join(desktop, "src-tauri/resources/local-ai");
await mkdir(destination, { recursive: true });
const runtime = await resolveRuntimeAsset({
  tag: PINNED_RUNTIME_TAG,
  target: { platform: "win32", arch: "x64", backend: "cpu" },
});
if (!runtime.sha256 || runtime.sha256 !== PINNED_RUNTIME_DIGESTS[runtime.assetName]) {
  throw new Error("Runtime release digest does not match the verified source pin");
}
let lastPercent = -1;
const progress = (label) => (p) => {
  const percent = Math.floor((100 * p.receivedBytes) / (p.totalBytes || 1));
  if (percent >= lastPercent + 5 || p.phase === "verifying") {
    console.log(`${label}: ${p.phase} ${percent}%`);
    lastPercent = percent;
  }
};
await downloadFile(runtime.url, join(destination, "runtime.zip"), {
  sha256: runtime.sha256,
  expectedSize: runtime.sizeBytes,
  onProgress: progress("runtime"),
});
lastPercent = -1;
await downloadFile(model.url, join(destination, "model.gguf"), {
  sha256: model.sha256,
  expectedSize: model.sizeBytes,
  onProgress: progress("model"),
});
for (const [name, url] of [
  ["LICENSE-model.txt", "https://huggingface.co/Qwen/Qwen3.5-2B/resolve/main/LICENSE"],
  [
    "LICENSE-runtime.txt",
    `https://raw.githubusercontent.com/ggml-org/llama.cpp/${PINNED_RUNTIME_TAG}/LICENSE`,
  ],
]) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not retrieve required licence: ${response.status}`);
  await writeFile(join(destination, name), await response.text());
}
await writeFile(
  join(destination, "provenance.json"),
  JSON.stringify(
    {
      model: {
        id: model.id,
        ...model.source,
        sha256: model.sha256,
        sizeBytes: model.sizeBytes,
        license: model.license.spdx,
      },
      runtime: {
        tag: runtime.tag,
        asset: runtime.assetName,
        sha256: runtime.sha256,
        url: runtime.url,
        license: "MIT",
      },
    },
    null,
    2,
  ),
);
console.log("Offline AI seed verified and prepared.");
// App-local release DLLs from the licensed VS redistributable folder avoid a separate runtime install.
let redist;
if (process.env.DAX_VC_REDIST_DIR) redist = await findRedist([process.env.DAX_VC_REDIST_DIR]);
else {
  redist = await findRedist([join(root, ".local-tools/vs-buildtools/VC/Redist/MSVC")]);
  if (!redist && process.platform === "win32") {
    const vswhere = join(
      process.env["ProgramFiles(x86)"] ?? "C:/Program Files (x86)",
      "Microsoft Visual Studio/Installer/vswhere.exe",
    );
    const installation = execFileSync(
      vswhere,
      [
        "-latest",
        "-products",
        "*",
        "-requires",
        "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
        "-property",
        "installationPath",
        "-utf8",
      ],
      { encoding: "utf8", windowsHide: true },
    ).trim();
    if (installation) redist = await findRedist([join(installation, "VC/Redist/MSVC")]);
  }
}
if (!redist)
  throw new Error(
    "Release C++ redistributables were not found. Install Visual Studio C++ tools or set DAX_VC_REDIST_DIR to its x64 release redist folder.",
  );
const crtRoot = redist.directory;
const crtOut = join(destination, "crt");
await mkdir(crtOut, { recursive: true });
const crtHashes = {};
for (const component of redist.components) {
  const source = join(crtRoot, component);
  for (const name of await readdir(source)) {
    if (!name.toLowerCase().endsWith(".dll")) continue;
    await copyFile(join(source, name), join(crtOut, name));
    crtHashes[name] = await sha256File(join(crtOut, name));
  }
}
await writeFile(join(crtOut, "manifest.json"), JSON.stringify(crtHashes, null, 2));
await writeFile(
  join(crtOut, "REDISTRIBUTION.txt"),
  `Microsoft Visual C++ x64 release runtime DLLs from ${redist.components.join(" and ")} redistributable folders.\nhttps://learn.microsoft.com/cpp/windows/redistributing-visual-cpp-files\nMicrosoft Software License Terms apply.\n`,
);
console.log("App-local Microsoft C++ runtime prepared.");
