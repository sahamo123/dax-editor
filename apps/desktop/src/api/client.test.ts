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
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true }));
    const r = await client(fetchImpl as unknown as typeof fetch).setApiKey("anthropic", "sk-1");
    expect(JSON.stringify(r)).not.toContain("sk-1");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/settings\/api-key$/);
    expect(JSON.parse(init.body as string)).toEqual({ kind: "anthropic", apiKey: "sk-1" });
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
