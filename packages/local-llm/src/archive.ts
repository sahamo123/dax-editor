/**
 * Safe extraction of `.tar.gz` and `.zip` archives, implemented on `node:zlib` so the package
 * needs no archive dependency and no OS `tar`/`unzip` (the Windows `tar.exe` cannot be relied on
 * everywhere, and GNU tar cannot read zip). Rejects entries that would escape the destination
 * directory (zip-slip), and keeps symlinks and file modes, which llama.cpp's Linux/macOS builds
 * need (`libllama.so -> libllama.so.0`). Does no network I/O.
 */
import { createReadStream } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, parse, relative, resolve, sep } from "node:path";
import { createGunzip, inflateRaw } from "node:zlib";
import { ArchiveError } from "./errors.js";

/**
 * Inflate raw deflate data, refusing to produce more than `maxLength` bytes. The bound stops a
 * small entry that expands enormously from filling memory before the size check sees it.
 */
function inflateBounded(data: Buffer, maxLength: number): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    inflateRaw(data, { maxOutputLength: maxLength }, (error, out) =>
      error ? reject(error) : resolvePromise(out),
    );
  });
}

/** The byte cap for one extraction: the caller's `maxTotalBytes`, or 4 GiB. */
function sizeLimit(options: ExtractOptions): number {
  return options.maxTotalBytes ?? 4 * 1024 ** 3;
}

/**
 * Account for one entry's declared size before any of its data is read. Refuses a single entry
 * over the limit, or a running total that would pass it, so a hostile header cannot make us hold
 * more than the limit in memory.
 *
 * @returns the new running total of declared sizes.
 * @throws ArchiveError when the declaration is over the limit.
 */
function checkDeclaredSize(name: string, size: number, total: number, limit: number): number {
  if (size > limit) {
    throw new ArchiveError(
      `Archive entry ${name} declares ${size} bytes, over the ${limit} byte limit`,
    );
  }
  const sum = total + size;
  if (sum > limit) throw new ArchiveError(`Archive declares more than ${limit} bytes in total`);
  return sum;
}

/** Options shared by the extractors. */
export interface ExtractOptions {
  /**
   * Remove one leading directory from every path when all entries share it
   * (`llama-b1234/llama-server` becomes `llama-server`). Default `true`.
   */
  stripCommonRoot?: boolean;
  /** Refuse archives that would expand to more than this many bytes. Default 4 GiB. */
  maxTotalBytes?: number;
}

/** One file-system object found in an archive, before it is written. */
interface Entry {
  path: string;
  kind: "file" | "dir" | "symlink";
  mode: number;
  linkTarget?: string;
  /** Provides the file content (files only). */
  read?: () => Promise<Buffer>;
}

/** Normalize an archive path to forward slashes and reject absolute or parent-escaping paths. */
function cleanEntryPath(raw: string): string {
  const p = raw.replace(/\\/g, "/").replace(/^\.\//, "");
  if (p.startsWith("/") || /^[a-zA-Z]:/.test(p)) {
    throw new ArchiveError(`Archive entry has an absolute path: ${raw}`);
  }
  const parts = p.split("/").filter((s) => s !== "" && s !== ".");
  if (parts.includes("..")) throw new ArchiveError(`Archive entry escapes the target: ${raw}`);
  return parts.join("/");
}

/**
 * True when a `relative()` result stays at or below its base. Only a path whose first segment is
 * exactly `..` climbs out; names such as `..cfg` are ordinary names.
 */
function isWithin(rel: string): boolean {
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/** Resolve `entryPath` inside `root` and make sure the result stays inside it. */
function insideRoot(root: string, entryPath: string): string {
  const full = resolve(root, entryPath);
  const rel = relative(root, full);
  if (rel === "" || !isWithin(rel)) {
    throw new ArchiveError(`Archive entry escapes the target directory: ${entryPath}`);
  }
  return full;
}

/** True for the errors that mean "this path does not exist (yet)". */
function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/**
 * Throw if any existing component of `target` below `absRoot` is a symbolic link. The last
 * component is not checked: removing or replacing a link does not write through it. Writing
 * through a link would let an archive redirect the write outside the destination, so the
 * extractor refuses rather than follows.
 */
async function refuseSymlinkAncestors(absRoot: string, target: string): Promise<void> {
  const parts = relative(absRoot, target).split(sep);
  let current = absRoot;
  for (const part of parts.slice(0, -1)) {
    current = join(current, part);
    let info: Awaited<ReturnType<typeof lstat>>;
    try {
      info = await lstat(current);
    } catch (error) {
      // Nothing below a missing component can exist, so there is nothing left to check.
      if (isMissing(error)) return;
      throw error;
    }
    if (info.isSymbolicLink()) {
      throw new ArchiveError(`Refusing to write through the symbolic link ${current}`);
    }
  }
}

/**
 * The real location of `path` as the kernel would resolve it, judged against the file system
 * right now. Every symbolic link is followed, including a link whose target does not exist yet,
 * and `..` is applied after the links before it, so `s1/../x` with `s1 -> sub/..` ends up beside
 * the root, not inside it. `base` must already be a real path; `path` may be absolute.
 *
 * @throws ArchiveError when links nest deeper than 40 levels (a loop).
 */
async function resolveThroughLinks(base: string, path: string, depth = 0): Promise<string> {
  if (depth > 40) throw new ArchiveError(`Too many levels of symbolic links: ${path}`);
  let current = isAbsolute(path) ? parse(path).root : base;
  for (const part of path.split(/[\\/]+/)) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      // Only reached with a real `current`, so the parent is the kernel's answer too.
      current = dirname(current);
      continue;
    }
    const next = join(current, part);
    let info: Awaited<ReturnType<typeof lstat>>;
    try {
      info = await lstat(next);
    } catch (error) {
      // Missing: everything after this point is lexical, as no links can exist below it.
      if (!isMissing(error)) throw error;
      current = next;
      continue;
    }
    if (info.isSymbolicLink()) {
      // The link's target is resolved relative to the directory that holds the link.
      current = await resolveThroughLinks(current, await readlink(next), depth + 1);
    } else {
      current = next;
    }
  }
  return current;
}

/** If every entry lives under the same top-level directory, return its name. */
function commonRoot(entries: Entry[]): string | undefined {
  let root: string | undefined;
  for (const e of entries) {
    if (e.path === "") continue; // the archive's "./" entry
    const first = e.path.split("/")[0] as string;
    const nested = e.path.includes("/");
    // A top-level file means there is no single wrapping directory; a top-level directory
    // entry (the wrapper itself) is fine.
    if (!nested && e.kind !== "dir") return undefined;
    if (root === undefined) root = first;
    else if (root !== first) return undefined;
  }
  return root;
}

async function writeEntries(entries: Entry[], destDir: string, options: ExtractOptions) {
  const strip = options.stripCommonRoot !== false;
  const root = strip ? commonRoot(entries) : undefined;
  const absRoot = resolve(destDir);
  await mkdir(absRoot, { recursive: true });
  const symlinks: Entry[] = [];
  let total = 0;
  const limit = sizeLimit(options);

  for (const entry of entries) {
    const rel =
      root && entry.path.startsWith(`${root}/`) ? entry.path.slice(root.length + 1) : entry.path;
    if (rel === "" || rel === root) continue;
    const target = insideRoot(absRoot, rel);
    if (entry.kind === "dir") {
      await refuseSymlinkAncestors(absRoot, target);
      await mkdir(target, { recursive: true });
    } else if (entry.kind === "symlink") {
      // Created after the regular files so a link can never be used to redirect a later write.
      symlinks.push({ ...entry, path: rel });
    } else {
      await refuseSymlinkAncestors(absRoot, target);
      await mkdir(dirname(target), { recursive: true });
      const data = await (entry.read?.() ?? Promise.resolve(Buffer.alloc(0)));
      total += data.length;
      if (total > limit) throw new ArchiveError(`Archive expands to more than ${limit} bytes`);
      await rm(target, { force: true });
      await writeFile(target, data);
      // Keep the executable bits; drop setuid/setgid/sticky and anything exotic.
      if (process.platform !== "win32") await chmod(target, entry.mode & 0o777 || 0o644);
    }
  }

  // Links are judged against the real file system, not by string arithmetic: a link can point
  // through another link, and only the kernel's answer says where it really leads.
  const rootReal = await realpath(absRoot);
  const created: string[] = [];
  try {
    for (const link of symlinks) {
      const target = insideRoot(absRoot, link.path);
      const linkTarget = link.linkTarget ?? "";
      if (isAbsolute(linkTarget)) {
        throw new ArchiveError(
          `Archive symlink ${link.path} points outside the target: ${linkTarget}`,
        );
      }
      await refuseSymlinkAncestors(absRoot, target);
      await mkdir(dirname(target), { recursive: true });
      // Where the link would lead, from the real parent directory. Checked before creating it.
      const parentReal = await resolveThroughLinks(rootReal, relative(absRoot, dirname(target)));
      const dest = await resolveThroughLinks(parentReal, linkTarget);
      if (!isWithin(relative(rootReal, dest))) {
        throw new ArchiveError(
          `Archive symlink ${link.path} points outside the target: ${linkTarget}`,
        );
      }
      await rm(target, { force: true });
      try {
        await symlink(linkTarget, target);
      } catch (error) {
        // Windows without symlink privilege: fall back to a copy of the target when it exists.
        if (process.platform !== "win32") throw error;
        await copyFile(dest, target);
      }
      created.push(target);
    }
    // Links created later can change where an earlier link leads, so check every link once more
    // now that all of them exist.
    for (const target of created) {
      const real = await resolveThroughLinks(rootReal, relative(absRoot, target));
      if (!isWithin(relative(rootReal, real))) {
        throw new ArchiveError(
          `Archive symlink ${relative(absRoot, target)} points outside the target`,
        );
      }
    }
  } catch (error) {
    // Do not leave links behind that point outside the destination, even when the caller
    // extracts straight into a directory instead of a staging folder.
    for (const target of created) await rm(target, { force: true });
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// tar
// ---------------------------------------------------------------------------------------------

function readOctal(buf: Buffer, start: number, length: number): number {
  // Base-256 encoding (high bit set) is used by GNU tar for very large numbers.
  if ((buf[start] ?? 0) & 0x80) {
    let n = 0;
    for (let i = start + 1; i < start + length; i++) n = n * 256 + (buf[i] ?? 0);
    return n;
  }
  const text = buf
    .toString("ascii", start, start + length)
    .replace(/\0.*$/s, "")
    .trim();
  return text === "" ? 0 : Number.parseInt(text, 8);
}

function readString(buf: Buffer, start: number, length: number): string {
  const end = buf.indexOf(0, start);
  return buf.toString("utf8", start, end >= 0 && end < start + length ? end : start + length);
}

/** Parse pax extended header records (`"<len> key=value\n"`). */
function parsePax(data: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let pos = 0;
  while (pos < data.length) {
    const space = data.indexOf(0x20, pos);
    if (space < 0) break;
    const len = Number.parseInt(data.toString("ascii", pos, space), 10);
    if (!Number.isFinite(len) || len <= 0) break;
    const record = data.toString("utf8", space + 1, pos + len - 1);
    const eq = record.indexOf("=");
    if (eq > 0) out[record.slice(0, eq)] = record.slice(eq + 1);
    pos += len;
  }
  return out;
}

/** Collect a gunzipped tar stream into entries, holding file contents in memory one at a time. */
async function readTarGz(archive: string, limit: number): Promise<Entry[]> {
  const entries: Entry[] = [];
  let declaredTotal = 0;
  const stream = createReadStream(archive).pipe(createGunzip());
  let buffer: Buffer = Buffer.alloc(0);
  let pending: { entry: Entry; remaining: number; chunks: Buffer[]; padding: number } | undefined;
  let skipBytes = 0;
  let longName: string | undefined;
  let longLink: string | undefined;
  let pax: Record<string, string> = {};
  let metaTarget:
    | { kind: "L" | "K" | "x" | "g"; remaining: number; chunks: Buffer[]; padding: number }
    | undefined;
  let ended = false;

  const consume = (): void => {
    for (;;) {
      if (skipBytes > 0) {
        const n = Math.min(skipBytes, buffer.length);
        buffer = buffer.subarray(n);
        skipBytes -= n;
        if (skipBytes > 0) return;
      }
      if (metaTarget) {
        const n = Math.min(metaTarget.remaining, buffer.length);
        metaTarget.chunks.push(buffer.subarray(0, n));
        buffer = buffer.subarray(n);
        metaTarget.remaining -= n;
        if (metaTarget.remaining > 0) return;
        skipBytes = metaTarget.padding;
        const data = Buffer.concat(metaTarget.chunks);
        if (metaTarget.kind === "L") longName = readString(data, 0, data.length);
        else if (metaTarget.kind === "K") longLink = readString(data, 0, data.length);
        else if (metaTarget.kind === "x") pax = { ...pax, ...parsePax(data) };
        metaTarget = undefined;
        continue;
      }
      if (pending) {
        const n = Math.min(pending.remaining, buffer.length);
        pending.chunks.push(buffer.subarray(0, n));
        buffer = buffer.subarray(n);
        pending.remaining -= n;
        if (pending.remaining > 0) return;
        const data = Buffer.concat(pending.chunks);
        pending.entry.read = () => Promise.resolve(data);
        skipBytes = pending.padding;
        pending = undefined;
        continue;
      }
      if (buffer.length < 512) return;
      const header = buffer.subarray(0, 512);
      buffer = buffer.subarray(512);
      if (header.every((b) => b === 0)) {
        ended = true; // end-of-archive marker
        return;
      }
      const type = String.fromCharCode(header[156] ?? 0x30);
      const size = readOctal(header, 124, 12);
      const padding = (512 - (size % 512)) % 512;
      if (type === "L" || type === "K" || type === "x" || type === "g") {
        if (type === "g") {
          skipBytes = size + padding; // global pax headers carry nothing we need
        } else {
          metaTarget = { kind: type, remaining: size, chunks: [], padding };
        }
        continue;
      }
      const prefix = readString(header, 345, 155);
      let name = readString(header, 0, 100);
      if (header.toString("ascii", 257, 262) === "ustar" && prefix) name = `${prefix}/${name}`;
      name = pax.path ?? longName ?? name;
      const linkName = pax.linkpath ?? longLink ?? readString(header, 157, 100);
      const realSize = pax.size ? Number(pax.size) : size;
      longName = undefined;
      longLink = undefined;
      pax = {};
      const mode = readOctal(header, 100, 8);
      const cleaned = cleanEntryPath(name.replace(/\/+$/, ""));
      if (type === "5") {
        entries.push({ path: cleaned, kind: "dir", mode });
      } else if (type === "2") {
        entries.push({ path: cleaned, kind: "symlink", mode, linkTarget: linkName });
      } else if (type === "0" || type === "\0" || type === "7") {
        declaredTotal = checkDeclaredSize(cleaned, realSize, declaredTotal, limit);
        const entry: Entry = { path: cleaned, kind: "file", mode };
        entries.push(entry);
        const pad = (512 - (realSize % 512)) % 512;
        if (realSize === 0) entry.read = () => Promise.resolve(Buffer.alloc(0));
        else pending = { entry, remaining: realSize, chunks: [], padding: pad };
      } else if (type === "1") {
        // Hard link: represent it as a copy of an earlier entry.
        const source = entries.find((e) => e.path === cleanEntryPath(linkName));
        if (!source?.read)
          throw new ArchiveError(`Archive hard link ${name} points to unknown ${linkName}`);
        entries.push({ path: cleaned, kind: "file", mode, read: source.read });
      } else {
        skipBytes = realSize + ((512 - (realSize % 512)) % 512); // devices, fifos: ignored
      }
    }
  };

  for await (const chunk of stream) {
    buffer = buffer.length === 0 ? (chunk as Buffer) : Buffer.concat([buffer, chunk as Buffer]);
    consume();
    if (ended) break;
  }
  if (!ended && (pending || metaTarget))
    throw new ArchiveError(`Truncated tar archive: ${archive}`);
  return entries;
}

/**
 * Extract a gzip-compressed tar archive into `destDir` (created if needed).
 * Supports ustar, GNU long names and pax headers, symlinks and hard links.
 *
 * @throws ArchiveError for malformed archives, paths that escape `destDir`, or symlinks that
 * point outside it.
 */
export async function extractTarGz(
  archive: string,
  destDir: string,
  options: ExtractOptions = {},
): Promise<void> {
  const entries = await readTarGz(archive, sizeLimit(options));
  await writeEntries(entries, destDir, options);
}

// ---------------------------------------------------------------------------------------------
// zip
// ---------------------------------------------------------------------------------------------

/** Read the central directory of a zip file and return its entries (content is read lazily). */
async function readZip(archive: string, limit: number): Promise<Entry[]> {
  const handle = await open(archive, "r");
  try {
    const { size } = await handle.stat();
    // The end-of-central-directory record is within the last 64 KiB + 22 bytes.
    const tailLen = Math.min(size, 65557);
    const tail = Buffer.alloc(tailLen);
    await handle.read(tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new ArchiveError(`Not a zip file (no end record): ${archive}`);
    const count = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    if (count === 0xffff || cdOffset === 0xffffffff) {
      throw new ArchiveError(`Zip64 archives are not supported: ${archive}`);
    }
    const cd = Buffer.alloc(cdSize);
    await handle.read(cd, 0, cdSize, cdOffset);
    const entries: Entry[] = [];
    let declaredTotal = 0;
    let pos = 0;
    for (let n = 0; n < count; n++) {
      if (cd.readUInt32LE(pos) !== 0x02014b50)
        throw new ArchiveError(`Corrupt zip directory: ${archive}`);
      const versionMadeBy = cd.readUInt16LE(pos + 4);
      const flags = cd.readUInt16LE(pos + 8);
      const method = cd.readUInt16LE(pos + 10);
      const compressedSize = cd.readUInt32LE(pos + 20);
      const uncompressedSize = cd.readUInt32LE(pos + 24);
      const nameLen = cd.readUInt16LE(pos + 28);
      const extraLen = cd.readUInt16LE(pos + 30);
      const commentLen = cd.readUInt16LE(pos + 32);
      const externalAttrs = cd.readUInt32LE(pos + 38);
      const localOffset = cd.readUInt32LE(pos + 42);
      const rawName = cd.toString("utf8", pos + 46, pos + 46 + nameLen);
      // Checked on the directory alone, before any entry's data is read.
      declaredTotal = checkDeclaredSize(rawName, uncompressedSize, declaredTotal, limit);
      pos += 46 + nameLen + extraLen + commentLen;
      if (flags & 1) throw new ArchiveError(`Encrypted zip entries are not supported: ${rawName}`);
      const isDir = rawName.endsWith("/");
      const path = cleanEntryPath(rawName.replace(/\/+$/, ""));
      // Unix permissions live in the high 16 bits when the archive was made on Unix (host 3).
      const unixMode = versionMadeBy >> 8 === 3 ? externalAttrs >>> 16 : 0;
      const isSymlink = (unixMode & 0o170000) === 0o120000;
      const readData = async (): Promise<Buffer> => {
        const h = await open(archive, "r");
        try {
          const local = Buffer.alloc(30);
          await h.read(local, 0, 30, localOffset);
          if (local.readUInt32LE(0) !== 0x04034b50)
            throw new ArchiveError(`Corrupt zip entry: ${rawName}`);
          const dataStart = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
          const compressed = Buffer.alloc(compressedSize);
          await h.read(compressed, 0, compressedSize, dataStart);
          if (method === 0) return compressed;
          if (method === 8) {
            let out: Buffer;
            try {
              // The declared size is the bound: inflating stops there, not after the whole entry.
              out = await inflateBounded(compressed, Math.max(1, uncompressedSize));
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") {
                throw new ArchiveError(
                  `Zip entry ${rawName} inflates past its declared size of ${uncompressedSize} bytes`,
                );
              }
              throw error;
            }
            if (out.length !== uncompressedSize) {
              throw new ArchiveError(`Zip entry ${rawName} has the wrong size after inflating`);
            }
            return out;
          }
          throw new ArchiveError(`Unsupported zip compression method ${method} for ${rawName}`);
        } finally {
          await h.close();
        }
      };
      if (isDir) {
        entries.push({ path, kind: "dir", mode: 0o755 });
      } else if (isSymlink) {
        entries.push({ path, kind: "symlink", mode: unixMode, read: readData });
      } else {
        entries.push({ path, kind: "file", mode: unixMode & 0o777 || 0o644, read: readData });
      }
    }
    // Symlink targets are stored as the entry content.
    for (const entry of entries) {
      if (entry.kind === "symlink" && entry.read) {
        entry.linkTarget = (await entry.read()).toString("utf8");
      }
    }
    return entries;
  } finally {
    await handle.close();
  }
}

/**
 * Extract a `.zip` archive into `destDir` (created if needed). Supports stored and deflated
 * entries, Unix modes and symlinks; not Zip64, encryption or split archives.
 *
 * @throws ArchiveError for malformed or unsupported archives and unsafe paths.
 */
export async function extractZip(
  archive: string,
  destDir: string,
  options: ExtractOptions = {},
): Promise<void> {
  const entries = await readZip(archive, sizeLimit(options));
  await writeEntries(entries, destDir, options);
}

/**
 * Extract `archive` by looking at its extension (`.tar.gz`, `.tgz` or `.zip`) into `destDir`.
 * The extraction happens in a sibling temporary directory that is renamed into place only when
 * it completed, so `destDir` never holds a half-extracted runtime.
 *
 * @throws ArchiveError for unknown extensions or unsafe archives.
 */
export async function extractArchive(
  archive: string,
  destDir: string,
  options: ExtractOptions = {},
): Promise<void> {
  const lower = archive.toLowerCase();
  const staging = `${normalize(destDir).replace(/[\\/]+$/, "")}.extracting-${process.pid}`;
  await rm(staging, { recursive: true, force: true });
  try {
    if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz"))
      await extractTarGz(archive, staging, options);
    else if (lower.endsWith(".zip")) await extractZip(archive, staging, options);
    else throw new ArchiveError(`Unsupported archive type: ${archive}`);
    await rm(destDir, { recursive: true, force: true });
    await rename(staging, destDir);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
