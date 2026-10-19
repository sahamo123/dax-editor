/**
 * Finds, downloads and unpacks the llama.cpp release build that contains `llama-server`.
 *
 * We use the project's own prebuilt release archives (CPU builds everywhere, plus an optional
 * Vulkan build on Linux and Windows) so the app ships no native code of its own. The release
 * asset digest published by the GitHub API is used as the SHA-256 to verify. Never runs the
 * binary; starting it is `LlamaServer`'s job.
 */
import { chmod, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { extractArchive } from "./archive.js";
import { downloadFile } from "./download.js";
import { HttpError, UnsupportedError } from "./errors.js";
import type { HardwareInfo } from "./hardware.js";

/** Which llama.cpp build to use. `cpu` works everywhere; `vulkan` uses a graphics card. */
export type RuntimeBackend = "cpu" | "vulkan";

/** The machine a runtime build is for. Defaults to the current process's platform. */
export interface RuntimeTarget {
  /** `darwin`, `linux` or `win32`. */
  platform: NodeJS.Platform;
  /** `x64` or `arm64`. */
  arch: string;
  /** Backend flavour. macOS always uses its built-in Metal build, whatever is requested. */
  backend: RuntimeBackend;
}

/**
 * The llama.cpp release the integration was developed and tested against (built from source
 * and run in the sandbox). Used only when the GitHub API cannot be reached; otherwise the
 * newest release that has an asset for the target is used.
 */
export const PINNED_RUNTIME_TAG = "b11721";

/** GitHub repository that publishes the release archives. */
const RUNTIME_REPO = "ggml-org/llama.cpp";

/**
 * Choose the runtime backend for a machine: Vulkan on Linux/Windows when a discrete GPU with at
 * least 6 GiB of dedicated memory was found, CPU otherwise. CPU is the conservative default
 * because it works on every machine; integrated GPUs are often not faster than the CPU.
 */
export function recommendBackend(
  hardware: Pick<HardwareInfo, "platform" | "gpus">,
): RuntimeBackend {
  if (hardware.platform === "darwin") return "cpu";
  const strong = hardware.gpus.some((g) => g.discrete && (g.vramBytes ?? 0) >= 6 * 1024 ** 3);
  return strong ? "vulkan" : "cpu";
}

/**
 * Names of the release assets that could hold `llama-server` for `target`, best first.
 * Current releases use `.tar.gz` on macOS/Linux and `.zip` on Windows; older ones used `.zip`
 * everywhere, so those names are listed after.
 *
 * @throws UnsupportedError for platforms or architectures llama.cpp does not publish.
 */
export function runtimeAssetCandidates(tag: string, target: RuntimeTarget): string[] {
  const { platform, arch } = target;
  if (arch !== "x64" && arch !== "arm64") {
    throw new UnsupportedError(`No llama.cpp build for CPU architecture "${arch}"`);
  }
  const prefix = `llama-${tag}-bin`;
  switch (platform) {
    case "darwin":
      return [`${prefix}-macos-${arch}.tar.gz`, `${prefix}-macos-${arch}.zip`];
    case "linux": {
      const flavour = target.backend === "vulkan" ? "ubuntu-vulkan" : "ubuntu";
      return [`${prefix}-${flavour}-${arch}.tar.gz`, `${prefix}-${flavour}-${arch}.zip`];
    }
    case "win32": {
      const flavour = target.backend === "vulkan" ? "vulkan" : "cpu";
      return [`${prefix}-win-${flavour}-${arch}.zip`];
    }
    default:
      throw new UnsupportedError(`No llama.cpp build for platform "${platform}"`);
  }
}

/** A release asset chosen for download. */
export interface ResolvedRuntimeAsset {
  /** Release tag, e.g. `b11721`. */
  tag: string;
  /** Asset file name. */
  assetName: string;
  /** Direct download URL. */
  url: string;
  /** Lower-case hex SHA-256 from the release metadata, when GitHub published one. */
  sha256: string | undefined;
  /** Size in bytes from the release metadata, when known. */
  sizeBytes: number | undefined;
}

const ReleaseSchema = z.object({
  tag_name: z.string(),
  draft: z.boolean().optional(),
  assets: z.array(
    z.object({
      name: z.string(),
      size: z.number().optional(),
      digest: z.string().nullable().optional(),
      browser_download_url: z.string().url(),
    }),
  ),
});

/** Options for {@link resolveRuntimeAsset}. */
export interface ResolveRuntimeOptions {
  /** What to fetch the build for. */
  target: RuntimeTarget;
  /** A specific release tag; omit to use the newest release that has a matching asset. */
  tag?: string;
  /** Fetch implementation, for tests. */
  fetch?: typeof fetch;
  /** GitHub API base URL, for tests. Default `https://api.github.com`. */
  apiBase?: string;
  /** Used for the direct-download fallback when the API is unreachable. Default GitHub. */
  downloadBase?: string;
  /** Cancels the lookup. */
  signal?: AbortSignal;
}

function pickAsset(release: z.infer<typeof ReleaseSchema>, target: RuntimeTarget) {
  for (const name of runtimeAssetCandidates(release.tag_name, target)) {
    const asset = release.assets.find((a) => a.name === name);
    if (asset) return asset;
  }
  return undefined;
}

/**
 * Work out which release archive to download for `options.target`.
 *
 * With `tag` set, asks the GitHub API for that release; without it, takes the newest releases
 * and uses the first that has a matching asset. If the API cannot be reached (offline,
 * rate-limited) the pinned tag is used with a direct URL and no digest, so verification is lost
 * but installation still works.
 *
 * @throws UnsupportedError when no release has an asset for the target.
 */
export async function resolveRuntimeAsset(
  options: ResolveRuntimeOptions,
): Promise<ResolvedRuntimeAsset> {
  const doFetch = options.fetch ?? fetch;
  const apiBase = options.apiBase ?? "https://api.github.com";
  const downloadBase = options.downloadBase ?? "https://github.com";
  const path = options.tag
    ? `/repos/${RUNTIME_REPO}/releases/tags/${encodeURIComponent(options.tag)}`
    : `/repos/${RUNTIME_REPO}/releases?per_page=30`;
  try {
    const response = await doFetch(`${apiBase}${path}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "dax-editor-local-llm" },
      signal: options.signal,
    });
    if (!response.ok)
      throw new HttpError(`GitHub API ${path} returned ${response.status}`, response.status);
    const json: unknown = await response.json();
    const releases = options.tag
      ? [ReleaseSchema.parse(json)]
      : z
          .array(ReleaseSchema)
          .parse(json)
          .filter((r) => r.draft !== true);
    for (const release of releases) {
      const asset = pickAsset(release, options.target);
      if (!asset) continue;
      const digest = asset.digest?.startsWith("sha256:")
        ? asset.digest.slice(7).toLowerCase()
        : undefined;
      return {
        tag: release.tag_name,
        assetName: asset.name,
        url: asset.browser_download_url,
        sha256: digest,
        sizeBytes: asset.size,
      };
    }
    throw new UnsupportedError(
      `No llama.cpp release asset for ${options.target.platform}/${options.target.arch}/${options.target.backend}` +
        (options.tag ? ` in release ${options.tag}` : " in the 30 newest releases"),
    );
  } catch (error) {
    if (error instanceof UnsupportedError || options.signal?.aborted) throw error;
    // Offline or rate limited: fall back to a direct URL for the pinned tag.
    const tag = options.tag ?? PINNED_RUNTIME_TAG;
    const assetName = runtimeAssetCandidates(tag, options.target)[0] as string;
    return {
      tag,
      assetName,
      url: `${downloadBase}/${RUNTIME_REPO}/releases/download/${tag}/${assetName}`,
      sha256: undefined,
      sizeBytes: undefined,
    };
  }
}

/** Progress of {@link ensureRuntime}. */
export interface RuntimeProgress {
  /** Current step. */
  phase: "resolving" | "downloading" | "verifying" | "extracting" | "done";
  /** Bytes received so far (downloading phase). */
  receivedBytes?: number;
  /** Total bytes when known. */
  totalBytes?: number;
  /** Which asset is being installed, once known. */
  assetName?: string;
}

/** The installed runtime. */
export interface RuntimeInfo {
  /** Absolute path of the `llama-server` executable. */
  binaryPath: string;
  /** Directory it lives in (shared libraries are next to it). */
  dir: string;
  /** Release tag, or `custom` for an override binary. */
  tag: string;
  /** Backend flavour that was installed. */
  backend: RuntimeBackend;
  /** Where it came from: downloaded now, found in the cache, or the `DAX_LLAMA_SERVER` override. */
  source: "download" | "cached" | "override";
  /** True if the archive's SHA-256 was checked against a digest published by the release. */
  verified: boolean;
}

/** Options for {@link ensureRuntime}. */
export interface EnsureRuntimeOptions {
  /** App data directory; the runtime goes in `<dataDir>/runtime`. */
  dataDir: string;
  /** Machine to install for. Default: the current process (CPU backend). */
  target?: Partial<RuntimeTarget>;
  /** Pin a release tag. Default: newest release with a matching asset (first install only). */
  tag?: string;
  /** Use this `llama-server` instead of downloading. Defaults to `process.env.DAX_LLAMA_SERVER`. */
  binaryPath?: string;
  /** Progress callback. */
  onProgress?: (progress: RuntimeProgress) => void;
  /** Aborts the installation. */
  signal?: AbortSignal;
  /** Fetch implementation, for tests. */
  fetch?: typeof fetch;
  /** GitHub API base URL, for tests. */
  apiBase?: string;
  /** Direct download base URL fallback, for tests. */
  downloadBase?: string;
}

const MarkerSchema = z.object({
  tag: z.string(),
  assetName: z.string(),
  verified: z.boolean(),
});

/** File name of the server executable on `platform`. */
export function serverBinaryName(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? "llama-server.exe" : "llama-server";
}

/** Find the server executable inside an extracted runtime directory (searches two levels deep). */
async function findBinary(dir: string): Promise<string | undefined> {
  const name = serverBinaryName();
  const candidates = [join(dir, name), join(dir, "bin", name)];
  for (const c of candidates) {
    try {
      if ((await stat(c)).isFile()) return c;
    } catch {
      // try the next place
    }
  }
  try {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const nested = join(dir, entry.name, name);
      try {
        if ((await stat(nested)).isFile()) return nested;
      } catch {
        // keep looking
      }
    }
  } catch {
    // directory missing
  }
  return undefined;
}

/** Fill in the defaults of a partial {@link RuntimeTarget}. macOS always uses the CPU/Metal build. */
function completeTarget(partial: Partial<RuntimeTarget> | undefined): RuntimeTarget {
  const target: RuntimeTarget = {
    platform: partial?.platform ?? process.platform,
    arch: partial?.arch ?? process.arch,
    backend: partial?.backend ?? "cpu",
  };
  if (target.platform === "darwin") target.backend = "cpu";
  return target;
}

/** Options for {@link findInstalledRuntime}. */
export interface FindRuntimeOptions {
  /** App data directory that holds `runtime/`. */
  dataDir: string;
  /** Machine to look for. Default: the current process (CPU backend). */
  target?: Partial<RuntimeTarget>;
  /** Only accept this release tag. */
  tag?: string;
  /** Use this `llama-server` instead. Defaults to `process.env.DAX_LLAMA_SERVER`. */
  binaryPath?: string;
}

/**
 * Look for an existing `llama-server` without touching the network: the explicit
 * `binaryPath` / `DAX_LLAMA_SERVER` override first, then an installed runtime for this platform
 * and backend (newest tag wins). Returns `undefined` when nothing usable exists.
 * @throws Error when an override path is given but does not exist.
 */
export async function findInstalledRuntime(
  options: FindRuntimeOptions,
): Promise<RuntimeInfo | undefined> {
  const target = completeTarget(options.target);
  const override = options.binaryPath ?? process.env.DAX_LLAMA_SERVER;
  if (override) {
    await stat(override); // throws a clear ENOENT if the override is wrong
    return {
      binaryPath: override,
      dir: dirname(override),
      tag: "custom",
      backend: target.backend,
      source: "override",
      verified: false,
    };
  }
  const root = join(options.dataDir, "runtime");
  const flavour = `${target.platform}-${target.arch}-${target.backend}`;
  const installed = (await readdir(root).catch(() => [] as string[]))
    .filter((d) => d.endsWith(`-${flavour}`) && (!options.tag || d === `${options.tag}-${flavour}`))
    .sort()
    .reverse();
  for (const name of installed) {
    const dir = join(root, name);
    try {
      const marker = MarkerSchema.parse(
        JSON.parse(await readFile(join(dir, "runtime.json"), "utf8")),
      );
      const binaryPath = await findBinary(dir);
      if (binaryPath) {
        return {
          binaryPath,
          dir: dirname(binaryPath),
          tag: marker.tag,
          backend: target.backend,
          source: "cached",
          verified: marker.verified,
        };
      }
    } catch {
      // Incomplete or foreign directory: ignore, it will be replaced by a fresh install.
    }
  }
  return undefined;
}

/**
 * Make sure a usable `llama-server` exists under `<dataDir>/runtime` and return its location.
 *
 * Order: {@link findInstalledRuntime} (override or cached, no network), then download +
 * SHA-256 check + extraction. The extraction directory is renamed into place only when complete
 * and a `runtime.json` marker records it, so an interrupted install is simply redone.
 *
 * @throws UnsupportedError / HttpError / HashMismatchError / InsufficientDiskSpaceError /
 * DownloadAbortedError as described on the functions it calls.
 */
export async function ensureRuntime(options: EnsureRuntimeOptions): Promise<RuntimeInfo> {
  const target = completeTarget(options.target);
  const found = await findInstalledRuntime({
    dataDir: options.dataDir,
    target,
    ...(options.tag ? { tag: options.tag } : {}),
    ...(options.binaryPath ? { binaryPath: options.binaryPath } : {}),
  });
  if (found) return found;

  const root = join(options.dataDir, "runtime");
  const flavour = `${target.platform}-${target.arch}-${target.backend}`;
  await mkdir(root, { recursive: true });

  options.onProgress?.({ phase: "resolving" });
  const asset = await resolveRuntimeAsset({
    target,
    ...(options.tag ? { tag: options.tag } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.apiBase ? { apiBase: options.apiBase } : {}),
    ...(options.downloadBase ? { downloadBase: options.downloadBase } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });

  const archivePath = join(options.dataDir, "downloads", asset.assetName);
  await downloadFile(asset.url, archivePath, {
    ...(asset.sha256 ? { sha256: asset.sha256 } : {}),
    ...(asset.sizeBytes ? { expectedSize: asset.sizeBytes } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    onProgress: (p) =>
      options.onProgress?.({
        phase: p.phase,
        receivedBytes: p.receivedBytes,
        ...(p.totalBytes !== undefined ? { totalBytes: p.totalBytes } : {}),
        assetName: asset.assetName,
      }),
  });

  options.onProgress?.({ phase: "extracting", assetName: asset.assetName });
  const dir = join(root, `${asset.tag}-${flavour}`);
  await extractArchive(archivePath, dir);
  const binaryPath = await findBinary(dir);
  if (!binaryPath) {
    await rm(dir, { recursive: true, force: true });
    throw new UnsupportedError(`${asset.assetName} does not contain ${serverBinaryName()}`);
  }
  if (process.platform !== "win32") await chmod(binaryPath, 0o755);
  await writeFile(
    join(dir, "runtime.json"),
    JSON.stringify({
      tag: asset.tag,
      assetName: asset.assetName,
      verified: asset.sha256 !== undefined,
    }),
  );
  // The archive is large and no longer needed.
  await rm(archivePath, { force: true });
  options.onProgress?.({ phase: "done", assetName: asset.assetName });
  return {
    binaryPath,
    dir: dirname(binaryPath),
    tag: asset.tag,
    backend: target.backend,
    source: "download",
    verified: asset.sha256 !== undefined,
  };
}

/** Delete every installed runtime under `<dataDir>/runtime`. Safe when none exists. */
export async function removeRuntime(dataDir: string): Promise<void> {
  await rm(join(dataDir, "runtime"), { recursive: true, force: true });
}
