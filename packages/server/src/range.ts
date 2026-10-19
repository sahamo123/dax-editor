// HTTP Range support: parsing the Range header (RFC 9110 section 14) and streaming a file or a slice of it.
// Kept free of routing so the edge cases (suffix ranges, clamping, 416) are unit-testable.

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";

/** Result of parsing a Range header against a file size. */
export type RangeResult =
  /** No usable Range header (absent, wrong unit, malformed or multi-range): serve the whole file with 200. */
  | { kind: "full" }
  /** One satisfiable range; both ends inclusive and within the file. */
  | { kind: "partial"; start: number; end: number }
  /** Syntactically valid but outside the file: answer 416. */
  | { kind: "unsatisfiable" };

/**
 * Interpret a `Range` header for a file of `size` bytes.
 *
 * - `bytes=a-b`, `bytes=a-` and suffix `bytes=-n` are supported; `b` past the end is clamped.
 * - Malformed headers, other units, `last < first`, and multiple ranges are ignored (full 200 response),
 *   which RFC 9110 permits.
 * - A first byte at or past the end, a zero-length suffix, or any range on an empty file is unsatisfiable.
 */
export function parseRange(header: string | undefined, size: number): RangeResult {
  if (!header) return { kind: "full" };
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return { kind: "full" };
  const [, first = "", last = ""] = m;
  if (first === "" && last === "") return { kind: "full" };

  if (first === "") {
    // Suffix range: the last n bytes.
    const n = Number(last); // digits only, so never NaN; absurdly long values become Infinity and clamp below
    if (n === 0 || size === 0) return { kind: "unsatisfiable" };
    return { kind: "partial", start: Math.max(0, size - n), end: size - 1 };
  }

  const start = Number(first);
  let end = last === "" ? size - 1 : Number(last);
  if (last !== "" && end < start) return { kind: "full" };
  if (start >= size) return { kind: "unsatisfiable" };
  end = Math.min(end, size - 1);
  return { kind: "partial", start, end };
}

/** Options for {@link sendFile}. */
export interface SendFileOptions {
  contentType: string;
  /** Value for `Cache-Control`. */
  cacheControl: string;
  /** Extra headers to add (CORS, security). */
  headers?: Record<string, string>;
}

/**
 * Stream a file to the client with `Accept-Ranges`, `ETag`, `Last-Modified`, `If-None-Match` and
 * `If-Range` handling. Answers HEAD without a body. The file is read lazily, never fully into memory.
 */
export async function sendFile(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  opts: SendFileOptions,
): Promise<void> {
  const st = await stat(path);
  const size = st.size;
  const etag = `"${size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const base: Record<string, string> = {
    ...opts.headers,
    "Content-Type": opts.contentType,
    "Cache-Control": opts.cacheControl,
    "Accept-Ranges": "bytes",
    ETag: etag,
    "Last-Modified": st.mtime.toUTCString(),
  };

  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, base);
    res.end();
    return;
  }

  // If-Range: only honour the Range if the client's copy is still the current one.
  const ifRange = req.headers["if-range"];
  const rangeHeader = ifRange !== undefined && ifRange !== etag ? undefined : req.headers.range;
  const range = parseRange(rangeHeader, size);

  if (range.kind === "unsatisfiable") {
    res.writeHead(416, { ...base, "Content-Range": `bytes */${size}`, "Content-Length": "0" });
    res.end();
    return;
  }

  const partial = range.kind === "partial";
  const start = partial ? range.start : 0;
  const end = partial ? range.end : size - 1;
  const length = size === 0 ? 0 : end - start + 1;
  res.writeHead(partial ? 206 : 200, {
    ...base,
    ...(partial ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    "Content-Length": String(length),
  });
  if (req.method === "HEAD" || length === 0) {
    res.end();
    return;
  }
  await new Promise<void>((resolve) => {
    const stream = createReadStream(path, { start, end });
    // A client that seeks away destroys the socket; stop reading so we do not leak file handles.
    res.on("close", () => stream.destroy());
    stream.on("error", () => {
      res.destroy();
      resolve();
    });
    stream.on("close", () => resolve());
    stream.pipe(res);
  });
}
