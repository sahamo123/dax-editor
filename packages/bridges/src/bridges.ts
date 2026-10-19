// createCliBridges: the one object the engine needs. It reports the cli-* providers' status for Settings and builds the
// runner for the active one. Claude Code works; Codex is detected but not supported yet; Gemini is deliberately not built
// (Google's terms forbid consumer sign-in through third-party tools, see docs/research/cli-subscription-bridges.md).

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Session, Transcriber } from "@dax/core";
import type { ProviderKind, ProviderStatus } from "@dax/protocol";
import type { AgentRunner, RunnerEnv } from "@dax/server";
import { isSafeModelName } from "./claude/command.js";
import { ClaudeDetector } from "./claude/detect.js";
import { type Conversation, createClaudeRunner, RunRegistry } from "./claude/runner.js";
import { CodexDetector } from "./codex.js";
import type { LocateOptions } from "./locate.js";
import { type BridgeStatus, toProviderStatus } from "./status.js";

/** Builds a runner for providers the engine itself does not implement. Return undefined for kinds this does not handle. */
export type ExtraProviders = (
  kind: ProviderKind,
  env: RunnerEnv,
) => Promise<AgentRunner | undefined>;

/** Options for {@link createCliBridges}. Every field is optional. */
export interface CliBridgesOptions {
  /** The engine's data folder. Working folders go under `<dataDir>/bridges`. Without it a private temp folder is used and removed on close. */
  dataDir?: string;
  /** Environment to read `PATH` and `DAX_CLAUDE_BIN` / `DAX_CODEX_BIN` from, and to build the children's environment from. Default `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Explicit executables, taking precedence over the environment variables and the search. */
  binaries?: { claude?: string; codex?: string };
  /** How to search for executables (tests narrow it so a real install is not found). */
  locate?: LocateOptions;
  /** Speech-to-text engine for the `transcribe` tool. */
  transcriber?: Transcriber;
  /** Extra system-prompt text chosen from the user's message, for example matching editing skills. */
  context?: (message: string) => string | undefined;
  /** Most agent turns per message. Default 25. */
  maxTurns?: number;
  /** Spending estimate that stops a run, in US dollars. Default 2; `null` for no cap. It is a client-side estimate and only meaningful for API-key logins. */
  maxBudgetUsd?: number | null;
  /** Stop a run that takes longer than this in total. Default 30 minutes. */
  wallClockMs?: number;
  /** Stop a run that prints nothing for this long. Default 10 minutes (a long export is silent while it renders). */
  idleMs?: number;
  /** After SIGTERM, how long before the process group is killed outright. Default 5000 ms. */
  killGraceMs?: number;
  /** Offer `export_video` to the CLI. Default true. */
  allowIrreversible?: boolean;
  /** Time limit for each quick status command. Default 3000 ms. */
  probeTimeoutMs?: number;
  /** `statuses()` answers within this time even if a check is slow. Default 3500 ms (the server gives up at 4000). */
  statusDeadlineMs?: number;
  /** Receives lifecycle lines (start, exit, blocked tools). Never given prompts or tokens. Default: discard. */
  log?: (line: string) => void;
}

/** What {@link createCliBridges} returns. Pass `extraProviders` and `statuses` to the engine. */
export interface CliBridges {
  /** Builds the runner for `cli-*` providers; undefined for any other kind. When the CLI is not ready the runner explains why. */
  extraProviders: ExtraProviders;
  /** Status of every `cli-*` provider, ready for the provider registry. Answers within `statusDeadlineMs`. */
  statuses(): Promise<ProviderStatus[]>;
  /** Stop every CLI process in flight, close their MCP endpoints and remove the temporary files. Safe to call twice. */
  close(): Promise<void>;
}

/** Text shown for the Gemini provider. */
const GEMINI_DETAIL =
  "Not supported. Google's terms do not allow signing in with a Google account through third-party tools, and the Gemini CLI no longer serves personal accounts. Use a Gemini API key through the OpenAI-compatible provider instead.";

/** A runner that only explains why the provider cannot be used. */
function explaining(message: string): AgentRunner {
  return {
    async run(_text, ctx) {
      ctx.onEvent({ type: "error", message });
    },
  };
}

/** Resolve with `promise`, or with `fallback` after `ms` (the promise keeps running and its result is cached by the detector). */
function withDeadline<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/**
 * Create the CLI bridges. Nothing is spawned until `statuses()` or a chat run asks.
 *
 * We spawn the user's own, already installed and signed-in command-line agent and let it use its own login. We never
 * read, copy or reuse its credentials. See `packages/bridges/AGENTS.md` for the rules.
 */
export function createCliBridges(options: CliBridgesOptions = {}): CliBridges {
  const env = options.env ?? process.env;
  const probeTimeoutMs = options.probeTimeoutMs ?? 3000;
  const claudeBinary = options.binaries?.claude ?? env.DAX_CLAUDE_BIN;
  const codexBinary = options.binaries?.codex ?? env.DAX_CODEX_BIN;

  const claude = new ClaudeDetector({
    ...(claudeBinary ? { binary: claudeBinary } : {}),
    ...(options.locate ? { locate: options.locate } : {}),
    env,
    probeTimeoutMs,
  });
  const codex = new CodexDetector({
    ...(codexBinary ? { binary: codexBinary } : {}),
    ...(options.locate ? { locate: options.locate } : {}),
    env,
    probeTimeoutMs,
  });

  const registry = new RunRegistry();
  const conversations = new WeakMap<Session, Conversation>();

  // The folder for the CLI's empty workspace and per-run files. Only a folder we created ourselves is ever removed.
  let ownedTempRoot: string | undefined;
  const workRoot = async (): Promise<string> => {
    if (options.dataDir) {
      const dir = join(options.dataDir, "bridges");
      await mkdir(dir, { recursive: true, mode: 0o700 });
      return dir;
    }
    ownedTempRoot ??= await mkdtemp(join(tmpdir(), "dax-bridges-"));
    return ownedTempRoot;
  };

  const runnerConfig = {
    workRoot,
    env,
    maxTurns: options.maxTurns ?? 25,
    maxBudgetUsd: options.maxBudgetUsd === null ? undefined : (options.maxBudgetUsd ?? 2),
    wallClockMs: options.wallClockMs ?? 30 * 60_000,
    idleMs: options.idleMs ?? 10 * 60_000,
    killGraceMs: options.killGraceMs ?? 5000,
    allowIrreversible: options.allowIrreversible ?? true,
    ...(options.transcriber ? { transcriber: options.transcriber } : {}),
    ...(options.context ? { context: options.context } : {}),
    log: options.log ?? (() => undefined),
    registry,
    conversations,
  };

  const deadline = options.statusDeadlineMs ?? 3500;
  const checking = (kind: "cli-claude" | "cli-codex", name: string): BridgeStatus => ({
    kind,
    state: "error",
    available: false,
    detail: `Still checking ${name}. Refresh in a moment.`,
  });

  return {
    async extraProviders(kind, runnerEnv) {
      if (kind === "cli-claude") {
        const detection = await claude.detect();
        if (!detection.install) return explaining(detection.status.detail);
        const model = runnerEnv.settings.providers[kind]?.model;
        if (model !== undefined && !isSafeModelName(model)) {
          return explaining(`"${model}" is not a valid model name. Change it in Settings.`);
        }
        return createClaudeRunner(runnerConfig, detection.install, model);
      }
      if (kind === "cli-codex") return explaining((await codex.detect()).detail);
      if (kind === "cli-gemini") return explaining(GEMINI_DETAIL);
      return undefined;
    },

    async statuses() {
      const [claudeStatus, codexStatus] = await Promise.all([
        withDeadline(
          claude.detect().then((d) => d.status),
          deadline,
          checking("cli-claude", "Claude Code"),
        ),
        withDeadline(codex.detect(), deadline, checking("cli-codex", "Codex CLI")),
      ]);
      const gemini: BridgeStatus = {
        kind: "cli-gemini",
        state: "unsupported",
        available: false,
        detail: GEMINI_DETAIL,
      };
      return [claudeStatus, codexStatus, gemini].map(toProviderStatus);
    },

    async close() {
      await registry.closeAll();
      if (ownedTempRoot) {
        const dir = ownedTempRoot;
        ownedTempRoot = undefined;
        // Exactly the folder mkdtemp returned, never its parent.
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      }
    },
  };
}
