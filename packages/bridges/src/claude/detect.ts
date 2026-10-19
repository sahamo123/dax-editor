// Detects Claude Code on this machine: is it installed, is it new enough and does it have the options we depend on,
// and does its own `claude auth status` say the user is signed in. We never open the CLI's credential files:
// the CLI answers for itself, and we only read the exit code and the non-secret fields it prints.

import { statSync } from "node:fs";
import { buildChildEnv } from "../env.js";
import { findExecutable, isExecutableFile, type LocateOptions } from "../locate.js";
import { type ProbeResult, runProbe } from "../proc.js";
import { type BridgeStatus, compareVersions, parseVersion } from "../status.js";

/** Oldest Claude Code we drive. `--permission-prompts none` (needed so nothing can ask for approval) arrived in 2.1.259. */
const MIN_CLAUDE_VERSION: readonly [number, number, number] = [2, 1, 259];

/** Options the CLI must list in `--help`. Without all of them we cannot enforce the tool allow-list, so we refuse to run. */
const REQUIRED_FLAGS = [
  "--output-format",
  "--include-partial-messages",
  "--mcp-config",
  "--strict-mcp-config",
  "--allowedTools",
  "--tools",
  "--permission-mode",
] as const;

/** Options that only some versions have. We pass them when present. */
export interface ClaudeCapabilities {
  /** `--permission-prompts none`: nobody answers prompts, so anything not allowed is denied. */
  permissionPrompts: boolean;
  /** `--disable-slash-commands`: a chat message that starts with `/` is never read as a command. */
  disableSlashCommands: boolean;
}

/** A Claude Code executable that passed the checks. */
export interface ClaudeInstall {
  /** Absolute path of the executable. */
  path: string;
  /** Version such as `2.1.302`. */
  version: string;
  /** Optional flags this version understands. */
  capabilities: ClaudeCapabilities;
}

/** Result of {@link ClaudeDetector.detect}: the status to show, plus the install when one is usable. */
export interface ClaudeDetection {
  /** What to show in Settings. */
  status: BridgeStatus;
  /** Present only when `status.state` is `ready`. */
  install?: ClaudeInstall;
}

/** Options for {@link ClaudeDetector}. */
export interface ClaudeDetectorOptions {
  /** Use this executable instead of searching (for example from `DAX_CLAUDE_BIN`). Ignored when it is not executable. */
  binary?: string;
  /** How to search for the executable. */
  locate?: LocateOptions;
  /** Environment the child environment is built from. Default `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Time limit for each of the three quick commands we run. Default 3000 ms. */
  probeTimeoutMs?: number;
  /** How long a sign-in answer is reused. Default 10 000 ms. */
  authTtlMs?: number;
}

const NOT_INSTALLED =
  "Claude Code is not installed. Install it from https://code.claude.com, then run `claude` once in a terminal to sign in.";
const NOT_SIGNED_IN =
  "Claude Code is installed but not signed in. Run `claude` once in a terminal to sign in.";

/** How the sign-in is described to the user, and whether it bills a subscription or something else. */
function describeReady(version: string, authMethod: string | undefined): string {
  const base = `Claude Code ${version}`;
  switch (authMethod) {
    case "claude.ai":
    case "oauth_token":
      return `Ready. ${base} will use your Claude subscription.`;
    case "api_key":
    case "api_key_helper":
      return `Ready, but ${base} is signed in with an API key, so usage is billed to that key rather than a subscription.`;
    case "third_party":
      return `Ready. ${base} is set up with a cloud provider, so usage is billed there.`;
    default:
      return `Ready. ${base} is signed in${authMethod ? ` (${authMethod})` : ""}.`;
  }
}

/** Read `loggedIn` and `authMethod` from `claude auth status` output, tolerating anything that is not JSON. */
function parseAuthJson(stdout: string): { loggedIn?: boolean; authMethod?: string } {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      return {
        ...(typeof record.loggedIn === "boolean" ? { loggedIn: record.loggedIn } : {}),
        ...(typeof record.authMethod === "string" ? { authMethod: record.authMethod } : {}),
      };
    }
  } catch {
    // Older or differently formatted output: the exit code decides.
  }
  return {};
}

/** Why a probe did not give an answer, for the "error" state. */
function probeProblem(what: string, result: ProbeResult): string {
  if (result.timedOut) return `${what} did not answer in time.`;
  if (result.spawnError) return `${what} could not be started (${result.spawnError}).`;
  return `${what} failed (exit code ${result.exitCode ?? "unknown"}).`;
}

/**
 * Checks Claude Code and remembers the answers briefly. The expensive facts (version, supported options) are cached
 * per executable file; the sign-in answer is cached for a few seconds and concurrent calls share one check.
 */
export class ClaudeDetector {
  private installCache: { key: string; install: ClaudeInstall } | undefined;
  private authCache: { at: number; path: string; detection: ClaudeDetection } | undefined;
  private inflight: Promise<ClaudeDetection> | undefined;

  /** Create a detector. Nothing runs until {@link ClaudeDetector.detect} is called. */
  constructor(private readonly options: ClaudeDetectorOptions = {}) {}

  /**
   * Check Claude Code now (or reuse a recent answer unless `force`). Never throws; problems are states.
   * Spawns `claude --version`, `claude --help` and `claude auth status`, each with its own time limit.
   */
  detect(force = false): Promise<ClaudeDetection> {
    if (this.inflight) return this.inflight;
    const run = this.check(force).finally(() => {
      this.inflight = undefined;
    });
    this.inflight = run;
    return run;
  }

  private childEnv(): Record<string, string> {
    return buildChildEnv(this.options.env ?? process.env);
  }

  private locate(): string | undefined {
    const explicit = this.options.binary;
    if (explicit && isExecutableFile(explicit)) return explicit;
    return findExecutable("claude", {
      ...(this.options.env ? { env: this.options.env } : {}),
      ...this.options.locate,
    });
  }

  private async check(force: boolean): Promise<ClaudeDetection> {
    const path = this.locate();
    if (!path) {
      return {
        status: {
          kind: "cli-claude",
          state: "not-installed",
          available: false,
          detail: NOT_INSTALLED,
        },
      };
    }
    const ttl = this.options.authTtlMs ?? 10_000;
    const cached = this.authCache;
    if (!force && cached && cached.path === path && Date.now() - cached.at < ttl) {
      return cached.detection;
    }

    const installed = await this.probeInstall(path);
    if ("status" in installed) return { status: installed.status };
    const { install } = installed;

    const auth = await runProbe(path, ["auth", "status"], {
      env: this.childEnv(),
      timeoutMs: this.options.probeTimeoutMs ?? 3000,
    });
    const base = { kind: "cli-claude", binary: path, version: install.version } as const;
    let detection: ClaudeDetection;
    const parsed = parseAuthJson(auth.stdout);
    if (auth.timedOut || auth.spawnError) {
      return {
        status: {
          ...base,
          state: "error",
          available: false,
          detail: `${probeProblem("Claude Code's sign-in check", auth)} Try again in a moment.`,
        },
      };
    }
    // Documented behavior: exit 0 when logged in, 1 when not. The JSON adds the method.
    const signedIn =
      parsed.loggedIn ?? (auth.exitCode === 0 && parsed.authMethod !== "none" ? true : undefined);
    if (auth.exitCode === 1 || signedIn === false || parsed.authMethod === "none") {
      detection = {
        status: {
          ...base,
          state: "not-signed-in",
          available: false,
          signedIn: false,
          detail: NOT_SIGNED_IN,
        },
      };
    } else if (auth.exitCode === 0) {
      detection = {
        status: {
          ...base,
          state: "ready",
          available: true,
          signedIn: true,
          detail: describeReady(install.version, parsed.authMethod),
          ...(parsed.authMethod ? { authMethod: parsed.authMethod } : {}),
        },
        install,
      };
    } else {
      return {
        status: {
          ...base,
          state: "error",
          available: false,
          detail: `${probeProblem("Claude Code's sign-in check", auth)} Try updating it with \`claude update\`.`,
        },
      };
    }
    this.authCache = { at: Date.now(), path, detection };
    return detection;
  }

  /** Version and option checks for one executable file, cached until the file changes. */
  private async probeInstall(
    path: string,
  ): Promise<{ install: ClaudeInstall } | { status: BridgeStatus }> {
    let key = path;
    try {
      const st = statSync(path);
      key = `${path}|${st.mtimeMs}|${st.size}`;
    } catch {
      // Fall back to the path alone.
    }
    if (this.installCache?.key === key) return { install: this.installCache.install };

    const env = this.childEnv();
    const timeoutMs = this.options.probeTimeoutMs ?? 3000;
    const base = { kind: "cli-claude", binary: path } as const;
    const [versionRun, helpRun] = await Promise.all([
      runProbe(path, ["--version"], { env, timeoutMs }),
      runProbe(path, ["--help"], { env, timeoutMs, maxBytes: 256 * 1024 }),
    ]);
    if (versionRun.exitCode !== 0) {
      return {
        status: {
          ...base,
          state: "error",
          available: false,
          detail: `${probeProblem("`claude --version`", versionRun)} Is the file at ${path} really Claude Code?`,
        },
      };
    }
    if (!/claude code/i.test(versionRun.stdout)) {
      return {
        status: {
          ...base,
          state: "unsupported",
          available: false,
          detail: `The \`claude\` program at ${path} does not identify itself as Claude Code, so dax will not run it.`,
        },
      };
    }
    const parsed = parseVersion(versionRun.stdout);
    const version = parsed
      ? parsed.join(".")
      : (versionRun.stdout.trim().split(/\s+/)[0] ?? "unknown");
    if (parsed && compareVersions(parsed, MIN_CLAUDE_VERSION) < 0) {
      return {
        status: {
          ...base,
          version,
          state: "unsupported",
          available: false,
          detail: `Claude Code ${version} is too old. dax needs ${MIN_CLAUDE_VERSION.join(".")} or newer. Update it with \`claude update\`.`,
        },
      };
    }
    const help = helpRun.stdout;
    const missing: string[] = REQUIRED_FLAGS.filter((flag) => !help.includes(flag));
    // `--permission-mode dontAsk` is what turns "would prompt" into "denied" for headless runs.
    if (!help.includes("dontAsk")) missing.push("--permission-mode dontAsk");
    if (helpRun.exitCode !== 0 || missing.length > 0) {
      return {
        status: {
          ...base,
          version,
          state: "unsupported",
          available: false,
          detail:
            helpRun.exitCode !== 0
              ? `${probeProblem("`claude --help`", helpRun)} Try updating Claude Code with \`claude update\`.`
              : `This Claude Code (${version}) lacks options dax needs to keep it restricted to the editing tools (${missing.join(", ")}). Update it with \`claude update\`.`,
        },
      };
    }
    const install: ClaudeInstall = {
      path,
      version,
      capabilities: {
        permissionPrompts: help.includes("--permission-prompts"),
        disableSlashCommands: help.includes("--disable-slash-commands"),
      },
    };
    this.installCache = { key, install };
    return { install };
  }
}
