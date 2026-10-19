// Codex CLI: detection only. Driving it from dax is not built yet (see docs/research/cli-subscription-bridges.md, section 2):
// per-run MCP settings through `-c` overrides and the `exec --json` event schema are unconfirmed, and the only confirmed way
// to give it our MCP server is to edit the user's own ~/.codex/config.toml, which we will not do. We still report what
// we find so Settings can say something useful. We read only what `codex login status` prints and keep a yes/no.

import { buildChildEnv } from "./env.js";
import { findExecutable, isExecutableFile, type LocateOptions } from "./locate.js";
import { runProbe } from "./proc.js";
import type { BridgeStatus } from "./status.js";

/** Options for {@link CodexDetector}. */
export interface CodexDetectorOptions {
  /** Use this executable instead of searching (for example from `DAX_CODEX_BIN`). */
  binary?: string;
  /** How to search for the executable. */
  locate?: LocateOptions;
  /** Environment the child environment is built from. Default `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Time limit for each quick command. Default 3000 ms. */
  probeTimeoutMs?: number;
  /** How long an answer is reused. Default 10 000 ms. */
  ttlMs?: number;
}

const NOT_YET = "Driving Codex from dax is not supported yet. For now use an API key provider.";

/** Reads `codex login status` output into yes, no, or unknown. The text itself is discarded. */
function parseLoginText(text: string): { signedIn?: boolean; method?: "ChatGPT" | "an API key" } {
  if (/not logged in/i.test(text)) return { signedIn: false };
  if (!/logged in/i.test(text)) return {};
  if (/chatgpt/i.test(text)) return { signedIn: true, method: "ChatGPT" };
  if (/api key/i.test(text)) return { signedIn: true, method: "an API key" };
  return { signedIn: true };
}

/** Detects the Codex CLI and reports it as installed but unsupported. */
export class CodexDetector {
  private cache: { at: number; status: BridgeStatus } | undefined;
  private inflight: Promise<BridgeStatus> | undefined;

  /** Create a detector. Nothing runs until {@link CodexDetector.detect} is called. */
  constructor(private readonly options: CodexDetectorOptions = {}) {}

  /** Check Codex now (or reuse a recent answer). Never throws. */
  detect(): Promise<BridgeStatus> {
    const ttl = this.options.ttlMs ?? 10_000;
    if (this.cache && Date.now() - this.cache.at < ttl) return Promise.resolve(this.cache.status);
    if (this.inflight) return this.inflight;
    const run = this.check()
      .then((status) => {
        this.cache = { at: Date.now(), status };
        return status;
      })
      .finally(() => {
        this.inflight = undefined;
      });
    this.inflight = run;
    return run;
  }

  private async check(): Promise<BridgeStatus> {
    const explicit = this.options.binary;
    const path =
      explicit && isExecutableFile(explicit)
        ? explicit
        : findExecutable("codex", {
            ...(this.options.env ? { env: this.options.env } : {}),
            ...this.options.locate,
          });
    if (!path) {
      return {
        kind: "cli-codex",
        state: "not-installed",
        available: false,
        detail: `Codex CLI is not installed. ${NOT_YET}`,
      };
    }
    const env = buildChildEnv(this.options.env ?? process.env);
    const timeoutMs = this.options.probeTimeoutMs ?? 3000;
    const [versionRun, loginRun] = await Promise.all([
      runProbe(path, ["--version"], { env, timeoutMs }),
      runProbe(path, ["login", "status"], { env, timeoutMs }),
    ]);
    const version = /(\d+\.\d+\.\d+)/.exec(versionRun.stdout)?.[1];
    // Some builds print the status to stderr.
    const login = parseLoginText(`${loginRun.stdout}\n${loginRun.stderr}`);
    const who =
      login.signedIn === true
        ? ` and signed in${login.method ? ` with ${login.method}` : ""}`
        : login.signedIn === false
          ? " but not signed in"
          : "";
    return {
      kind: "cli-codex",
      state: "unsupported",
      available: false,
      binary: path,
      ...(version ? { version } : {}),
      ...(login.signedIn !== undefined ? { signedIn: login.signedIn } : {}),
      detail: `Codex CLI${version ? ` ${version}` : ""} is installed${who}. ${NOT_YET}`,
    };
  }
}
