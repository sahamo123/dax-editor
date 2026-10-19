// A tiny client for the engine's REST API, for test code that must act "from outside the UI" (set up a project,
// run a manual edit, read the truth back). It is deliberately separate from the desktop's own `DaxClient`, so
// the app's client is never the thing that vouches for itself.

/**
 * Make an API helper for the server at `url`. Every method resolves with the parsed JSON body; those that
 * need a successful reply throw with the server's own message otherwise.
 */
export function engineApi(url, token) {
  /** Send one authenticated request; resolves to `{ status, body }`. */
  async function call(method, path, body) {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  /** `call`, but fail loudly unless the status is 2xx. */
  async function ok(method, path, body) {
    const r = await call(method, path, body);
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(r.body)}`);
    }
    return r.body;
  }

  return {
    call,
    /** `GET /api/state`. */
    state: () => ok("GET", "/api/state"),
    /** The open project, from `GET /api/state`. */
    project: async () => (await ok("GET", "/api/state")).project,
    /** The history list, from `GET /api/state`. */
    history: async () => (await ok("GET", "/api/state")).history,
    /** `GET /api/settings`. */
    settings: () => ok("GET", "/api/settings"),
    /** `GET /api/providers`. */
    providers: () => ok("GET", "/api/providers"),
    /** `POST /api/command`: resolves to the `{ ok, summary | error }` outcome (a failed command is still HTTP 200). */
    command: (name, args = {}) => ok("POST", "/api/command", { name, args }),
    /** `POST /api/import`: resolves to the `{ ok, ... }` outcome. */
    importPaths: (paths) => ok("POST", "/api/import", { paths }),
    /** Wait until every background job (proxies, waveforms) has finished, so a test does not race the media pipeline. */
    async settled(timeoutMs = 30_000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const { jobs } = await ok("GET", "/api/state");
        if (!jobs.some((j) => j.status === "running")) return;
        if (Date.now() > deadline) throw new Error("background jobs did not finish");
        await new Promise((r) => setTimeout(r, 100));
      }
    },
  };
}
