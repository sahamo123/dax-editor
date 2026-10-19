// Finds or installs the whisper-cli executable: explicit path, env var, app data folder, PATH, and
// finally the official whisper.cpp release asset for this OS and CPU (downloaded, hashed, extracted).

import { chmod, mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { type DownloadProgress, downloadFile } from "./download.js";
import { SttError } from "./errors.js";
import { defaultDataDir, findOnPath, isExecutable, runtimeDir } from "./paths.js";
import { runProcess } from "./process.js";

/** whisper.cpp release the bundled asset table points at. Releases after it publish no binaries (checked 2026-10-18). */
export const WHISPER_RUNTIME_VERSION = "v1.9.2";

/** One prebuilt whisper-cli package published on a whisper.cpp GitHub release. */
export interface RuntimeAsset {
  /** Release tag, e.g. `v1.9.2`. */
  version: string;
  /** Node `process.platform` value this asset runs on. */
  platform: NodeJS.Platform;
  /** Node `process.arch` value this asset runs on. */
  arch: string;
  /** Download URL. */
  url: string;
  /** SHA-256 of the archive, hex. whisper.cpp publishes none, so these were computed by downloading the asset. */
  sha256: string;
  /** Archive size in bytes. */
  bytes: number;
  /** Archive format; both are unpacked with the system `tar` (bsdtar on Windows reads zip). */
  archive: "tar.gz" | "zip";
  /** Path of the executable inside the archive. */
  binaryPath: string;
}

const RELEASE = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_RUNTIME_VERSION}`;

/**
 * Official release assets we know work. Linux packages are built on Ubuntu 22.04 (glibc 2.35 or
 * newer, needs libgomp1 and libstdc++), with every CPU variant (SSE4.2 to AVX-512) included and chosen
 * at run time. Windows packages need the Microsoft Visual C++ 2015-2022 runtime. There is no macOS
 * command-line asset in whisper.cpp releases (only an iOS/macOS xcframework library) and no Windows
 * arm64 asset at this tag; see `ensureBinary` for the fallbacks.
 */
export const RUNTIME_ASSETS: readonly RuntimeAsset[] = [
  {
    version: WHISPER_RUNTIME_VERSION,
    platform: "linux",
    arch: "x64",
    url: `${RELEASE}/whisper-bin-ubuntu-x64.tar.gz`,
    sha256: "46811a3ecf584307480a220b9ef5ff81b7b22dc41577cbc274ce3afc61f753b1",
    bytes: 9497583,
    archive: "tar.gz",
    binaryPath: "whisper-bin-ubuntu-x64/whisper-cli",
  },
  {
    version: WHISPER_RUNTIME_VERSION,
    platform: "linux",
    arch: "arm64",
    url: `${RELEASE}/whisper-bin-ubuntu-arm64.tar.gz`,
    sha256: "7e26fa6a36d9174d5c0bf033ccbc026c3b5e569e2ee787058241346ef5392719",
    bytes: 4572842,
    archive: "tar.gz",
    binaryPath: "whisper-bin-ubuntu-arm64/whisper-cli",
  },
  {
    version: WHISPER_RUNTIME_VERSION,
    platform: "win32",
    arch: "x64",
    url: `${RELEASE}/whisper-bin-x64.zip`,
    sha256: "49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a",
    bytes: 8194445,
    archive: "zip",
    binaryPath: "Release/whisper-cli.exe",
  },
  {
    version: WHISPER_RUNTIME_VERSION,
    platform: "win32",
    arch: "ia32",
    url: `${RELEASE}/whisper-bin-Win32.zip`,
    sha256: "de170719aebcb4794d695d449e179002db1fe03b862f21f5c34b2909a7cf8f22",
    bytes: 5189502,
    archive: "zip",
    binaryPath: "Release/whisper-cli.exe",
  },
];

/** Where a usable whisper-cli was found; see {@link findWhisperBinary}. */
export type BinarySource = "option" | "env" | "installed" | "path" | "homebrew";

/** A located whisper-cli executable. */
export interface FoundBinary {
  /** Absolute path of the executable. */
  path: string;
  /** How it was found. */
  source: BinarySource;
}

/** Options for {@link findWhisperBinary} and {@link ensureBinary}. */
export interface BinaryOptions {
  /** Explicit path to whisper-cli; wins over everything. */
  binaryPath?: string;
  /** App data folder; default {@link defaultDataDir}. */
  dataDir?: string;
  /** Extra release assets, tried before {@link RUNTIME_ASSETS} (for a mirror or a macOS build published by dax-editor). */
  assets?: RuntimeAsset[];
  /** Override platform detection (tests). */
  platform?: NodeJS.Platform;
  /** Override architecture detection (tests). */
  arch?: string;
  /** Environment to read `DAX_WHISPER_CLI` and `PATH` from; default `process.env`. */
  env?: NodeJS.ProcessEnv;
}

/** Extra options for {@link ensureBinary}. */
export interface EnsureBinaryOptions extends BinaryOptions {
  /** Set false to only look, never download. Default true. */
  autoInstall?: boolean;
  /** Download progress. */
  onProgress?: (p: DownloadProgress) => void;
  /** Abort the download (it can be resumed by calling again). */
  signal?: AbortSignal;
  /** Replacement for the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** Folder an asset unpacks into: `<dataDir>/speech/bin/<version>-<platform>-<arch>`. */
export function runtimeInstallDir(
  dataDir: string,
  a: Pick<RuntimeAsset, "version" | "platform" | "arch">,
): string {
  return join(runtimeDir(dataDir), `${a.version}-${a.platform}-${a.arch}`);
}

/**
 * Look for an existing whisper-cli without downloading anything. Order: `binaryPath` option,
 * `DAX_WHISPER_CLI`, a runtime previously installed under the app data folder, `whisper-cli` on
 * `PATH`, then (macOS) the Homebrew locations. A path given explicitly or through the environment
 * that does not exist is an error rather than being skipped, so typos are noticed.
 * Returns `undefined` when nothing is found.
 */
export async function findWhisperBinary(
  opts: BinaryOptions = {},
): Promise<FoundBinary | undefined> {
  const env = opts.env ?? process.env;
  const explicit = opts.binaryPath ?? env.DAX_WHISPER_CLI;
  if (explicit) {
    if (!(await isExecutable(explicit))) {
      throw new SttError(
        "binary-missing",
        `whisper-cli was expected at ${explicit} (${opts.binaryPath ? "binaryPath option" : "DAX_WHISPER_CLI"}) but is not there or not executable.`,
      );
    }
    return { path: explicit, source: opts.binaryPath ? "option" : "env" };
  }
  const platform = opts.platform ?? process.platform;
  const arch = opts.arch ?? process.arch;
  const dataDir = opts.dataDir ?? defaultDataDir(env);
  for (const asset of candidateAssets(opts, platform, arch)) {
    const p = join(runtimeInstallDir(dataDir, asset), asset.binaryPath);
    if (await isExecutable(p)) return { path: p, source: "installed" };
  }
  const exe = platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
  const onPath = await findOnPath(exe, env);
  if (onPath) return { path: onPath, source: "path" };
  if (platform === "darwin") {
    for (const p of ["/opt/homebrew/bin/whisper-cli", "/usr/local/bin/whisper-cli"]) {
      if (await isExecutable(p)) return { path: p, source: "homebrew" };
    }
  }
  return undefined;
}

function candidateAssets(
  opts: BinaryOptions,
  platform: NodeJS.Platform,
  arch: string,
): RuntimeAsset[] {
  return [...(opts.assets ?? []), ...RUNTIME_ASSETS].filter(
    (a) => a.platform === platform && a.arch === arch,
  );
}

const inFlight = new Map<string, Promise<FoundBinary>>();

/**
 * Return a working whisper-cli, installing the official prebuilt one when none is found.
 *
 * Install route (Linux x64/arm64, Windows x64/x86): download the release archive, check its SHA-256,
 * list it and refuse any entry that is absolute or contains `..`, unpack with the system `tar` into a
 * temporary folder, run `whisper-cli --help` as a smoke test (catches missing system libraries), then
 * rename the folder into place, so a half-installed runtime never exists under its final name.
 *
 * Where no asset exists (macOS, Windows arm64, other Linux CPUs) this throws `unsupported-platform`
 * with the exact fallbacks: set `DAX_WHISPER_CLI`, install whisper-cli on `PATH` (Homebrew), or pass
 * `assets` pointing at a build that dax-editor publishes itself. Concurrent calls share one install.
 */
export async function ensureBinary(opts: EnsureBinaryOptions = {}): Promise<FoundBinary> {
  const found = await findWhisperBinary(opts);
  if (found) return found;

  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  const arch = opts.arch ?? process.arch;
  const dataDir = opts.dataDir ?? defaultDataDir(env);
  const asset = candidateAssets(opts, platform, arch)[0];
  if (!asset) {
    throw new SttError(
      "unsupported-platform",
      `No prebuilt whisper-cli is published for ${platform}/${arch}. ${platformAdvice(platform)}`,
    );
  }
  if (opts.autoInstall === false) {
    throw new SttError(
      "binary-missing",
      `whisper-cli is not installed and automatic install is off. Call ensureBinary() with autoInstall enabled, or set DAX_WHISPER_CLI.`,
    );
  }
  const key = `${dataDir}|${asset.version}|${platform}|${arch}`;
  let job = inFlight.get(key);
  if (!job) {
    job = installAsset(asset, dataDir, opts).finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  return job;
}

function platformAdvice(platform: NodeJS.Platform): string {
  if (platform === "darwin") {
    return "whisper.cpp does not publish a macOS command-line build. Install whisper-cli (for example with Homebrew) so it is on PATH, set DAX_WHISPER_CLI to its path, or ship a build of whisper-cli with the app and pass it as binaryPath.";
  }
  return "Install whisper-cli yourself (build whisper.cpp with cmake), put it on PATH or set DAX_WHISPER_CLI to its path.";
}

async function installAsset(
  asset: RuntimeAsset,
  dataDir: string,
  opts: EnsureBinaryOptions,
): Promise<FoundBinary> {
  const finalDir = runtimeInstallDir(dataDir, asset);
  const parent = runtimeDir(dataDir);
  await mkdir(parent, { recursive: true });
  const archivePath = join(
    parent,
    `${asset.version}-${asset.platform}-${asset.arch}.${asset.archive}`,
  );
  await downloadFile(asset.url, archivePath, {
    sha256: asset.sha256,
    expectedBytes: asset.bytes,
    onProgress: opts.onProgress,
    signal: opts.signal,
    fetchImpl: opts.fetchImpl,
  });
  const staging = await mkdtemp(join(parent, ".install-"));
  try {
    await assertSafeArchive(archivePath, opts.signal);
    const res = await runProcess("tar", ["-xf", archivePath, "-C", staging], {
      signal: opts.signal,
    });
    if (res.code !== 0) {
      throw new SttError(
        "bad-archive",
        `Could not unpack ${archivePath} with tar:\n${res.stderrTail}`,
      );
    }
    const bin = join(staging, asset.binaryPath);
    if (!(await exists(bin))) {
      throw new SttError(
        "bad-archive",
        `${asset.archive} did not contain ${asset.binaryPath}; the release layout may have changed.`,
      );
    }
    if (process.platform !== "win32") await chmod(bin, 0o755);
    await smokeTest(bin, opts.signal);
    await rm(finalDir, { recursive: true, force: true });
    await rename(staging, finalDir);
  } catch (err) {
    await rm(staging, { recursive: true, force: true });
    throw err;
  }
  // The archive is no longer needed once unpacked and verified.
  await rm(archivePath, { force: true });
  return { path: join(finalDir, asset.binaryPath), source: "installed" };
}

/** Reject archives that would write outside the target folder. */
async function assertSafeArchive(archivePath: string, signal?: AbortSignal): Promise<void> {
  const names: string[] = [];
  const res = await runProcess("tar", ["-tf", archivePath], {
    signal,
    onStdoutLine: (l) => names.push(l),
  });
  if (res.code !== 0)
    throw new SttError(
      "bad-archive",
      `${archivePath} is not a readable archive:\n${res.stderrTail}`,
    );
  assertSafeEntryNames(names);
}

/** Throw `bad-archive` when any entry name is absolute, has a drive letter or climbs out with `..`. Exported for tests. */
export function assertSafeEntryNames(names: string[]): void {
  for (const n of names) {
    const unsafe = /^([/\\]|[A-Za-z]:)/.test(n) || n.split(/[/\\]/).includes("..");
    if (unsafe)
      throw new SttError(
        "bad-archive",
        `Refusing to unpack archive entry "${n}": it points outside the install folder.`,
      );
  }
}

async function smokeTest(bin: string, signal?: AbortSignal): Promise<void> {
  const res = await runProcess(bin, ["--help"], { signal, timeoutMs: 30_000 });
  if (res.code !== 0) {
    throw new SttError(
      "bad-archive",
      `The downloaded whisper-cli does not run on this machine (exit ${res.code ?? res.signal}). ${res.stderrTail}\nOn Linux it needs libgomp1 and libstdc++ (glibc 2.35+); on Windows the Microsoft Visual C++ runtime.`,
    );
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
