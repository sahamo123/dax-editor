import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { hasTar, startServer, type TestServer, tempDir } from "../test-support/helpers.js";
import {
  assertSafeEntryNames,
  ensureBinary,
  findWhisperBinary,
  RUNTIME_ASSETS,
  type RuntimeAsset,
  runtimeInstallDir,
  WHISPER_RUNTIME_VERSION,
} from "./binary.js";

const posix = process.platform !== "win32" && hasTar();
let root: string;
let server: TestServer | undefined;

beforeAll(() => {
  root = tempDir();
});
afterEach(async () => {
  await server?.close();
  server = undefined;
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** Pack `files` (path -> content) into a .tar.gz and describe it as a RuntimeAsset served at `url`. */
function makeArchive(
  name: string,
  files: Record<string, string>,
): { data: Buffer; asset: Omit<RuntimeAsset, "url"> } {
  const src = join(root, `src-${name}`);
  for (const [rel, content] of Object.entries(files)) {
    const p = join(src, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, content);
    chmodSync(p, 0o755);
  }
  const out = join(root, `${name}.tar.gz`);
  execFileSync("tar", ["-czf", out, "-C", src, "."]);
  const data = readFileSync(out);
  return {
    data,
    asset: {
      version: "vtest",
      platform: process.platform,
      arch: process.arch,
      sha256: createHash("sha256").update(data).digest("hex"),
      bytes: data.length,
      archive: "tar.gz",
      binaryPath: "pkg/whisper-cli",
    },
  };
}

describe("RUNTIME_ASSETS", () => {
  it("covers Linux x64/arm64 and Windows x64 with pinned hashes on the official release", () => {
    const keys = RUNTIME_ASSETS.map((a) => `${a.platform}-${a.arch}`);
    expect(keys).toEqual(expect.arrayContaining(["linux-x64", "linux-arm64", "win32-x64"]));
    for (const a of RUNTIME_ASSETS) {
      expect(a.url).toMatch(
        new RegExp(
          `^https://github\\.com/ggml-org/whisper\\.cpp/releases/download/${WHISPER_RUNTIME_VERSION}/`,
        ),
      );
      expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(a.bytes).toBeGreaterThan(1_000_000);
      expect(a.binaryPath).toMatch(/whisper-cli(\.exe)?$/);
    }
  });

  it("publishes no macOS asset (whisper.cpp has none), so macOS needs a fallback", () => {
    expect(RUNTIME_ASSETS.some((a) => a.platform === "darwin")).toBe(false);
  });
});

describe("assertSafeEntryNames", () => {
  it("accepts ordinary relative names", () => {
    expect(() =>
      assertSafeEntryNames(["./", "./pkg/whisper-cli", "Release/whisper-cli.exe"]),
    ).not.toThrow();
  });

  it.each([["../evil"], ["pkg/../../evil"], ["/etc/passwd"], ["C:\\Windows\\x"], ["..\\evil"]])(
    "refuses %s",
    (name) => {
      expect(() => assertSafeEntryNames(["ok", name])).toThrow(/Refusing to unpack/);
    },
  );
});

describe("findWhisperBinary", () => {
  it("prefers the explicit path, then DAX_WHISPER_CLI", async () => {
    const bin = join(root, "my-cli");
    writeFileSync(bin, "#!/bin/sh\n");
    chmodSync(bin, 0o755);
    expect(await findWhisperBinary({ binaryPath: bin, env: {} })).toEqual({
      path: bin,
      source: "option",
    });
    expect(await findWhisperBinary({ env: { DAX_WHISPER_CLI: bin } })).toEqual({
      path: bin,
      source: "env",
    });
  });

  it("fails loudly when an explicit path is wrong, instead of silently using another binary", async () => {
    await expect(
      findWhisperBinary({ binaryPath: join(root, "nope"), env: {} }),
    ).rejects.toMatchObject({
      code: "binary-missing",
      message: expect.stringContaining("binaryPath option"),
    });
    await expect(findWhisperBinary({ env: { DAX_WHISPER_CLI: "/no/such/cli" } })).rejects.toThrow(
      /DAX_WHISPER_CLI/,
    );
  });

  it.skipIf(!posix)("finds whisper-cli on PATH", async () => {
    const d = join(root, "pathdir");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "whisper-cli"), "#!/bin/sh\n");
    chmodSync(join(d, "whisper-cli"), 0o755);
    const found = await findWhisperBinary({ dataDir: join(root, "empty"), env: { PATH: d } });
    expect(found).toEqual({ path: join(d, "whisper-cli"), source: "path" });
  });

  it("returns undefined when nothing is installed", async () => {
    expect(
      await findWhisperBinary({
        dataDir: join(root, "none"),
        env: { PATH: "" },
        platform: "linux",
        arch: "x64",
      }),
    ).toBeUndefined();
  });
});

describe("ensureBinary", () => {
  it.skipIf(!posix)(
    "downloads, verifies, unpacks and smoke-tests a runtime, then reuses it",
    async () => {
      const { data, asset } = makeArchive("good", {
        "pkg/whisper-cli": "#!/bin/sh\nexit 0\n",
        "pkg/LICENSE": "MIT",
      });
      server = await startServer(data);
      const dataDir = join(root, "data-good");
      const options = {
        dataDir,
        env: { PATH: "" },
        assets: [{ ...asset, url: `${server.url}/file` }],
      };
      const seen: number[] = [];
      const first = await ensureBinary({ ...options, onProgress: (p) => seen.push(p.fraction) });
      expect(first.source).toBe("installed");
      expect(first.path).toBe(join(runtimeInstallDir(dataDir, asset), "pkg", "whisper-cli"));
      expect(seen.at(-1)).toBe(1);
      expect(existsSync(join(runtimeInstallDir(dataDir, asset), "pkg", "LICENSE"))).toBe(true);
      // No staging folders or archives are left behind.
      expect(readdirSync(join(dataDir, "speech", "bin"))).toEqual([
        `vtest-${process.platform}-${process.arch}`,
      ]);

      const requestsBefore = server.requests.length;
      const second = await ensureBinary(options);
      expect(second).toEqual({ path: first.path, source: "installed" });
      expect(server.requests.length).toBe(requestsBefore);
    },
  );

  it.skipIf(!posix)("shares one download between concurrent callers", async () => {
    const { data, asset } = makeArchive("shared", { "pkg/whisper-cli": "#!/bin/sh\nexit 0\n" });
    server = await startServer(data);
    const options = {
      dataDir: join(root, "data-shared"),
      env: { PATH: "" },
      assets: [{ ...asset, url: `${server.url}/file` }],
    };
    const [a, b] = await Promise.all([ensureBinary(options), ensureBinary(options)]);
    expect(a.path).toBe(b.path);
    expect(server.requests).toHaveLength(1);
  });

  it.skipIf(!posix)(
    "rejects an archive whose hash is not the pinned one and installs nothing",
    async () => {
      const { data, asset } = makeArchive("tampered", { "pkg/whisper-cli": "#!/bin/sh\nexit 0\n" });
      server = await startServer(data);
      const dataDir = join(root, "data-tampered");
      await expect(
        ensureBinary({
          dataDir,
          env: { PATH: "" },
          assets: [{ ...asset, sha256: "f".repeat(64), url: `${server.url}/file` }],
        }),
      ).rejects.toMatchObject({ code: "hash-mismatch" });
      expect(await findWhisperBinary({ dataDir, env: { PATH: "" } })).toBeUndefined();
    },
  );

  it.skipIf(!posix)("explains a runtime that cannot run here, and removes it", async () => {
    const { data, asset } = makeArchive("broken", {
      "pkg/whisper-cli":
        "#!/bin/sh\necho 'error while loading shared libraries: libgomp.so.1' >&2\nexit 127\n",
    });
    server = await startServer(data);
    const dataDir = join(root, "data-broken");
    await expect(
      ensureBinary({
        dataDir,
        env: { PATH: "" },
        assets: [{ ...asset, url: `${server.url}/file` }],
      }),
    ).rejects.toThrow(/does not run on this machine.*libgomp/s);
    expect(existsSync(runtimeInstallDir(dataDir, asset))).toBe(false);
  });

  it.skipIf(!posix)("explains an archive that lacks the executable", async () => {
    const { data, asset } = makeArchive("wrongpath", { "other/thing": "x" });
    server = await startServer(data);
    await expect(
      ensureBinary({
        dataDir: join(root, "data-wrong"),
        env: { PATH: "" },
        assets: [{ ...asset, url: `${server.url}/file` }],
      }),
    ).rejects.toMatchObject({ code: "bad-archive" });
  });

  it("gives macOS users concrete options because whisper.cpp ships no macOS CLI", async () => {
    const err = await ensureBinary({
      dataDir: join(root, "mac"),
      env: { PATH: "" },
      platform: "darwin",
      arch: "arm64",
    }).catch((e) => e);
    expect(err.code).toBe("unsupported-platform");
    expect(err.message).toMatch(/darwin\/arm64/);
    expect(err.message).toMatch(/Homebrew/);
    expect(err.message).toMatch(/DAX_WHISPER_CLI/);
  });

  it("does not download when autoInstall is off", async () => {
    await expect(
      ensureBinary({
        dataDir: join(root, "off"),
        env: { PATH: "" },
        platform: "linux",
        arch: "x64",
        autoInstall: false,
      }),
    ).rejects.toMatchObject({ code: "binary-missing" });
  });
});
