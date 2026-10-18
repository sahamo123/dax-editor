// Request gatekeeping: bearer token, Host and Origin validation, and CORS headers. Pure functions over header values; no I/O.
// Order of defence: Host (blocks DNS rebinding) -> Origin allow-list (blocks other web pages) -> token (blocks other local programs).

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { AUTH_SCHEME } from "@dax/protocol";

/** Generate an unguessable per-launch token (256 bits, URL-safe). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Compare two strings in constant time (hashes first so lengths do not leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Pull the token out of `Authorization: Bearer <token>`, or return undefined if the header is missing or malformed. */
export function bearerToken(headers: IncomingHttpHeaders): string | undefined {
  const value = headers.authorization;
  if (typeof value !== "string") return undefined;
  const prefix = `${AUTH_SCHEME} `;
  if (
    value.length <= prefix.length ||
    value.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()
  )
    return undefined;
  return value.slice(prefix.length).trim();
}

/**
 * True if `host` (the value of the Host header) names this server: `127.0.0.1` or `localhost`
 * on the port it actually listens on. Anything else, including a missing header, is rejected,
 * which defeats DNS-rebinding pages that resolve their own name to 127.0.0.1.
 */
export function isAllowedHost(host: string | undefined, port: number): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  return h === `127.0.0.1:${port}` || h === `localhost:${port}`;
}

/**
 * Normalise an `--origin` flag value: `scheme://host[:port]`, no path, no wildcard.
 * Throws a clear error otherwise. Trailing slashes are removed and the value is lower-cased,
 * because browsers send Origin lower-cased.
 */
export function normalizeOrigin(value: string): string {
  const v = value.trim().replace(/\/+$/, "").toLowerCase();
  if (!/^[a-z][a-z0-9+.-]*:\/\/[a-z0-9._[\]:-]+$/.test(v)) {
    throw new Error(
      `Invalid origin "${value}": expected scheme://host[:port], for example http://localhost:5173`,
    );
  }
  return v;
}

/** True when the request's Origin header is allowed. A request without an Origin header (curl, native code) is allowed here; the token still guards it. */
export function isAllowedOrigin(origin: string | undefined, allowed: ReadonlySet<string>): boolean {
  if (origin === undefined) return true;
  return allowed.has(origin.toLowerCase());
}

/** The headers a response needs so a browser page on an allowed origin may read it. Returns nothing for requests without an Origin. */
export function corsHeaders(
  origin: string | undefined,
  allowed: ReadonlySet<string>,
): Record<string, string> {
  if (origin === undefined || !allowed.has(origin.toLowerCase())) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length, X-Dax-Frames",
  };
}

/** Headers added to every response. `Referrer-Policy` matters because media URLs carry the token in the query string. */
export const BASE_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'",
  "Cache-Control": "no-store",
};
