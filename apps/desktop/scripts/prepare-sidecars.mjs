// Prepares everything the Tauri bundle ships next to the app, without committing any binary:
//   src-tauri/binaries/dax-node-<triple>   the Node.js runtime (externalBin, so Tauri signs it)
//   src-tauri/binaries/ffmpeg-<triple>     LGPL FFmpeg (externalBin)
//   src-tauri/binaries/ffprobe-<triple>    LGPL ffprobe (externalBin)
//   src-tauri/resources/server/cli.mjs     the engine server, bundled into one file (resource)
//   src-tauri/resources/assets/            files the server reads at runtime (fonts)
//   src-tauri/resources/licenses/          third-party license texts and the FFmpeg source offer
//
// Usage: node scripts/prepare-sidecars.mjs (--dev | --release) [--target <triple>] [--allow-standin]
//   --dev      symlink the host's Node (and ffmpeg if installed); fast, for `tauri dev`.
//   --release  download pinned, SHA-256-verified builds from sidecars.lock.json.
// All downloads are verified against checksums pinned in the lock file; FFmpeg is additionally
// scanned to prove it was not built with GPL or non-free options.

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findForbiddenFfmpegFlags,
  isWindowsTriple,
  looksLikeFfmpeg,
  parseHostTriple,
  sidecarFileName,
  verifySha256,
} from "./sidecars-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(here, "..");
const repoRoot = resolve(desktopDir, "..", "..");
const tauriDir = join(desktopDir, "src-tauri");
const binDir = join(tauriDir, "binaries");
const resDir = join(tauriDir, "resources");
const cacheDir = join(desktopDir, ".cache", "sidecars");
const lock = JSON.parse(readFileSync(join(desktopDir, "sidecars.lock.json"), "utf8"));
// Other platform builds may omit the Windows offline seed, but the resource directory must exist.
mkdirSync(join(resDir, "local-ai"), { recursive: true });

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const mode = flag("--release") ? "release" : flag("--dev") ? "dev" : undefined;
if (!mode) {
  console.error(
    "usage: prepare-sidecars.mjs (--dev | --release) [--target <triple>] [--allow-standin]",
  );
  process.exit(2);
}
const triple =
  option("--target") ?? parseHostTriple(execFileSync("rustc", ["-Vv"], { encoding: "utf8" }));
const windows = isWindowsTriple(triple);
console.log(`[sidecars] mode=${mode} target=${triple}`);

mkdirSync(binDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

/** Download `url` to the cache (curl honours proxy settings and is on every CI runner). */
function download(url, file) {
  const dest = join(cacheDir, file);
  if (existsSync(dest)) return dest;
  console.log(`[sidecars] downloading ${url}`);
  execFileSync(
    "curl",
    ["-fL", "--retry", "3", "--retry-delay", "2", "-sS", "-o", `${dest}.part`, url],
    {
      stdio: "inherit",
    },
  );
  copyFileSync(`${dest}.part`, dest);
  rmSync(`${dest}.part`);
  return dest;
}

/** Extract an archive with `tar` (bsdtar on Windows and macOS reads .zip too) into a fresh dir. */
function extract(archive, name) {
  // A previous extraction can be a developer's active runtime on Windows. Never remove it
  // while preparing another build; each verified archive gets its own fresh extraction.
  const out = mkdtempSync(join(cacheDir, `x-${name}-`));
  execFileSync("tar", ["-xf", archive, "-C", out], { stdio: "inherit" });
  return out;
}

function install(src, base) {
  const dest = join(binDir, sidecarFileName(base, triple));
  rmSync(dest, { force: true });
  copyFileSync(src, dest);
  if (!windows) chmodSync(dest, 0o755);
  console.log(`[sidecars] installed ${dest}`);
  return dest;
}

function linkOrCopy(src, base) {
  const dest = join(binDir, sidecarFileName(base, triple));
  rmSync(dest, { force: true });
  try {
    symlinkSync(src, dest);
  } catch {
    copyFileSync(src, dest); // Windows without symlink rights
  }
  console.log(`[sidecars] linked ${dest} -> ${src}`);
}

function which(name) {
  try {
    const finder = windows ? "where" : "which";
    return execFileSync(finder, [name], { encoding: "utf8" }).split(/\r?\n/)[0].trim() || undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------- Node.js runtime
async function prepareNode() {
  if (mode === "dev") {
    linkOrCopy(process.execPath, "dax-node");
    return;
  }
  const asset = lock.node.assets[triple];
  if (!asset) throw new Error(`no pinned Node.js build for ${triple} in sidecars.lock.json`);
  const archive = download(lock.node.baseUrl + asset.file, asset.file);
  await verifySha256(archive, asset.sha256);
  const dir = extract(archive, "node");
  install(join(dir, asset.inner), "dax-node");
  mkdirSync(join(resDir, "licenses"), { recursive: true });
  copyFileSync(
    join(dir, asset.inner.split("/")[0], lock.node.licenseInner),
    join(resDir, "licenses", "NODE-LICENSE.txt"),
  );
}

// ---------------------------------------------------------------- FFmpeg (LGPL only)
async function assertLgpl(file) {
  const bytes = readFileSync(file);
  if (!looksLikeFfmpeg(bytes)) throw new Error(`${file} does not look like an FFmpeg binary`);
  const bad = findForbiddenFfmpegFlags(bytes);
  if (bad.length > 0) {
    throw new Error(`${file} was built with ${bad.join(", ")}; only LGPL builds may be shipped`);
  }
  console.log(`[sidecars] ${file}: LGPL check passed`);
}

async function prepareFfmpeg() {
  const have = ["dax-ffmpeg", "dax-ffprobe"].map((b) => join(binDir, sidecarFileName(b, triple)));
  const licenseDest = join(resDir, "licenses", "FFMPEG-LICENSE.txt");
  mkdirSync(join(resDir, "licenses"), { recursive: true });

  if (mode === "dev") {
    // Developers use their own FFmpeg; no redistribution happens, so GPL builds are fine here.
    for (const base of ["ffmpeg", "ffprobe"]) {
      const found = which(base);
      if (!found) {
        // Tauri needs the file to exist to build, so there is no way to continue without it.
        throw new Error(
          `${base} not found on PATH: install FFmpeg, or run with --release for the pinned LGPL build`,
        );
      }
      linkOrCopy(found, `dax-${base}`);
    }
    writeFileSync(licenseDest, "Development build: FFmpeg is your system installation.\n");
    return;
  }

  const asset = lock.ffmpeg.assets[triple];
  if (asset) {
    const archive = download(lock.ffmpeg.baseUrl + asset.file, asset.file);
    await verifySha256(archive, asset.sha256);
    const dir = extract(archive, "ffmpeg");
    const ext = windows ? ".exe" : "";
    install(join(dir, asset.dir, "bin", `ffmpeg${ext}`), "dax-ffmpeg");
    install(join(dir, asset.dir, "bin", `ffprobe${ext}`), "dax-ffprobe");
    copyFileSync(join(dir, asset.dir, "LICENSE.txt"), licenseDest);
  } else if (have.every(existsSync)) {
    // macOS: produced by scripts/build-ffmpeg-lgpl.sh before this script runs.
    console.log(`[sidecars] using FFmpeg already present in ${binDir} (built from source)`);
    const built = join(binDir, "FFMPEG-LICENSE.txt");
    if (existsSync(built)) copyFileSync(built, licenseDest);
  } else {
    throw new Error(
      `no pinned FFmpeg build for ${triple}. Build one with scripts/build-ffmpeg-lgpl.sh ` +
        `(output goes to src-tauri/binaries) and re-run.`,
    );
  }
  for (const f of have) await assertLgpl(f);
  writeFileSync(
    join(resDir, "licenses", "THIRD-PARTY.txt"),
    [
      "Third-party software shipped with Dax Editor",
      "",
      `Node.js ${lock.node.version} (MIT) - https://nodejs.org - see NODE-LICENSE.txt`,
      `FFmpeg ${lock.ffmpeg.version} (${lock.ffmpeg.license}) - https://ffmpeg.org - see FFMPEG-LICENSE.txt`,
      "",
      "FFmpeg is used as separate programs (ffmpeg, ffprobe) built without GPL or non-free",
      "components. You may replace them: set DAX_FFMPEG and DAX_FFPROBE to your own builds.",
      `Corresponding source for the FFmpeg version above: ${lock.ffmpeg.sourceUrl}`,
      "Build options of the shipped binaries are printed by `ffmpeg -version`.",
      "",
    ].join("\n"),
  );
}

// ---------------------------------------------------------------- Engine server (resource)
async function prepareServer() {
  const outDir = join(resDir, "server");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const realEntry = join(repoRoot, "packages", "engine", "dist", "cli.js");
  if (existsSync(realEntry)) {
    const { build } = await import("esbuild");
    await build({
      entryPoints: [realEntry],
      outfile: join(outDir, "cli.mjs"),
      bundle: true,
      platform: "node",
      target: "node22",
      format: "esm",
      // Some CommonJS dependencies call require(); give the ESM bundle a working one.
      banner: {
        js: "import { createRequire as __daxCreateRequire } from 'node:module'; const require = __daxCreateRequire(import.meta.url);",
      },
      // Optional native accelerators of `ws`; it falls back to pure JS without them.
      external: ["bufferutil", "utf-8-validate"],
      legalComments: "linked",
      logLevel: "warning",
    });
    console.log(`[sidecars] bundled ${realEntry} -> resources/server/cli.mjs`);
  } else if (mode === "dev" || flag("--allow-standin")) {
    copyFileSync(
      join(desktopDir, "shell-placeholder", "dax-server-standin.mjs"),
      join(outDir, "cli.mjs"),
    );
    console.warn(
      "[sidecars] packages/engine/dist/cli.js not found: bundled the STAND-IN server. " +
        "Run `pnpm --filter @dax/engine... build` for the real one.",
    );
  } else {
    throw new Error(
      "packages/engine/dist/cli.js is missing. Build it first (pnpm --filter @dax/engine... build) " +
        "or pass --allow-standin for a placeholder.",
    );
  }
  // Files the engine reads relative to its own location (see packages/core bundledFonts()).
  const coreAssets = join(repoRoot, "packages", "core", "assets");
  const assetsOut = join(resDir, "assets");
  rmSync(assetsOut, { recursive: true, force: true });
  if (existsSync(coreAssets)) {
    cpSync(coreAssets, assetsOut, { recursive: true });
  } else {
    mkdirSync(assetsOut, { recursive: true });
  }
  // The bundled launcher discovers these beside server/; installed apps have no source checkout.
  for (const name of ["skills", "templates"]) {
    const source = join(repoRoot, name);
    const destination = join(resDir, name);
    rmSync(destination, { recursive: true, force: true });
    cpSync(source, destination, { recursive: true });
  }
}

await prepareNode();
await prepareFfmpeg();
await prepareServer();
console.log("[sidecars] done");
