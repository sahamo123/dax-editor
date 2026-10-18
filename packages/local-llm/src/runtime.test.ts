import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { HashMismatchError, UnsupportedError } from "./errors.js";
import {
  ensureRuntime,
  findInstalledRuntime,
  PINNED_RUNTIME_TAG,
  type RuntimeProgress,
  type RuntimeTarget,
  recommendBackend,
  removeRuntime,
  resolveRuntimeAsset,
  runtimeAssetCandidates,
  serverBinaryName,
} from "./runtime.js";
import { makeTarGz, makeZip } from "./test-helpers/archives.js";

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const GiB = 1024 ** 3;

describe("runtimeAssetCandidates", () => {
  const t = (
    platform: NodeJS.Platform,
    arch: string,
    backend: "cpu" | "vulkan" = "cpu",
  ): RuntimeTarget => ({
    platform,
    arch,
    backend,
  });

  it.each([
    [t("darwin", "arm64"), "llama-b9-bin-macos-arm64.tar.gz"],
    [t("darwin", "x64"), "llama-b9-bin-macos-x64.tar.gz"],
    [t("linux", "x64"), "llama-b9-bin-ubuntu-x64.tar.gz"],
    [t("linux", "arm64"), "llama-b9-bin-ubuntu-arm64.tar.gz"],
    [t("linux", "x64", "vulkan"), "llama-b9-bin-ubuntu-vulkan-x64.tar.gz"],
    [t("linux", "arm64", "vulkan"), "llama-b9-bin-ubuntu-vulkan-arm64.tar.gz"],
    [t("win32", "x64"), "llama-b9-bin-win-cpu-x64.zip"],
    [t("win32", "arm64"), "llama-b9-bin-win-cpu-arm64.zip"],
    [t("win32", "x64", "vulkan"), "llama-b9-bin-win-vulkan-x64.zip"],
  ] as const)("%j -> %s", (target, expected) => {
    expect(runtimeAssetCandidates("b9", target)[0]).toBe(expected);
  });

  it("falls back to .zip names for older macOS/Linux releases", () => {
    expect(runtimeAssetCandidates("b9", t("linux", "x64"))).toContain(
      "llama-b9-bin-ubuntu-x64.zip",
    );
  });

  it("rejects unsupported platforms and architectures", () => {
    expect(() => runtimeAssetCandidates("b9", t("freebsd", "x64"))).toThrow(UnsupportedError);
    expect(() => runtimeAssetCandidates("b9", t("linux", "ia32"))).toThrow(UnsupportedError);
  });
});

describe("recommendBackend", () => {
  it("uses Vulkan only for a strong discrete GPU on Linux/Windows", () => {
    const strong = [{ kind: "nvidia", discrete: true, vramBytes: 8 * GiB }] as const;
    expect(recommendBackend({ platform: "linux", gpus: [...strong] })).toBe("vulkan");
    expect(recommendBackend({ platform: "win32", gpus: [...strong] })).toBe("vulkan");
    expect(recommendBackend({ platform: "darwin", gpus: [...strong] })).toBe("cpu");
    expect(recommendBackend({ platform: "linux", gpus: [] })).toBe("cpu");
    const weak = [{ kind: "nvidia", discrete: true, vramBytes: 2 * GiB }] as const;
    expect(recommendBackend({ platform: "linux", gpus: [...weak] })).toBe("cpu");
    const integrated = [{ kind: "intel", discrete: false }] as const;
    expect(recommendBackend({ platform: "win32", gpus: [...integrated] })).toBe("cpu");
  });
});

// ---------------------------------------------------------------------------------------------
// A fake "GitHub": release API plus archive downloads.
// ---------------------------------------------------------------------------------------------

const target: RuntimeTarget = { platform: process.platform, arch: process.arch, backend: "cpu" };
const [assetName] = runtimeAssetCandidates("b100", target) as [string];
const isZip = assetName.endsWith(".zip");
const fakeBinary = process.platform === "win32" ? "llama-server.exe" : "llama-server";
const archive = isZip
  ? makeZip([
      { path: fakeBinary, content: "binary" },
      { path: "ggml.dll", content: "dll" },
    ])
  : makeTarGz([
      { path: "llama-b100/" },
      { path: `llama-b100/${fakeBinary}`, content: "binary", mode: 0o755 },
      { path: "llama-b100/libggml.so", content: "lib" },
    ]);

let server: Server;
let base: string;
let digest: string | null;
let apiHits: string[];
let downloads: number;
let apiStatus: number;
let dir: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? "";
    if (url.startsWith("/repos/ggml-org/llama.cpp/releases")) {
      apiHits.push(url);
      if (apiStatus !== 200) {
        res.writeHead(apiStatus);
        res.end("{}");
        return;
      }
      const release = (tag: string, withAsset: boolean) => ({
        tag_name: tag,
        draft: false,
        assets: withAsset
          ? [
              {
                name: assetName.replace("b100", tag),
                size: archive.length,
                digest: digest === null ? null : `sha256:${digest}`,
                browser_download_url: `${base}/download/${tag}/${assetName.replace("b100", tag)}`,
              },
            ]
          : [],
      });
      res.writeHead(200, { "content-type": "application/json" });
      // The newest release has no asset for us (CI still running); the previous one does.
      res.end(
        JSON.stringify(
          url.includes("/tags/")
            ? release("b100", true)
            : [release("b101", false), release("b100", true)],
        ),
      );
      return;
    }
    if (url.startsWith("/download/")) {
      downloads++;
      res.writeHead(200, { "content-length": archive.length });
      res.end(archive);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});
beforeEach(() => {
  digest = sha(archive);
  apiHits = [];
  downloads = 0;
  apiStatus = 200;
  dir = mkdtempSync(join(tmpdir(), "dax-rt-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const mock = () => ({ apiBase: base, downloadBase: base });

describe("resolveRuntimeAsset", () => {
  it("picks the newest release that has an asset for the target and reads its digest", async () => {
    const asset = await resolveRuntimeAsset({ target, ...mock() });
    expect(asset.tag).toBe("b100");
    expect(asset.assetName).toBe(assetName);
    expect(asset.sha256).toBe(digest);
    expect(asset.sizeBytes).toBe(archive.length);
  });

  it("asks for a specific tag when given", async () => {
    const asset = await resolveRuntimeAsset({ target, tag: "b100", ...mock() });
    expect(apiHits[0]).toContain("/releases/tags/b100");
    expect(asset.tag).toBe("b100");
  });

  it("reports a missing digest as undefined", async () => {
    digest = null;
    expect((await resolveRuntimeAsset({ target, ...mock() })).sha256).toBeUndefined();
  });

  it("falls back to a direct URL for the pinned tag when the API is unavailable", async () => {
    apiStatus = 403; // rate limited
    const asset = await resolveRuntimeAsset({ target, ...mock() });
    expect(asset.tag).toBe(PINNED_RUNTIME_TAG);
    expect(asset.url).toBe(
      `${base}/ggml-org/llama.cpp/releases/download/${PINNED_RUNTIME_TAG}/${runtimeAssetCandidates(PINNED_RUNTIME_TAG, target)[0]}`,
    );
    expect(asset.sha256).toBeUndefined();
  });

  it("throws when the release exists but has no asset for the platform", async () => {
    await expect(
      resolveRuntimeAsset({
        target: { ...target, backend: "vulkan", platform: "win32" },
        ...mock(),
      }),
    ).rejects.toBeInstanceOf(UnsupportedError);
  });
});

describe("ensureRuntime", () => {
  it("downloads, verifies, extracts and finds the binary; second call is offline", async () => {
    const phases: RuntimeProgress["phase"][] = [];
    const info = await ensureRuntime({
      dataDir: dir,
      ...mock(),
      onProgress: (p) => phases.push(p.phase),
    });
    expect(info.source).toBe("download");
    expect(info.verified).toBe(true);
    expect(info.tag).toBe("b100");
    expect(readFileSync(info.binaryPath, "utf8")).toBe("binary");
    expect(info.binaryPath.endsWith(serverBinaryName())).toBe(true);
    if (process.platform !== "win32") expect(statSync(info.binaryPath).mode & 0o111).not.toBe(0);
    expect(phases[0]).toBe("resolving");
    expect(phases).toContain("downloading");
    expect(phases).toContain("extracting");
    expect(phases.at(-1)).toBe("done");
    // The big archive is deleted after extraction.
    expect(existsSync(join(dir, "downloads", assetName))).toBe(false);

    const hitsBefore = apiHits.length;
    const again = await ensureRuntime({ dataDir: dir, apiBase: "http://127.0.0.1:1" });
    expect(again.source).toBe("cached");
    expect(again.binaryPath).toBe(info.binaryPath);
    expect(downloads).toBe(1);
    expect(apiHits.length).toBe(hitsBefore);
  });

  it("rejects an archive whose hash differs from the published digest", async () => {
    digest = sha(Buffer.from("not the archive"));
    await expect(ensureRuntime({ dataDir: dir, ...mock(), tag: "b100" })).rejects.toBeInstanceOf(
      HashMismatchError,
    );
    expect(await findInstalledRuntime({ dataDir: dir })).toBeUndefined();
  });

  it("installs unverified (and says so) when no digest is published", async () => {
    digest = null;
    const info = await ensureRuntime({ dataDir: dir, ...mock() });
    expect(info.verified).toBe(false);
  });

  it("uses an explicit binary path without touching the network", async () => {
    const info = await ensureRuntime({
      dataDir: dir,
      binaryPath: process.execPath,
      apiBase: "http://127.0.0.1:1",
    });
    expect(info.source).toBe("override");
    expect(info.binaryPath).toBe(process.execPath);
  });

  it("fails clearly when the override does not exist", async () => {
    await expect(ensureRuntime({ dataDir: dir, binaryPath: join(dir, "nope") })).rejects.toThrow(
      /ENOENT/,
    );
  });

  it("removeRuntime deletes installed runtimes", async () => {
    await ensureRuntime({ dataDir: dir, ...mock() });
    await removeRuntime(dir);
    expect(await findInstalledRuntime({ dataDir: dir })).toBeUndefined();
  });
});
