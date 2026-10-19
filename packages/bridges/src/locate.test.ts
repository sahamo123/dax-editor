// Tests for finding an executable on PATH and in the common install folders.

import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commonInstallDirs, findExecutable, isExecutableFile } from "./locate.js";
import { makeTempDir, removeTempDir } from "./test/fake-cli.js";

let root: string;
beforeEach(() => {
  root = makeTempDir("dax-locate-");
});
afterEach(() => removeTempDir(root));

/** Create an executable (or, with `mode`, a non-executable) file named `name` in a new folder. */
function put(folder: string, name: string, mode = 0o755): string {
  const dir = join(root, folder);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, "#!/bin/sh\n");
  chmodSync(file, mode);
  return file;
}

describe("findExecutable", () => {
  it("finds a program on PATH", () => {
    const file = put("bin", "claude");
    expect(findExecutable("claude", { env: { PATH: join(root, "bin") }, commonDirs: [] })).toBe(
      file,
    );
  });

  it("prefers PATH over the common install folders, so the user's own choice wins", () => {
    const onPath = put("a", "claude");
    put("common", "claude");
    expect(
      findExecutable("claude", {
        env: { PATH: join(root, "a") },
        commonDirs: [join(root, "common")],
      }),
    ).toBe(onPath);
  });

  it("falls back to the common folders when PATH is minimal, as in an app launched from the Dock", () => {
    const file = put("common", "claude");
    expect(
      findExecutable("claude", {
        env: { PATH: "/nonexistent" },
        commonDirs: [join(root, "common")],
      }),
    ).toBe(file);
  });

  it("skips files that are not executable", () => {
    put("bin", "claude", 0o644);
    expect(
      findExecutable("claude", { env: { PATH: join(root, "bin") }, commonDirs: [] }),
    ).toBeUndefined();
  });

  it("skips directories with the right name", () => {
    mkdirSync(join(root, "bin", "claude"), { recursive: true });
    expect(
      findExecutable("claude", { env: { PATH: join(root, "bin") }, commonDirs: [] }),
    ).toBeUndefined();
  });

  it("returns undefined when it is nowhere", () => {
    expect(
      findExecutable("claude", { env: { PATH: join(root, "none") }, commonDirs: [] }),
    ).toBeUndefined();
  });

  it("only accepts .exe and .com on Windows, because .cmd shims cannot be spawned without a shell", () => {
    expect(isExecutableFile(put("w", "claude.cmd"), "win32")).toBe(false);
    expect(isExecutableFile(put("w", "claude.exe"), "win32")).toBe(true);
  });
});

describe("commonInstallDirs", () => {
  it("lists user-level and system install folders per platform, folders only", () => {
    const mac = commonInstallDirs("darwin", "/Users/u", {});
    expect(mac).toContain("/Users/u/.local/bin");
    expect(mac).toContain("/opt/homebrew/bin");
    const linux = commonInstallDirs("linux", "/home/u", {});
    expect(linux).toContain("/home/u/.local/bin");
    expect(linux).toContain("/usr/local/bin");
    // None of the entries is a file that could hold a login.
    for (const dir of [...mac, ...linux]) expect(dir).not.toMatch(/credentials|auth\.json/i);
  });
});
