/**
 * A local HTTP file server for downloader tests: supports `Range`, can drop connections midway,
 * ignore ranges or slow down, and records the requests it saw. Test code only; binds 127.0.0.1.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/** Behaviours that tests can switch on. */
interface FileServerBehavior {
  /** Close the connection after sending this many body bytes (per request). */
  dropAfterBytes?: number;
  /** How many requests should be dropped before behaving normally. Default: all matching. */
  dropTimes?: number;
  /** Answer 200 with the whole file even when a Range was requested. */
  ignoreRange?: boolean;
  /** Delay between 64 KiB chunks, ms (to make aborting possible). */
  chunkDelayMs?: number;
  /** ETag header to send. */
  etag?: string;
  /** Status to answer with instead of serving the file. */
  failWithStatus?: number;
}

/** A running test server. */
export interface TestFileServer {
  /** Base URL, e.g. `http://127.0.0.1:41234`. */
  url: string;
  /** Behaviour switches; mutate between requests. */
  behavior: FileServerBehavior;
  /** Every request seen, in order. */
  requests: { url: string; range: string | undefined; ifRange: string | undefined }[];
  /** Replace the content served at a path. */
  set(path: string, content: Buffer): void;
  /** Stop the server. */
  close(): Promise<void>;
}

/** Start a server that serves the given `files` (path to content). */
export async function startFileServer(files: Record<string, Buffer>): Promise<TestFileServer> {
  const store = new Map(Object.entries(files));
  const requests: TestFileServer["requests"] = [];
  // Tests replace `handle.behavior` wholesale, so the request handler must read it through here.
  const state = { behavior: {} as FileServerBehavior };
  let dropped = 0;

  const server: Server = createServer((req: IncomingMessage, res) => {
    const path = (req.url ?? "/").split("?")[0] as string;
    requests.push({
      url: path,
      range: req.headers.range,
      ifRange: req.headers["if-range"] as string | undefined,
    });
    if (state.behavior.failWithStatus) {
      res.writeHead(state.behavior.failWithStatus);
      res.end();
      return;
    }
    const content = store.get(path);
    if (!content) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    let start = 0;
    let status = 200;
    const range = req.headers.range?.match(/^bytes=(\d+)-/);
    if (range && !state.behavior.ignoreRange) {
      start = Number(range[1]);
      if (start >= content.length) {
        res.writeHead(416, { "content-range": `bytes */${content.length}` });
        res.end();
        return;
      }
      status = 206;
    }
    const body = content.subarray(start);
    const headers: Record<string, string | number> = {
      "content-length": body.length,
      "accept-ranges": "bytes",
    };
    if (state.behavior.etag) headers.etag = state.behavior.etag;
    if (status === 206)
      headers["content-range"] = `bytes ${start}-${content.length - 1}/${content.length}`;
    res.writeHead(status, headers);

    const shouldDrop =
      state.behavior.dropAfterBytes !== undefined &&
      (state.behavior.dropTimes === undefined || dropped < state.behavior.dropTimes);
    const limit = shouldDrop ? (state.behavior.dropAfterBytes as number) : body.length;
    let sent = 0;
    const pump = () => {
      if (res.destroyed) return;
      if (sent >= limit) {
        if (shouldDrop) {
          dropped++;
          res.destroy();
        } else {
          res.end();
        }
        return;
      }
      const chunk = body.subarray(sent, Math.min(sent + 65536, limit));
      sent += chunk.length;
      res.write(chunk, () => {
        if (state.behavior.chunkDelayMs) setTimeout(pump, state.behavior.chunkDelayMs);
        else setImmediate(pump);
      });
    };
    pump();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    get behavior() {
      return state.behavior;
    },
    set behavior(value: FileServerBehavior) {
      state.behavior = value;
    },
    requests,
    set: (path, content) => {
      store.set(path, content);
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
