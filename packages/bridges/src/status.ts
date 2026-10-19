// What we can say about a command-line agent on this machine, and how that maps onto the Settings screen's provider status.

import type { ProviderKind, ProviderStatus } from "@dax/protocol";

/** The provider kinds this package is responsible for. */
export type CliProviderKind = Extract<ProviderKind, "cli-claude" | "cli-codex" | "cli-gemini">;

/**
 * Where a command-line agent stands:
 * - `not-installed`: no executable found.
 * - `not-signed-in`: installed, but its own status command says the user is not signed in.
 * - `ready`: installed, signed in and able to run dax's tools.
 * - `unsupported`: installed, but we cannot or will not drive it (too old, missing options, or no bridge built).
 * - `error`: the check itself failed (timeout, crash); trying again may help.
 */
export type BridgeState = "not-installed" | "not-signed-in" | "ready" | "unsupported" | "error";

/** The result of checking one command-line agent. Contains no credentials, only facts the CLI printed about itself. */
export interface BridgeStatus {
  /** Which provider this describes. */
  kind: CliProviderKind;
  /** See {@link BridgeState}. */
  state: BridgeState;
  /** True only when `state` is `ready`. */
  available: boolean;
  /** One or two plain sentences for the Settings screen, including what to do next. */
  detail: string;
  /** True or false when the CLI told us; undefined when we could not tell. */
  signedIn?: boolean;
  /** Absolute path of the executable that was found. */
  binary?: string;
  /** Version string reported by the CLI, for example `2.1.302`. */
  version?: string;
  /** How the CLI is signed in, as it reports it (for example `claude.ai` or `api_key`). */
  authMethod?: string;
}

/** Convert to the shape `GET /api/providers` returns. */
export function toProviderStatus(status: BridgeStatus): ProviderStatus {
  return {
    kind: status.kind,
    available: status.available,
    detail: status.detail,
    ...(status.signedIn !== undefined ? { signedIn: status.signedIn } : {}),
  };
}

/** Compare dotted version triples. Returns a negative number when `a` is older than `b`. */
export function compareVersions(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Pull the first `major.minor.patch` out of a CLI's `--version` output, or undefined. */
export function parseVersion(text: string): [number, number, number] | undefined {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(text);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
