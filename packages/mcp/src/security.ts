// Request gatekeeping for the HTTP transport: bearer token, Host and Origin checks. Pure functions over header values; no I/O.
// Order of defence: Host (blocks DNS rebinding) -> Origin allow-list (blocks other web pages) -> token (blocks other local programs).

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

/** Shortest token {@link startHttpServer} accepts when the caller supplies one (about 96 bits when random). */
export const MIN_TOKEN_LENGTH = 16;

/** Generate an unguessable per-launch token: 256 random bits, URL-safe. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Compare two strings in constant time (hashing first so their lengths do not leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Pull the token out of `Authorization: Bearer <token>`; undefined when the header is missing or malformed. */
export function bearerToken(headers: IncomingHttpHeaders): string | undefined {
  const value = headers.authorization;
  if (typeof value !== "string") return undefined;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(value);
  return match?.[1];
}

/** The three spellings of "this machine" a client may use to reach a loopback listener. */
const LOOPBACK_NAMES = ["127.0.0.1", "localhost", "[::1]"] as const;

/**
 * The Host header values that name this server: every loopback spelling on the port actually
 * listened on, plus any extra `host[:port]` values the caller allows. Lower-cased.
 */
export function allowedHostHeaders(port: number, extra: readonly string[] = []): Set<string> {
  const hosts = new Set<string>(LOOPBACK_NAMES.map((n) => `${n}:${port}`));
  for (const e of extra) hosts.add(e.trim().toLowerCase());
  return hosts;
}

/**
 * The browser origins allowed to call this server. Loopback origins on the listening port are
 * always included, so an empty `extra` list never turns the Origin check off (the v1 SDK did exactly
 * that with `allowedOrigins: []`). Values are normalised to lower-case `scheme://host[:port]`.
 */
export function allowedOriginValues(port: number, extra: readonly string[] = []): Set<string> {
  const origins = new Set<string>(LOOPBACK_NAMES.map((n) => `http://${n}:${port}`));
  for (const e of extra) origins.add(normalizeOrigin(e));
  return origins;
}

/**
 * Normalise an allowed-origin value: `scheme://host[:port]`, no path, no wildcard, lower-cased,
 * trailing slashes removed. Throws a clear error for anything else.
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

/** What the gate decided: let the request through, or answer with this status and message. */
export type GateVerdict = { ok: true } | { ok: false; status: 401 | 403; message: string };

/** Everything the gate needs to know about the running listener. */
export interface GateConfig {
  /** Accepted Host header values (see {@link allowedHostHeaders}). */
  hosts: ReadonlySet<string>;
  /** Accepted Origin header values (see {@link allowedOriginValues}). */
  origins: ReadonlySet<string>;
  /** The bearer token every request must present. */
  token: string;
}

/**
 * Decide whether a request may reach the MCP transport. Host is checked first, then Origin, then the
 * token, so a web page learns nothing from a 401 and a missing token never skips the browser checks.
 * A request with no Origin header (a CLI or native client) passes the Origin check; the token still guards it.
 */
export function gate(headers: IncomingHttpHeaders, config: GateConfig): GateVerdict {
  const host = headers.host?.toLowerCase();
  if (!host || !config.hosts.has(host)) {
    return { ok: false, status: 403, message: "Invalid Host header" };
  }
  const origin = headers.origin;
  if (origin !== undefined) {
    // `null` (sandboxed pages) and anything unlisted are rejected, as is a repeated header.
    if (typeof origin !== "string" || !config.origins.has(origin.toLowerCase())) {
      return { ok: false, status: 403, message: "Invalid Origin header" };
    }
  }
  const presented = bearerToken(headers);
  if (presented === undefined || !safeEqual(presented, config.token)) {
    return { ok: false, status: 401, message: "Missing or invalid bearer token" };
  }
  return { ok: true };
}
