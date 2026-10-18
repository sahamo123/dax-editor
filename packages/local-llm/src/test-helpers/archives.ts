/**
 * Test helpers that build tiny `.tar.gz` and `.zip` archives in memory, so extraction tests need
 * no fixtures on disk and no OS tools. Test code only.
 */
import { deflateRawSync, gzipSync } from "node:zlib";

/** One thing to put in a test archive. */
export interface TestEntry {
  /** Path inside the archive (a trailing `/` makes a directory). */
  path: string;
  /** File content. */
  content?: string | Buffer;
  /** Unix permission bits, default 0o644. */
  mode?: number;
  /** If set, the entry is a symlink pointing here. */
  symlink?: string;
}

function octal(value: number, length: number): Buffer {
  const b = Buffer.alloc(length);
  b.write(`${value.toString(8).padStart(length - 1, "0")}\0`, "ascii");
  return b;
}

function tarHeader(path: string, size: number, mode: number, type: string, linkName = ""): Buffer {
  const header = Buffer.alloc(512);
  header.write(path.slice(0, 100), 0, "utf8");
  octal(mode, 8).copy(header, 100);
  octal(0, 8).copy(header, 108);
  octal(0, 8).copy(header, 116);
  octal(size, 12).copy(header, 124);
  octal(0, 12).copy(header, 136);
  header.fill(0x20, 148, 156); // checksum placeholder is spaces
  header.write(type, 156, "ascii");
  header.write(linkName, 157, "utf8");
  header.write("ustar\0", 257, "ascii");
  header.write("00", 263, "ascii");
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
  return header;
}

/** Build a gzip-compressed ustar archive. Paths longer than 100 bytes use a GNU long-name record. */
export function makeTarGz(entries: TestEntry[]): Buffer {
  const parts: Buffer[] = [];
  for (const e of entries) {
    const isDir = e.path.endsWith("/");
    const data =
      typeof e.content === "string" ? Buffer.from(e.content) : (e.content ?? Buffer.alloc(0));
    let name = e.path;
    if (Buffer.byteLength(name) > 100) {
      const nameData = Buffer.from(`${name}\0`);
      parts.push(tarHeader("././@LongLink", nameData.length, 0, "L"), pad(nameData));
      name = name.slice(0, 99);
    }
    if (e.symlink !== undefined) {
      parts.push(tarHeader(name, 0, e.mode ?? 0o777, "2", e.symlink));
    } else if (isDir) {
      parts.push(tarHeader(name, 0, e.mode ?? 0o755, "5"));
    } else {
      parts.push(tarHeader(name, data.length, e.mode ?? 0o644, "0"), pad(data));
    }
  }
  parts.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(parts));
}

function pad(data: Buffer): Buffer {
  const rest = (512 - (data.length % 512)) % 512;
  return rest === 0 ? data : Buffer.concat([data, Buffer.alloc(rest)]);
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Build a zip archive; files are deflated, directories and symlinks stored. */
export function makeZip(entries: TestEntry[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const isDir = e.path.endsWith("/");
    const raw =
      e.symlink !== undefined
        ? Buffer.from(e.symlink)
        : typeof e.content === "string"
          ? Buffer.from(e.content)
          : (e.content ?? Buffer.alloc(0));
    const deflate = !isDir && e.symlink === undefined && raw.length > 0;
    const body = deflate ? deflateRawSync(raw) : raw;
    const name = Buffer.from(e.path);
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);

    const mode =
      e.symlink !== undefined ? 0o120777 : isDir ? 0o040755 : 0o100000 | (e.mode ?? 0o644);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE((3 << 8) | 20, 4); // made on Unix so the mode bits are meaningful
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(deflate ? 8 : 0, 10);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(body.length, 20);
    c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE((mode << 16) >>> 0, 38);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += 30 + name.length + body.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}
