import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractArchive, extractTarGz, extractZip } from "./archive.js";
import { ArchiveError } from "./errors.js";
import { makeTarGz, makeZip, type TestEntry } from "./test-helpers/archives.js";

/**
 * Overwrite the uncompressed size recorded in the central directory of a one-entry zip built by
 * `makeZip`, so a test can make an archive whose declared size disagrees with its data.
 */
function withDeclaredZipSize(zip: Buffer, declared: number): Buffer {
  const out = Buffer.from(zip);
  const central = out.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); // central header signature
  out.writeUInt32LE(declared, central + 24);
  return out;
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "dax-arc-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const posix = process.platform !== "win32";

/** True when something (a file, a directory or a link, even a dangling one) sits at `path`. */
function linkExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

const release: TestEntry[] = [
  { path: "llama-b1/" },
  { path: "llama-b1/llama-server", content: "#!/bin/sh\necho hi\n", mode: 0o755 },
  { path: "llama-b1/libllama.so.0", content: "lib" },
  { path: "llama-b1/libllama.so", symlink: "libllama.so.0" },
  { path: "llama-b1/sub/dir/file.txt", content: "nested" },
];

describe.each([
  ["tar.gz", "a.tar.gz", (e: TestEntry[]) => makeTarGz(e), extractTarGz],
  ["zip", "a.zip", (e: TestEntry[]) => makeZip(e), extractZip],
] as const)("%s extraction", (_name, file, make, extract) => {
  it("extracts files, nested directories and strips the single top-level folder", async () => {
    const archive = join(dir, file);
    writeFileSync(archive, make(release));
    const out = join(dir, "out");
    await extract(archive, out);
    expect(readFileSync(join(out, "llama-server"), "utf8")).toContain("echo hi");
    expect(readFileSync(join(out, "sub", "dir", "file.txt"), "utf8")).toBe("nested");
    expect(existsSync(join(out, "llama-b1"))).toBe(false);
  });

  it("keeps the folder when stripCommonRoot is false", async () => {
    const archive = join(dir, file);
    writeFileSync(archive, make(release));
    const out = join(dir, "out");
    await extract(archive, out, { stripCommonRoot: false });
    expect(existsSync(join(out, "llama-b1", "llama-server"))).toBe(true);
  });

  it("does not strip when files sit at the top level (Windows-style flat zips)", async () => {
    const archive = join(dir, file);
    writeFileSync(
      archive,
      make([
        { path: "llama-server.exe", content: "exe" },
        { path: "ggml.dll", content: "dll" },
      ]),
    );
    const out = join(dir, "out");
    await extract(archive, out);
    expect(readFileSync(join(out, "llama-server.exe"), "utf8")).toBe("exe");
    expect(readFileSync(join(out, "ggml.dll"), "utf8")).toBe("dll");
  });

  it.skipIf(!posix)("preserves the executable bit and symlinks", async () => {
    const archive = join(dir, file);
    writeFileSync(archive, make(release));
    const out = join(dir, "out");
    await extract(archive, out);
    expect(statSync(join(out, "llama-server")).mode & 0o111).not.toBe(0);
    expect(statSync(join(out, "libllama.so.0")).mode & 0o111).toBe(0);
    expect(lstatSync(join(out, "libllama.so")).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(out, "libllama.so"))).toBe("libllama.so.0");
  });

  it("rejects entries that climb out of the target (zip-slip)", async () => {
    const archive = join(dir, file);
    writeFileSync(archive, make([{ path: "../evil.txt", content: "x" }]));
    await expect(extract(archive, join(dir, "out"))).rejects.toBeInstanceOf(ArchiveError);
    expect(existsSync(join(dir, "evil.txt"))).toBe(false);
  });

  it("rejects absolute paths", async () => {
    const archive = join(dir, file);
    writeFileSync(archive, make([{ path: "/tmp/evil.txt", content: "x" }]));
    await expect(extract(archive, join(dir, "out"))).rejects.toBeInstanceOf(ArchiveError);
  });

  it.skipIf(!posix)("rejects symlinks that point outside the target", async () => {
    const archive = join(dir, file);
    writeFileSync(
      archive,
      make([
        { path: "d/escape", symlink: "../../../../etc/passwd" },
        { path: "d/f", content: "x" },
      ]),
    );
    await expect(extract(archive, join(dir, "out"))).rejects.toBeInstanceOf(ArchiveError);
  });

  it("keeps names that only start with two dots (..cfg is not a parent reference)", async () => {
    const archive = join(dir, file);
    writeFileSync(
      archive,
      make([
        { path: "..cfg", content: "cfg" },
        { path: "..notes/todo.txt", content: "notes" },
      ]),
    );
    const out = join(dir, "out");
    await extract(archive, out);
    expect(readFileSync(join(out, "..cfg"), "utf8")).toBe("cfg");
    expect(readFileSync(join(out, "..notes", "todo.txt"), "utf8")).toBe("notes");
  });

  it.skipIf(!posix)("accepts a symlink whose target name starts with two dots", async () => {
    const archive = join(dir, file);
    writeFileSync(
      archive,
      make([
        { path: "..cfg", content: "cfg" },
        { path: "link", symlink: "..cfg" },
      ]),
    );
    const out = join(dir, "out");
    await extract(archive, out);
    expect(readlinkSync(join(out, "link"))).toBe("..cfg");
  });

  it.skipIf(!posix)(
    "refuses a chain of symlinks that only escapes once the links are followed",
    async () => {
      const archive = join(dir, file);
      writeFileSync(
        archive,
        make([
          { path: "sub/" },
          // s1 is the destination itself: sub/.. resolves to the root.
          { path: "s1", symlink: "sub/.." },
          // Lexically this stays inside, but s1/.. is the parent of the root.
          { path: "s2", symlink: "s1/../escaped" },
          // A later entry writes through s2 into the parent directory.
          { path: "s2/planted", symlink: "x" },
        ]),
      );
      // The escape target exists so that a write through the chain would succeed silently.
      mkdirSync(join(dir, "escaped"));
      await expect(extract(archive, join(dir, "out"))).rejects.toBeInstanceOf(ArchiveError);
      expect(linkExists(join(dir, "escaped", "planted"))).toBe(false);
    },
  );

  it.skipIf(!posix)("refuses to write through a symlink that stays inside the target", async () => {
    const archive = join(dir, file);
    writeFileSync(
      archive,
      make([{ path: "sub/" }, { path: "ln", symlink: "sub" }, { path: "ln/x", symlink: "y" }]),
    );
    const out = join(dir, "out");
    await expect(extract(archive, out)).rejects.toBeInstanceOf(ArchiveError);
    expect(linkExists(join(out, "sub", "x"))).toBe(false);
  });

  it("handles empty files and many files", async () => {
    const archive = join(dir, file);
    const entries: TestEntry[] = [{ path: "r/empty", content: "" }];
    for (let i = 0; i < 40; i++) entries.push({ path: `r/f${i}.txt`, content: `file ${i}` });
    writeFileSync(archive, make(entries));
    const out = join(dir, "out");
    await extract(archive, out);
    expect(readFileSync(join(out, "empty"), "utf8")).toBe("");
    expect(readFileSync(join(out, "f39.txt"), "utf8")).toBe("file 39");
  });

  it("reads large entries correctly", async () => {
    const big = Buffer.alloc(3_000_000);
    for (let i = 0; i < big.length; i++) big[i] = (i * 31) & 0xff;
    const archive = join(dir, file);
    writeFileSync(archive, make([{ path: "r/big.bin", content: big }]));
    const out = join(dir, "out");
    await extract(archive, out);
    expect(readFileSync(join(out, "big.bin")).equals(big)).toBe(true);
  });
});

describe("tar specifics", () => {
  it("supports GNU long names", async () => {
    const longName = `root/${"d".repeat(60)}/${"e".repeat(60)}/file.txt`;
    const archive = join(dir, "a.tar.gz");
    writeFileSync(
      archive,
      makeTarGz([
        { path: longName, content: "long" },
        { path: "root/x", content: "y" },
      ]),
    );
    const out = join(dir, "out");
    await extractTarGz(archive, out);
    expect(readFileSync(join(out, "d".repeat(60), "e".repeat(60), "file.txt"), "utf8")).toBe(
      "long",
    );
  });

  it("refuses an entry whose declared size is over the limit before reading its body", async () => {
    // A 2 MiB entry cut down to a header plus a fragment: a reader that buffers the body first
    // would report a truncated archive; the declared size must be refused before that.
    const raw = gunzipSync(
      makeTarGz([{ path: "r/huge.bin", content: Buffer.alloc(2 * 1024 * 1024, 7) }]),
    );
    const archive = join(dir, "a.tar.gz");
    writeFileSync(archive, gzipSync(raw.subarray(0, 512 + 1000)));
    await expect(
      extractTarGz(archive, join(dir, "out"), { maxTotalBytes: 1024 * 1024 }),
    ).rejects.toThrow(/declares/);
  });

  it("refuses entries whose declared sizes add up past the limit, before reading them", async () => {
    const archive = join(dir, "a.tar.gz");
    writeFileSync(
      archive,
      makeTarGz([
        { path: "r/one.bin", content: Buffer.alloc(600 * 1024, 1) },
        { path: "r/two.bin", content: Buffer.alloc(600 * 1024, 2) },
      ]),
    );
    await expect(
      extractTarGz(archive, join(dir, "out"), { maxTotalBytes: 1024 * 1024 }),
    ).rejects.toThrow(/declares/);
  });

  it("rejects a truncated archive", async () => {
    const full = makeTarGz([{ path: "r/big", content: Buffer.alloc(100_000, 7) }]);
    const archive = join(dir, "a.tar.gz");
    writeFileSync(archive, full.subarray(0, Math.floor(full.length / 2)));
    await expect(extractTarGz(archive, join(dir, "out"))).rejects.toThrow();
  });

  it.skipIf(!posix)(
    "reads archives written by the system tar (GNU or bsd, --transform style)",
    async () => {
      const src = join(dir, "src");
      mkdirSync(join(src, "bin"), { recursive: true });
      writeFileSync(join(src, "bin", "llama-server"), "binary", { mode: 0o755 });
      writeFileSync(join(src, "bin", "libx.so.1"), "lib");
      execFileSync("ln", ["-s", "libx.so.1", join(src, "bin", "libx.so")]);
      for (const name of ["a".repeat(120)]) writeFileSync(join(src, "bin", name), "longname");
      const archive = join(dir, "sys.tar.gz");
      execFileSync("tar", ["-czf", archive, "-C", src, "."]);
      const out = join(dir, "out");
      await extractTarGz(archive, out, { stripCommonRoot: false });
      expect(readFileSync(join(out, "bin", "llama-server"), "utf8")).toBe("binary");
      expect(readlinkSync(join(out, "bin", "libx.so"))).toBe("libx.so.1");
      expect(readFileSync(join(out, "bin", "a".repeat(120)), "utf8")).toBe("longname");
      expect(statSync(join(out, "bin", "llama-server")).mode & 0o100).not.toBe(0);
    },
  );
});

describe("zip specifics", () => {
  it("rejects a file that is not a zip", async () => {
    const archive = join(dir, "a.zip");
    writeFileSync(archive, "this is not a zip file at all");
    await expect(extractZip(archive, join(dir, "out"))).rejects.toBeInstanceOf(ArchiveError);
  });

  it("refuses an entry whose declared size is over the limit before reading its data", async () => {
    // The directory declares 2 MiB; the data is four bytes. Only the declaration can trip the limit.
    const archive = join(dir, "a.zip");
    writeFileSync(
      archive,
      withDeclaredZipSize(makeZip([{ path: "r/x.bin", content: "tiny" }]), 2 * 1024 * 1024),
    );
    await expect(
      extractZip(archive, join(dir, "out"), { maxTotalBytes: 1024 * 1024 }),
    ).rejects.toThrow(/declares/);
  });

  it("bounds inflate output by the declared size", async () => {
    // 5 MiB of zeros deflates to a few KiB; the directory declares 16 bytes, so inflating must stop
    // at 16 bytes instead of expanding the whole entry first.
    const archive = join(dir, "bomb.zip");
    writeFileSync(
      archive,
      withDeclaredZipSize(
        makeZip([{ path: "r/zeros.bin", content: Buffer.alloc(5 * 1024 * 1024) }]),
        16,
      ),
    );
    await expect(extractZip(archive, join(dir, "out"))).rejects.toThrow(/past its declared size/);
  });
});

describe("extractArchive", () => {
  it("picks the format from the extension and replaces the target atomically", async () => {
    const out = join(dir, "runtime");
    mkdirSync(out);
    writeFileSync(join(out, "stale.txt"), "old");
    const archive = join(dir, "a.tar.gz");
    writeFileSync(archive, makeTarGz(release));
    await extractArchive(archive, out);
    expect(existsSync(join(out, "llama-server"))).toBe(true);
    expect(existsSync(join(out, "stale.txt"))).toBe(false);
  });

  it("leaves the target untouched when extraction fails", async () => {
    const out = join(dir, "runtime");
    mkdirSync(out);
    writeFileSync(join(out, "keep.txt"), "keep");
    const archive = join(dir, "bad.zip");
    writeFileSync(archive, makeZip([{ path: "../x", content: "x" }]));
    await expect(extractArchive(archive, out)).rejects.toBeInstanceOf(ArchiveError);
    expect(readFileSync(join(out, "keep.txt"), "utf8")).toBe("keep");
    expect(existsSync(`${out}.extracting-${process.pid}`)).toBe(false);
  });

  it("rejects unknown extensions", async () => {
    const archive = join(dir, "a.rar");
    writeFileSync(archive, "x");
    await expect(extractArchive(archive, join(dir, "out"))).rejects.toBeInstanceOf(ArchiveError);
  });
});
