// The REST client: auth header, typed results, and the promise that nothing ever throws.

import { describe, expect, it, vi } from "vitest";
import { makeState } from "../app/test-utils";
import { DaxClient, UNREACHABLE } from "./client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function client(fetchImpl: typeof fetch): DaxClient {
  return new DaxClient({ baseUrl: "http://127.0.0.1:5000/", token: "secret", fetchImpl });
}

describe("DaxClient", () => {
  it("sends the bearer token and a JSON body to the right URL", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true, summary: "Done" }));
    const r = await client(fetchImpl as unknown as typeof fetch).run("split", { at: 2 });
    expect(r).toEqual({ ok: true, summary: "Done" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:5000/api/command");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    expect(JSON.parse(init.body as string)).toEqual({ name: "split", args: { at: 2 } });
  });

  it("run() never throws when the network is down", async () => {
    const r = await client(
      vi.fn(async () => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch,
    ).run("undo");
    expect(r).toEqual({ ok: false, error: UNREACHABLE });
  });

  it("returns the server's error message for a failed command", async () => {
    const r = await client(
      vi.fn(async () =>
        jsonResponse(200, { ok: false, error: "No clip can be split at 9s" }),
      ) as unknown as typeof fetch,
    ).run("split", { at: 9 });
    expect(r).toEqual({ ok: false, error: "No clip can be split at 9s" });
  });

  it("explains a rejected token", async () => {
    const r = await client(
      vi.fn(async () => new Response("nope", { status: 401 })) as unknown as typeof fetch,
    ).run("undo");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/access token/);
  });

  it("uses the error field of a non-2xx JSON body", async () => {
    const r = await client(
      vi.fn(async () => jsonResponse(409, { error: "Already running" })) as unknown as typeof fetch,
    ).chat("hi");
    expect(r).toEqual({ ok: false, error: "Already running", status: 409 });
  });

  it("treats an unexpected reply shape as a failure instead of passing garbage on", async () => {
    const r = await client(
      vi.fn(async () => jsonResponse(200, { hello: "world" })) as unknown as typeof fetch,
    ).run("undo");
    expect(r.ok).toBe(false);
  });

  it("validates the state it returns", async () => {
    const good = await client(
      vi.fn(async () => jsonResponse(200, makeState())) as unknown as typeof fetch,
    ).getState();
    expect(good.ok).toBe(true);
    const bad = await client(
      vi.fn(async () => jsonResponse(200, { project: 1 })) as unknown as typeof fetch,
    ).getState();
    expect(bad.ok).toBe(false);
  });

  it("gives up on ordinary calls after the timeout", async () => {
    const hang: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      });
    const c = new DaxClient({ baseUrl: "http://x", token: "t", fetchImpl: hang, timeoutMs: 20 });
    const r = await c.health();
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/too long/);
  });

  it("sends an API key once, to its own endpoint, and returns no key", async () => {
    // The real server answers with the refreshed provider list.
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, [{ kind: "anthropic", available: true, detail: "Ready", hasApiKey: true }]),
    );
    const r = await client(fetchImpl as unknown as typeof fetch).setApiKey("anthropic", "sk-1");
    expect(JSON.stringify(r)).not.toContain("sk-1");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/settings\/api-key$/);
    expect(JSON.parse(init.body as string)).toEqual({ kind: "anthropic", apiKey: "sk-1" });
  });

  it("talks to the local model's own endpoints and checks the status it gets back", async () => {
    const calls: Array<[string, string, unknown]> = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname;
      calls.push([init.method ?? "GET", path, init.body ? JSON.parse(init.body as string) : null]);
      if (path === "/api/local-model")
        return jsonResponse(200, { installed: false, running: false, detail: "Not downloaded" });
      if (path.endsWith("/install") || path.endsWith("/start"))
        return jsonResponse(202, { jobId: "job-1" });
      return jsonResponse(200, { ok: true });
    });
    const c = client(fetchImpl as unknown as typeof fetch);
    expect(await c.getLocalModel()).toEqual({
      ok: true,
      value: { installed: false, running: false, detail: "Not downloaded" },
    });
    expect(await c.localModel({ action: "install", modelId: "m1" })).toEqual({
      ok: true,
      value: { jobId: "job-1" },
    });
    expect(await c.localModel({ action: "install" })).toMatchObject({ ok: true });
    expect(await c.localModel({ action: "start" })).toMatchObject({ value: { jobId: "job-1" } });
    for (const action of ["stop", "cancel", "uninstall"] as const) {
      expect(await c.localModel({ action })).toEqual({ ok: true, value: {} });
    }
    expect(calls).toEqual([
      ["GET", "/api/local-model", null],
      ["POST", "/api/local-model/install", { modelId: "m1" }],
      ["POST", "/api/local-model/install", {}],
      ["POST", "/api/local-model/start", {}],
      ["POST", "/api/local-model/stop", {}],
      ["POST", "/api/local-model/cancel", {}],
      ["POST", "/api/local-model/uninstall", {}],
    ]);
  });

  it("rejects a local model status that is not the protocol's shape", async () => {
    // The pre-protocol guess: `recommended` instead of flat fields, and no `detail`.
    const r = await client(
      vi.fn(async () =>
        jsonResponse(200, { installed: false, running: false, recommended: { id: "x" } }),
      ) as unknown as typeof fetch,
    ).getLocalModel();
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/unexpected local model status/);
  });

  it("passes the per-file import outcome through and treats HTTP 200 ok:false as a failure", async () => {
    const data = { assetIds: ["a1"], failed: [] };
    const good = await client(
      vi.fn(async () =>
        jsonResponse(200, { ok: true, summary: "Imported 1 file(s).", data }),
      ) as unknown as typeof fetch,
    ).importMedia(["/a.mp4"]);
    expect(good).toEqual({ ok: true, summary: "Imported 1 file(s).", data });
    const bad = await client(
      vi.fn(async () =>
        jsonResponse(200, { ok: false, error: "Not inside an allowed folder" }),
      ) as unknown as typeof fetch,
    ).importMedia(["/etc/passwd"]);
    expect(bad).toEqual({ ok: false, error: "Not inside an allowed folder" });
  });

  it("uses one plain sentence for a rejected token, whatever the server wrote", async () => {
    const r = await client(
      vi.fn(async () =>
        jsonResponse(401, { error: "Missing or invalid token" }),
      ) as unknown as typeof fetch,
    ).getState();
    expect(r).toMatchObject({ ok: false, status: 401 });
    expect(r.ok === false && r.error).toBe("The editor engine rejected the access token.");
  });

  it("imports through /api/import", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { ok: true, summary: "Imported 1 file(s)." }),
    );
    const r = await client(fetchImpl as unknown as typeof fetch).importMedia(["/a.mp4"]);
    expect(r.ok).toBe(true);
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toMatch(/\/api\/import$/);
  });
});
