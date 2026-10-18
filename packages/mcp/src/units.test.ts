// Pure unit tests: argument parsing, the security gate, and frame location. No FFmpeg, no sockets.

import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { type Project, ProjectSchema } from "@dax/core";
import { describe, expect, it } from "vitest";
import { McpUsageError, parseMcpArgs } from "./args.js";
import { locateFrame } from "./frame.js";
import {
  allowedHostHeaders,
  allowedOriginValues,
  bearerToken,
  gate,
  generateToken,
  normalizeOrigin,
  safeEqual,
} from "./security.js";

describe("parseMcpArgs", () => {
  it("defaults to stdio with the home folder as the only allowed root", () => {
    const a = parseMcpArgs([], {});
    expect(a.http).toBe(false);
    expect(a.allowedRoots).toEqual([homedir()]);
    expect(a.readOnly).toBe(false);
  });

  it("adds the project's folder to the default roots and resolves paths", () => {
    const a = parseMcpArgs(["--project", "work/a.dax.json"], {});
    expect(a.project).toBe(resolve("work/a.dax.json"));
    expect(a.allowedRoots).toEqual([homedir(), dirname(resolve("work/a.dax.json"))]);
    const b = parseMcpArgs(["--allow-root", "/a", "--allow-root", "/b"], {});
    expect(b.allowedRoots).toEqual([resolve("/a"), resolve("/b")]);
  });

  it("requires a way to deliver the token in HTTP mode", () => {
    expect(() => parseMcpArgs(["--http"], {})).toThrow(McpUsageError);
    expect(parseMcpArgs(["--http", "--print-token"], {}).printToken).toBe(true);
    expect(parseMcpArgs(["--http", "--token-file", "t"], {}).tokenFile).toBe(resolve("t"));
    expect(parseMcpArgs(["--http"], { DAX_MCP_TOKEN: "x".repeat(32) }).token).toBe("x".repeat(32));
  });

  it("rejects bad input as usage errors", () => {
    expect(() => parseMcpArgs(["--nope"], {})).toThrow(McpUsageError);
    expect(() => parseMcpArgs(["--port", "70000"], {})).toThrow(/port/);
    expect(() => parseMcpArgs(["--host", "0.0.0.0"], {})).toThrow(/loopback/);
    expect(() => parseMcpArgs(["--allow-origin", "not an origin"], {})).toThrow(/origin/i);
    expect(() => parseMcpArgs([], { DAX_MCP_TOKEN: "short" })).toThrow(/at least/);
  });

  it("reads the safety flags", () => {
    const a = parseMcpArgs(["--read-only", "--no-export", "--no-preview", "--stateless"], {});
    expect([a.readOnly, a.noExport, a.noPreview, a.stateless]).toEqual([true, true, true, true]);
  });
});

describe("security helpers", () => {
  it("generates distinct 256-bit tokens and compares in constant time", () => {
    const a = generateToken();
    expect(a).not.toBe(generateToken());
    expect(a.length).toBe(43);
    expect(safeEqual(a, a)).toBe(true);
    expect(safeEqual(a, `${a}x`)).toBe(false);
  });

  it("parses Authorization headers strictly", () => {
    expect(bearerToken({ authorization: "Bearer abc" })).toBe("abc");
    expect(bearerToken({ authorization: "bearer abc" })).toBe("abc");
    expect(bearerToken({ authorization: "Bearer" })).toBeUndefined();
    expect(bearerToken({ authorization: "Bearer a b" })).toBeUndefined();
    expect(bearerToken({ authorization: "Basic abc" })).toBeUndefined();
    expect(bearerToken({})).toBeUndefined();
  });

  it("normalises origins and rejects malformed ones", () => {
    expect(normalizeOrigin("HTTP://Localhost:5173/")).toBe("http://localhost:5173");
    expect(() => normalizeOrigin("*")).toThrow();
    expect(() => normalizeOrigin("http://a.b/path")).toThrow();
  });

  it("always includes loopback names so an empty extra list cannot disable the check", () => {
    expect(allowedOriginValues(9, []).has("http://127.0.0.1:9")).toBe(true);
    expect(allowedHostHeaders(9, []).has("localhost:9")).toBe(true);
    expect(allowedHostHeaders(9, []).has("[::1]:9")).toBe(true);
  });

  it("gates in the order Host, Origin, token", () => {
    const config = {
      hosts: allowedHostHeaders(9),
      origins: allowedOriginValues(9),
      token: "t".repeat(20),
    };
    const good = { host: "127.0.0.1:9", authorization: `Bearer ${config.token}` };
    expect(gate(good, config)).toEqual({ ok: true });
    expect(gate({ ...good, host: "evil:9" }, config)).toMatchObject({ ok: false, status: 403 });
    expect(gate({ ...good, origin: "https://evil" }, config)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(gate({ host: "127.0.0.1:9", origin: "https://evil" }, config)).toMatchObject({
      status: 403,
    });
    expect(gate({ host: "127.0.0.1:9" }, config)).toMatchObject({ ok: false, status: 401 });
    expect(gate({ authorization: good.authorization }, config)).toMatchObject({ status: 403 }); // no Host
  });
});

describe("locateFrame", () => {
  /** Two clips of the same asset: source 0-2 at timeline 0-2, then source 4-6 at timeline 2-4. */
  function project(): Project {
    return ProjectSchema.parse({
      version: 1,
      name: "t",
      assets: {
        a1: {
          id: "a1",
          path: "/media/a.mp4",
          kind: "video",
          duration: 6,
          hasAudio: true,
          width: 320,
          height: 240,
          fps: 30,
        },
      },
      timeline: {
        width: 320,
        height: 240,
        fps: 30,
        tracks: [
          {
            id: "v1",
            kind: "video",
            clips: [
              { id: "c1", assetId: "a1", start: 0, in: 0, out: 2 },
              { id: "c2", assetId: "a1", start: 2, in: 4, out: 6 },
            ],
          },
        ],
        overlays: [],
      },
    });
  }

  it("maps timeline time to source time across a cut", () => {
    const p = project();
    expect(locateFrame(p, 1)).toMatchObject({ clipId: "c1", sourceTime: 1 });
    expect(locateFrame(p, 3)).toMatchObject({ clipId: "c2", sourceTime: 5 });
    expect(locateFrame(p, 2)).toMatchObject({ clipId: "c2", sourceTime: 4 });
  });

  it("clamps times outside the timeline", () => {
    const p = project();
    expect(locateFrame(p, -5).timelineTime).toBe(0);
    const end = locateFrame(p, 99);
    expect(end.clipId).toBe("c2");
    expect(end.sourceTime).toBeLessThan(6);
  });

  it("explains an empty timeline", () => {
    const p = project();
    const empty = {
      ...p,
      timeline: { ...p.timeline, tracks: [{ id: "v1", kind: "video" as const, clips: [] }] },
    };
    expect(() => locateFrame(empty, 0)).toThrow(/empty/);
  });
});
