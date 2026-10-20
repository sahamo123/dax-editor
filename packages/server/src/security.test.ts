// Security tests against a real server: auth, Host and Origin checks, CORS, body limits, path traversal, secrets handling and WebSocket auth.
// None of these needs FFmpeg except where a media file is required to probe Range handling (see media.test.ts).

import { mkdir, readdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ScriptedRunner } from "./stubs.js";
import { type Harness, openWs, rawRequest, startHarness } from "./test/harness.js";

const ALLOWED_ORIGIN = "http://localhost:5173";
const API_KEY = "sk-test-SECRET-1234567890-abcdef";

let h: Harness;
beforeAll(async () => {
  h = await startHarness({
    origins: [ALLOWED_ORIGIN, "tauri://localhost"],
    maxBodyBytes: 2048,
    agentRunner: new ScriptedRunner([{ type: "text", text: `leaking ${API_KEY} here` }]),
  });
});
afterAll(async () => h.cleanup());

describe("authentication", () => {
  it("answers 401 without a token", async () => {
    const r = await h.req("/api/state", { token: null });
    expect(r.status).toBe(401);
    expect(r.headers["www-authenticate"]).toContain("Bearer");
    expect(r.json()).toEqual({ error: "Missing or invalid token" });
  });

  it("answers 401 for a wrong token, a token of the wrong length and a non-Bearer scheme", async () => {
    expect((await h.req("/api/state", { token: "wrong-token-wrong-token" })).status).toBe(401);
    expect((await h.req("/api/state", { token: "x" })).status).toBe(401);
    const basic = await h.req("/api/state", {
      token: null,
      headers: { Authorization: `Basic ${h.token}` },
    });
    expect(basic.status).toBe(401);
  });

  it("protects every API route, including health and unknown ones, before revealing anything", async () => {
    for (const [method, path] of [
      ["GET", "/api/health"],
      ["GET", "/api/state"],
      ["POST", "/api/command"],
      ["POST", "/api/import"],
      ["POST", "/api/project/new"],
      ["POST", "/api/project/open"],
      ["POST", "/api/project/save"],
      ["POST", "/api/chat"],
      ["POST", "/api/chat/cancel"],
      ["GET", "/api/settings"],
      ["POST", "/api/settings/api-key"],
      ["GET", "/api/providers"],
      ["GET", "/api/local-model"],
      ["POST", "/api/local-model/install"],
      ["POST", "/api/local-model/start"],
      ["POST", "/api/local-model/stop"],
      ["POST", "/api/local-model/cancel"],
      ["POST", "/api/local-model/uninstall"],
      ["GET", "/api/media/asset_1/proxy.mp4"],
      ["GET", "/api/does-not-exist"],
    ] as const) {
      const r = await h.req(path, { method, token: null });
      expect(r.status, `${method} ${path}`).toBe(401);
    }
  });

  it("accepts the token as a query parameter only for media GET, not for API calls", async () => {
    const api = await h.req(`/api/state?token=${h.token}`, { token: null });
    expect(api.status).toBe(401);
    const media = await h.req(`/api/media/asset_1/proxy.mp4?token=${h.token}`, { token: null });
    expect(media.status).toBe(404); // authenticated, asset simply does not exist
    const post = await h.req(`/api/media/asset_1/proxy.mp4?token=${h.token}`, {
      method: "POST",
      token: null,
    });
    expect(post.status).toBe(401);
  });

  it("serves health with a valid token", async () => {
    const r = await h.req("/api/health");
    expect(r.status).toBe(200);
    expect(r.json()).toMatchObject({ ok: true });
  });
});

describe("Host header", () => {
  it("rejects hosts that are not loopback on the listening port (DNS rebinding)", async () => {
    for (const host of [
      "evil.example.com",
      `evil.example.com:${h.port}`,
      `127.0.0.1:${h.port + 1}`,
      "127.0.0.1",
      `localhost.evil.com:${h.port}`,
    ]) {
      const r = await h.req("/api/health", { headers: { Host: host } });
      expect(r.status, host).toBe(403);
    }
  });

  it("accepts localhost on the right port", async () => {
    const r = await h.req("/api/health", { headers: { Host: `localhost:${h.port}` } });
    expect(r.status).toBe(200);
  });

  it("rejects a bad Host even with a valid token and no Origin", async () => {
    const r = await rawRequest(h.port, "/api/health", {
      headers: { Host: "attacker.test", Authorization: `Bearer ${h.token}` },
    });
    expect(r.status).toBe(403);
  });
});

describe("Origin allow-list and CORS", () => {
  it("rejects requests from origins that are not listed, even with a valid token", async () => {
    for (const origin of [
      "http://evil.example",
      "http://localhost:5174",
      "null",
      "http://localhost:5173.evil.com",
    ]) {
      const r = await h.req("/api/state", { headers: { Origin: origin } });
      expect(r.status, origin).toBe(403);
      expect(r.headers["access-control-allow-origin"]).toBeUndefined();
    }
  });

  it("allows listed origins and echoes exactly that origin", async () => {
    const r = await h.req("/api/state", { headers: { Origin: ALLOWED_ORIGIN } });
    expect(r.status).toBe(200);
    expect(r.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
    expect(r.headers.vary).toContain("Origin");
    const tauri = await h.req("/api/state", { headers: { Origin: "tauri://localhost" } });
    expect(tauri.headers["access-control-allow-origin"]).toBe("tauri://localhost");
  });

  it("never sends a wildcard and sends no CORS headers without an Origin", async () => {
    const r = await h.req("/api/state");
    expect(r.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("answers preflight for listed origins without a token, and 403 for others", async () => {
    const ok = await h.req("/api/command", {
      method: "OPTIONS",
      token: null,
      headers: {
        Origin: ALLOWED_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    expect(ok.status).toBe(204);
    expect(ok.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
    expect(String(ok.headers["access-control-allow-headers"]).toLowerCase()).toContain(
      "authorization",
    );
    const bad = await h.req("/api/command", {
      method: "OPTIONS",
      token: null,
      headers: { Origin: "http://evil.example", "Access-Control-Request-Method": "POST" },
    });
    expect(bad.status).toBe(403);
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("sets hardening headers on every response", async () => {
    const r = await h.req("/api/health");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["referrer-policy"]).toBe("no-referrer");
    expect(r.headers["cache-control"]).toBe("no-store");
  });
});

describe("request limits and validation", () => {
  it("refuses a body over the limit declared by Content-Length (413)", async () => {
    const body = JSON.stringify({ name: "x", args: { pad: "a".repeat(5000) } });
    const r = await h.req("/api/command", {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(body)),
      },
    });
    expect(r.status).toBe(413);
    expect(r.headers.connection).toBe("close");
  });

  it("refuses a chunked body that grows past the limit (413)", async () => {
    const r = await rawRequest(h.port, "/api/command", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${h.token}`,
        "Content-Type": "application/json",
        "Transfer-Encoding": "chunked",
      },
      body: JSON.stringify({ name: "x", args: { pad: "a".repeat(5000) } }),
    });
    expect(r.status).toBe(413);
  });

  it("checks the size before the token is used by any handler (unauthenticated big bodies get 401, not buffered)", async () => {
    const r = await h.req("/api/command", {
      method: "POST",
      token: null,
      body: "a".repeat(5000),
      headers: { "Content-Type": "application/json" },
    });
    expect(r.status).toBe(401);
  });

  it("rejects non-JSON content types (415), invalid JSON (400) and bad shapes (400)", async () => {
    const text = await h.req("/api/command", {
      method: "POST",
      body: '{"name":"get_project"}',
      headers: { "Content-Type": "text/plain" },
    });
    expect(text.status).toBe(415);
    const broken = await h.req("/api/command", {
      method: "POST",
      body: "{nope",
      headers: { "Content-Type": "application/json" },
    });
    expect(broken.status).toBe(400);
    const shape = await h.post("/api/command", { args: {} });
    expect(shape.status).toBe(400);
    expect(shape.json().error).toContain("name");
  });

  it("answers 404 for unknown routes, 405 with Allow for wrong methods", async () => {
    expect((await h.req("/api/nope")).status).toBe(404);
    const r = await h.req("/api/state", { method: "DELETE" });
    expect(r.status).toBe(405);
    expect(String(r.headers.allow)).toContain("GET");
  });

  it("rejects absolute-form and protocol-relative request targets", async () => {
    expect((await h.req("//evil.example/api/health")).status).toBe(400);
    expect((await h.req("http://evil.example/api/health")).status).toBe(400);
  });

  it("returns unknown commands and invalid command arguments as ok:false, not as server errors", async () => {
    const unknown = await h.command("rm_rf", {});
    expect(unknown).toMatchObject({ ok: false });
    const invalid = await h.command("split", { at: "soon" });
    expect(invalid).toMatchObject({ ok: false });
  });

  it("does not expose shell or raw FFmpeg access through commands", async () => {
    for (const name of ["exec", "shell", "ffmpeg", "run"]) {
      expect(await h.command(name, { args: ["-version"] })).toMatchObject({ ok: false });
    }
  });
});

describe("path traversal", () => {
  it("never resolves media for traversal-style or prototype asset ids", async () => {
    const ids = [
      "..%2F..%2Fetc%2Fpasswd",
      "%2e%2e",
      "..",
      "%2e%2e%2f%2e%2e%2fetc%2fpasswd",
      "__proto__",
      "constructor",
      "asset_1%00",
      "a%5Cb",
    ];
    for (const id of ids) {
      const r = await h.req(`/api/media/${id}/proxy.mp4`);
      expect([400, 404], id).toContain(r.status);
      expect(r.text()).not.toContain("root:");
    }
    const raw = await h.req("/api/media/../../../etc/passwd");
    expect(raw.status).toBe(404);
    expect(raw.text()).not.toContain("root:");
  });

  it("rejects malformed percent-encoding with 400", async () => {
    expect((await h.req("/api/media/%zz/proxy.mp4")).status).toBe(400);
  });

  it("rejects unknown media kinds", async () => {
    expect((await h.req("/api/media/asset_1/passwd")).status).toBe(404);
  });

  it("refuses imports outside the allowed roots, through .., symlinks and relative paths", async () => {
    await mkdir(join(h.workDir, "inner"), { recursive: true });
    const outsideFile = join(h.workDir, "..", "outside.mp4");
    await writeFile(outsideFile, "not a video");
    // Junctions exercise realpath escapes on Windows without file-symlink privileges.
    const link =
      process.platform === "win32"
        ? join(h.workDir, "inner", "escape", "outside.mp4")
        : join(h.workDir, "inner", "sneaky.mp4");
    if (process.platform === "win32")
      await symlink(dirname(outsideFile), join(h.workDir, "inner", "escape"), "junction");
    else await symlink(outsideFile, link);

    const attempts = [
      "/etc/passwd",
      join(h.workDir, "..", "outside.mp4"),
      join(h.workDir, "inner", "..", "..", "outside.mp4"),
      link,
      "relative/path.mp4",
      "../outside.mp4",
    ];
    for (const path of attempts) {
      const viaImport = await h.post("/api/import", { paths: [path] });
      expect(viaImport.status, path).toBe(200);
      expect(viaImport.json(), path).toMatchObject({ ok: false });
      const viaCommand = await h.command("import_media", { path });
      expect(viaCommand, path).toMatchObject({ ok: false });
    }
    const state = (await h.req("/api/state")).json<{ project: { assets: object } }>();
    expect(Object.keys(state.project.assets)).toHaveLength(0);
  });

  it("refuses exports outside the allowed roots", async () => {
    for (const path of ["/tmp/dax-escape.mp4", join(h.workDir, "..", "escape.mp4")]) {
      const r = await h.command("export_video", { path });
      expect(r, path).toMatchObject({ ok: false });
    }
  });

  it("refuses to open a project file whose assets point outside the allowed roots", async () => {
    const evil = join(h.workDir, "evil.dax.json");
    const project = {
      version: 1,
      name: "Evil",
      assets: {
        a1: { id: "a1", path: "/etc/hosts", kind: "video", duration: 5, hasAudio: false },
      },
      timeline: {
        width: 1920,
        height: 1080,
        fps: 30,
        tracks: [{ id: "v1", kind: "video", clips: [] }],
        overlays: [],
      },
    };
    await writeFile(evil, JSON.stringify(project));
    const r = await h.post("/api/project/open", { path: evil });
    expect(r.status).toBe(403);
    expect(r.json().error).toContain("outside the allowed folders");
    expect((await h.req("/api/state")).json<{ project: { name: string } }>().project.name).not.toBe(
      "Evil",
    );
  });

  it("refuses to open or save projects outside the allowed roots (403) or with the wrong extension (400)", async () => {
    expect((await h.post("/api/project/open", { path: "/etc/passwd" })).status).toBe(403);
    expect(
      (await h.post("/api/project/open", { path: join(h.workDir, "..", "x.dax.json") })).status,
    ).toBe(403);
    expect((await h.post("/api/project/save", { path: "/tmp/escape.dax.json" })).status).toBe(403);
    expect((await h.post("/api/project/save", { path: join(h.workDir, "notes.txt") })).status).toBe(
      400,
    );
    expect((await h.post("/api/project/open", {})).status).toBe(400);
  });
});

describe("secrets", () => {
  it("never returns, logs or persists an API key outside secrets.json", async () => {
    const ws = await h.ws();
    const set = await h.post("/api/settings/api-key", {
      kind: "openai-compatible",
      apiKey: API_KEY,
    });
    expect(set.status).toBe(200);
    expect(set.text()).not.toContain(API_KEY);
    expect(set.json<unknown[]>()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "openai-compatible", hasApiKey: true }),
      ]),
    );

    // Every readable surface.
    for (const path of ["/api/settings", "/api/providers", "/api/state", "/api/local-model"]) {
      const r = await h.req(path);
      expect(r.text(), path).not.toContain(API_KEY);
    }
    // Settings round trip must not smuggle the key into settings.json either.
    const settings = (await h.req("/api/settings")).json();
    await h.req("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ ...settings, apiKey: API_KEY }),
      headers: { "Content-Type": "application/json" },
    });

    // A project save and a chat run (whose runner "leaks" the key) must stay clean too.
    await h.post("/api/project/save", { path: join(h.workDir, "p.dax.json") });
    const chat = await h.post("/api/chat", { message: "hello" });
    expect(chat.status).toBe(202);
    await ws.waitForAny((e) => e.type === "chat" && e.event.type === "done");
    expect(JSON.stringify(ws.events)).not.toContain(API_KEY);
    expect(JSON.stringify(ws.events)).toContain("[redacted]");

    // Logs (debug level) must contain neither the key nor the auth token.
    const logs = h.logs.join("\n");
    expect(logs).not.toContain(API_KEY);
    expect(logs).not.toContain(h.token);

    // On disk: the key lives only in secrets.json, which is private.
    const hits: string[] = [];
    const walk = async (dir: string) => {
      for (const name of await readdir(dir, { withFileTypes: true })) {
        const p = join(dir, name.name);
        if (name.isDirectory()) await walk(p);
        else if ((await readFile(p, "utf8").catch(() => "")).includes(API_KEY)) hits.push(p);
      }
    };
    await walk(h.dataDir);
    await walk(h.workDir);
    expect(hits).toEqual([join(h.dataDir, "secrets.json")]);
    if (process.platform !== "win32") {
      expect((await stat(join(h.dataDir, "secrets.json"))).mode & 0o777).toBe(0o600);
    }

    // Deleting removes it.
    const del = await h.req("/api/settings/api-key?kind=openai-compatible", { method: "DELETE" });
    expect(del.status).toBe(200);
    expect(await readFile(join(h.dataDir, "secrets.json"), "utf8")).not.toContain(API_KEY);
    expect(JSON.stringify((await h.req("/api/providers")).json())).toContain('"hasApiKey":false');
  });

  it("validates the API key request", async () => {
    expect((await h.post("/api/settings/api-key", { kind: "nope", apiKey: "x" })).status).toBe(400);
    expect((await h.post("/api/settings/api-key", { kind: "anthropic", apiKey: "" })).status).toBe(
      400,
    );
    expect((await h.req("/api/settings/api-key?kind=bogus", { method: "DELETE" })).status).toBe(
      400,
    );
  });
});

describe("WebSocket authentication", () => {
  const url = () => `ws://127.0.0.1:${h.port}/ws`;

  it("refuses an upgrade without a token (401)", async () => {
    await expect(openWs(url())).rejects.toThrow(/401/);
  });
  it("refuses a wrong token (401)", async () => {
    await expect(openWs(`${url()}?token=nope-nope-nope-nope`)).rejects.toThrow(/401/);
  });
  it("refuses a bad Origin (403) and a bad Host (403) even with a valid token", async () => {
    await expect(
      openWs(`${url()}?token=${h.token}`, { Origin: "http://evil.example" }),
    ).rejects.toThrow(/403/);
    await expect(openWs(`${url()}?token=${h.token}`, { Host: "evil.example" })).rejects.toThrow(
      /403/,
    );
  });
  it("refuses other paths (404)", async () => {
    await expect(openWs(`ws://127.0.0.1:${h.port}/api/state?token=${h.token}`)).rejects.toThrow(
      /404/,
    );
  });
  it("accepts a valid token via query or header, and sends the full state first", async () => {
    const viaQuery = await openWs(`${url()}?token=${h.token}`, { Origin: ALLOWED_ORIGIN });
    const first = await viaQuery.waitForAny((e) => e.type === "state");
    expect(first.type).toBe("state");
    viaQuery.close();
    const viaHeader = await openWs(url(), { Authorization: `Bearer ${h.token}` });
    await viaHeader.waitForAny((e) => e.type === "state");
    viaHeader.close();
  });
});
