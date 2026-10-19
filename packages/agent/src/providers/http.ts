// Shared HTTP plumbing for the providers: one JSON POST with timeout, cancellation and retry, clear error
// messages, and a server-sent-events reader. Plain fetch only. Never logs or echoes request headers (API keys).

/** A failed model request: network problem, timeout, HTTP error status or an unreadable reply. The message is safe to show to a user and never contains an API key. */
export class ProviderError extends Error {
  /** HTTP status when the server answered with an error. */
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

/** Network behaviour shared by the providers. All fields are optional. */
export interface HttpOptions {
  /** Replacement for the global `fetch`, used by tests and by embedders with their own HTTP stack. */
  fetch?: typeof fetch;
  /** Give up on one request after this many milliseconds (including reading a streamed reply). Default 300000, because local models on a CPU can be slow. */
  timeoutMs?: number;
  /** Retries after HTTP 408, 429, 500, 502, 503, 504 or 529. Default 2. Network failures are not retried. */
  maxRetries?: number;
  /** First retry delay in milliseconds; doubles each retry, and `Retry-After` wins if longer. Default 500. */
  retryDelayMs?: number;
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504, 529]);

/** Pull a readable message out of an error body such as `{"error":{"message":"..."}}`. */
function messageFromBody(text: string): string {
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body === "object" && body !== null) {
      const err = (body as { error?: unknown }).error;
      if (typeof err === "string") return err;
      if (typeof err === "object" && err !== null) {
        const message = (err as { message?: unknown }).message;
        if (typeof message === "string") return message;
      }
      const message = (body as { message?: unknown }).message;
      if (typeof message === "string") return message;
    }
  } catch {
    // not JSON: use the raw text below
  }
  return text.trim().slice(0, 300) || "(empty body)";
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/** Arguments of {@link postJson}. */
export interface PostJsonArgs<T> {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  /** Cancels the request; the promise then rejects with the abort reason (not a ProviderError). */
  signal: AbortSignal | undefined;
  /** Shown in error messages, e.g. `OpenAI-compatible server`. */
  label: string;
  http: HttpOptions;
  /** Reads the successful response (as text or as a stream). */
  read(response: Response): Promise<T>;
}

/**
 * POST `body` as JSON and hand the successful response to `read`.
 * Rejects with {@link ProviderError} for network failures, timeouts and HTTP errors (after retries),
 * and with the abort reason if `signal` is aborted.
 */
export async function postJson<T>(args: PostJsonArgs<T>): Promise<T> {
  const { http, signal } = args;
  const fetchFn = http.fetch ?? fetch;
  const timeoutMs = http.timeoutMs ?? 300_000;
  const maxRetries = http.maxRetries ?? 2;
  const origin = safeOrigin(args.url);

  for (let attempt = 0; ; attempt++) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const res = await fetchFn(args.url, {
        method: "POST",
        headers: { "content-type": "application/json", ...args.headers },
        body: JSON.stringify(args.body),
        signal: combined,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const hint =
          res.status === 401 || res.status === 403 ? " Check the API key and its permissions." : "";
        const err = new ProviderError(
          `${args.label} at ${origin} returned HTTP ${res.status}: ${messageFromBody(text)}.${hint}`,
          res.status,
        );
        if (RETRYABLE.has(res.status) && attempt < maxRetries) {
          const retryAfter = Number(res.headers.get("retry-after"));
          const wait = Math.max(
            (http.retryDelayMs ?? 500) * 2 ** attempt,
            Number.isFinite(retryAfter) ? Math.min(retryAfter, 10) * 1000 : 0,
          );
          await sleep(wait, signal);
          continue;
        }
        throw err;
      }
      return await args.read(res);
    } catch (err) {
      if (signal?.aborted) throw err;
      if (timeout.aborted) {
        throw new ProviderError(
          `${args.label} at ${origin} did not answer within ${Math.round(timeoutMs / 1000)} s.`,
        );
      }
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(
        `Could not reach ${args.label} at ${origin}: ${describeFetchError(err)}`,
      );
    }
  }
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "the configured URL";
  }
}

/** `fetch failed` hides the useful part (ECONNREFUSED, ENOTFOUND, ...) in `cause`. */
function describeFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as { code?: unknown }).code;
    return typeof code === "string" ? `${code} (${cause.message})` : cause.message;
  }
  return err.message;
}

/** Parse a non-streaming JSON reply, with a readable error if the server returned something else. */
export async function readJson(res: Response, label: string): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError(
      `${label} returned a reply that is not JSON: ${text.trim().slice(0, 200)}`,
    );
  }
}

/** One server-sent event. */
export interface SseEvent {
  /** The `event:` field, if any. */
  event: string | undefined;
  data: string;
}

/** Read a `text/event-stream` response as events. Ends when the stream ends. Comments are skipped. */
export async function* readSse(res: Response): AsyncGenerator<SseEvent> {
  if (!res.body) throw new ProviderError("The server sent an empty streaming reply.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const parse = (block: string): SseEvent | undefined => {
    let event: string | undefined;
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    return data.length > 0 ? { event, data: data.join("\n") } : undefined;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let split = /\r?\n\r?\n/.exec(buffer);
      while (split) {
        const event = parse(buffer.slice(0, split.index));
        buffer = buffer.slice(split.index + split[0].length);
        if (event) yield event;
        split = /\r?\n\r?\n/.exec(buffer);
      }
      if (done) break;
    }
    const last = parse(buffer);
    if (last) yield last;
  } finally {
    // Stop downloading if the consumer quit early (cancellation, error).
    reader.cancel().catch(() => undefined);
  }
}
