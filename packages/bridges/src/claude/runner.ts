// Runs one chat message through the user's own Claude Code: starts a private loopback MCP endpoint on the live
// project session, spawns `claude -p` against it, translates its stream into chat events, and cleans everything up.
//
// Security properties (each has a test):
//  - The CLI sees only our MCP tools (see command.ts), and nothing can prompt for approval.
//  - The bearer token exists only in this process, the MCP endpoint and the child's environment. It is not in a file,
//    on the command line, in a log line or in any chat event.
//  - The prompt goes to stdin, so it is never on the command line and never logged.
//  - We spawn the unmodified binary and never open its credential files; it signs in on its own.
//  - On cancel, timeout or shutdown the CLI's whole process group is ended and the endpoint and files are removed.

import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Session, Transcriber } from "@dax/core";
import { type RunningHttpServer, startHttpServer } from "@dax/mcp";
import type { AgentEvent } from "@dax/protocol";
import type { AgentRunContext, AgentRunner } from "@dax/server";
import { buildChildEnv } from "../env.js";
import { signalProcessTree } from "../proc.js";
import { redactSecrets } from "../redact.js";
import { buildClaudeArgs, buildMcpConfig, SYSTEM_PROMPT, TOKEN_ENV_NAME } from "./command.js";
import type { ClaudeInstall } from "./detect.js";
import { ClaudeEventMapper } from "./events.js";

/** Longest single line we accept from the CLI's stdout (8 MiB). A longer one means something is badly wrong. */
const MAX_LINE_BYTES = 8 * 1024 * 1024;

/** How much of the CLI's stderr we keep for error messages. */
const STDERR_TAIL_CHARS = 2000;

/** Something that can be stopped, so shutdown can end every run in flight. */
interface ActiveRun {
  /** End the run's process and wait until it is gone. */
  stop(): Promise<void>;
}

/** Tracks the runs in flight and refuses new ones once closed. */
export class RunRegistry {
  private readonly active = new Set<ActiveRun>();
  private isClosed = false;

  /** True after {@link RunRegistry.closeAll}; new runs are refused. */
  get closed(): boolean {
    return this.isClosed;
  }

  /** Number of runs currently in flight. */
  get size(): number {
    return this.active.size;
  }

  /** Register a run. Returns a function that unregisters it. */
  add(run: ActiveRun): () => void {
    this.active.add(run);
    return () => {
      this.active.delete(run);
    };
  }

  /** Refuse new runs and stop every run in flight, waiting until their processes are gone. */
  async closeAll(): Promise<void> {
    this.isClosed = true;
    await Promise.allSettled([...this.active].map((run) => run.stop()));
  }
}

/** The part of a project's conversation that carries over between chat messages. */
export interface Conversation {
  /** Claude Code's session id from the last successful run, passed to `--resume` so follow-ups keep their context. */
  claudeSessionId?: string;
}

/** Everything the runner needs that does not change between messages. */
export interface ClaudeRunnerConfig {
  /** Folder that holds the empty workspace and the per-run folders. Created if missing. */
  workRoot: () => Promise<string>;
  /** Environment the child's environment is built from (an allow-list is applied). */
  env: NodeJS.ProcessEnv;
  /** Most agent turns per message. */
  maxTurns: number;
  /** Spending estimate that stops a run; undefined for no cap. */
  maxBudgetUsd: number | undefined;
  /** Stop a run that takes longer than this in total. */
  wallClockMs: number;
  /** Stop a run that prints nothing for this long. */
  idleMs: number;
  /** After SIGTERM, how long before the process group is killed outright. */
  killGraceMs: number;
  /** Offer `export_video` (it writes a file inside the allowed folders and cannot be undone). */
  allowIrreversible: boolean;
  /** Speech-to-text engine for the `transcribe` tool. */
  transcriber?: Transcriber;
  /** Extra text for the system prompt chosen from the user's message, for example matching editing skills. */
  context?: (message: string) => string | undefined;
  /** Receives lifecycle lines. Never given the prompt or the token. */
  log: (line: string) => void;
  /** Tracks runs so shutdown can end them. */
  registry: RunRegistry;
  /** Conversation state per open project. */
  conversations: WeakMap<Session, Conversation>;
}

/** How one attempt ended, as far as the caller needs to know. */
interface AttemptOutcome {
  /** The CLI rejected `--resume` (its saved conversation is gone) before doing any work; the caller may retry fresh. */
  staleResume: boolean;
  /** Claude Code's session id after a run that did work, for the next `--resume`. */
  sessionId?: string;
}

/** Split a stream of text chunks into lines, calling `onOverflow` instead of buffering a line that is too long. */
function lineSplitter(
  onLine: (line: string) => void,
  onOverflow: () => void,
): (chunk: string) => void {
  let buffer = "";
  return (chunk) => {
    buffer += chunk;
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line !== "") onLine(line);
      index = buffer.indexOf("\n");
    }
    if (buffer.length > MAX_LINE_BYTES) {
      buffer = "";
      onOverflow();
    }
  };
}

/** A copy of `event` with the secrets removed from every string a person will read. */
function scrubEvent(event: AgentEvent, secrets: readonly string[]): AgentEvent {
  const clean = (text: string) => redactSecrets(text, secrets);
  switch (event.type) {
    case "status":
    case "text":
      return { ...event, text: clean(event.text) };
    case "error":
      return { ...event, message: clean(event.message) };
    case "tool_result":
      return { ...event, summary: clean(event.summary) };
    default:
      return event;
  }
}

/** The last lines of stderr, flattened and shortened, for appending to an error message. */
function stderrHint(tail: string): string {
  const flat = tail.replace(/\s+/g, " ").trim();
  if (flat === "") return "";
  return ` Details: ${flat.length > 300 ? `…${flat.slice(-299)}` : flat}`;
}

/** Run Claude Code once. See the file comment for the guarantees. */
async function attempt(
  cfg: ClaudeRunnerConfig,
  install: ClaudeInstall,
  message: string,
  ctx: AgentRunContext,
  options: { resume?: string; model?: string },
): Promise<AttemptOutcome> {
  const root = await cfg.workRoot();
  // One stable empty folder is the CLI's working directory, so `--resume` finds earlier runs and the CLI never sees
  // the user's project files (it would load a project's .mcp.json and hooks otherwise).
  const workspace = join(root, "workspace");
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  // mkdtemp creates the folder with mode 0700. Only this exact folder is removed afterwards.
  const runDir = await mkdtemp(join(root, "run-"));
  const secrets: string[] = [];
  let mcp: RunningHttpServer | undefined;
  try {
    mcp = await startHttpServer({
      session: ctx.session,
      allowedRoots: [...ctx.allowedRoots],
      // Edits made through this endpoint are credited to the AI in the project history.
      source: "ai",
      allowIrreversible: cfg.allowIrreversible,
      ...(cfg.transcriber ? { transcriber: cfg.transcriber } : {}),
    });
    secrets.push(mcp.token);

    const mcpConfigPath = join(runDir, "mcp.json");
    const systemPromptPath = join(runDir, "system.txt");
    await writeFile(mcpConfigPath, buildMcpConfig(mcp.url), { mode: 0o600 });
    const extra = cfg.context?.(message);
    await writeFile(systemPromptPath, extra ? `${SYSTEM_PROMPT}\n\n${extra}` : SYSTEM_PROMPT, {
      mode: 0o600,
    });

    const args = buildClaudeArgs({
      mcpConfigPath,
      systemPromptPath,
      maxTurns: cfg.maxTurns,
      ...(cfg.maxBudgetUsd !== undefined ? { maxBudgetUsd: cfg.maxBudgetUsd } : {}),
      ...(options.model ? { model: options.model } : {}),
      ...(options.resume ? { resume: options.resume } : {}),
      capabilities: install.capabilities,
    });
    const env = buildChildEnv(cfg.env, { [TOKEN_ENV_NAME]: mcp.token, MCP_TIMEOUT: "10000" });

    return await superviseChild({
      cfg,
      install,
      args,
      env,
      workspace,
      message,
      ctx,
      mcp,
      secrets,
      options,
    });
  } finally {
    // Revoke the token first (the endpoint dies with it), then remove the files.
    await mcp?.close().catch(() => undefined);
    await rm(runDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Everything {@link superviseChild} needs. */
interface SuperviseInput {
  cfg: ClaudeRunnerConfig;
  install: ClaudeInstall;
  args: string[];
  env: Record<string, string>;
  workspace: string;
  message: string;
  ctx: AgentRunContext;
  mcp: RunningHttpServer;
  secrets: string[];
  options: { resume?: string; model?: string };
}

/** Spawn the CLI, feed it the prompt, translate its output, and make sure it is gone before returning. */
async function superviseChild(input: SuperviseInput): Promise<AttemptOutcome> {
  const { cfg, install, args, env, workspace, message, ctx, secrets, options } = input;
  const mapper = new ClaudeEventMapper();

  let terminal = false;
  let cancelled = false;
  let fatal: string | undefined;
  let initSeen = false;
  let sawOutput = false;
  let stale = false;
  let sessionId: string | undefined;
  let worked = false;
  let stderrTail = "";

  /** Forward an event unless the run already ended. `done` and `error` end it. */
  const emit = (event: AgentEvent) => {
    if (terminal) return;
    if (event.type === "done" || event.type === "error") terminal = true;
    ctx.onEvent(scrubEvent(event, secrets));
  };

  // Cancelled or shut down while the endpoint was starting: do not spawn anything.
  if (ctx.signal.aborted || cfg.registry.closed) return { staleResume: false };
  // The argument list holds paths only: the prompt is on stdin and the token is in the environment.
  cfg.log(`claude: starting ${install.path} ${args.join(" ")}`);
  const child: ChildProcess = spawn(install.path, args, {
    cwd: workspace,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    // Its own process group, so one signal reaches the CLI and any helper it started.
    detached: process.platform !== "win32",
    windowsHide: true,
  });

  let terminating = false;
  let killTimer: NodeJS.Timeout | undefined;
  /** Ask the process group to stop (SIGTERM), then force it after the grace period. */
  const terminate = () => {
    if (terminating) return;
    terminating = true;
    signalProcessTree(child, "SIGTERM");
    killTimer = setTimeout(() => signalProcessTree(child, "SIGKILL"), cfg.killGraceMs);
  };
  const fail = (text: string) => {
    fatal ??= text;
    terminate();
  };

  const closed = new Promise<{ code: number | null; spawnError?: string }>((resolve) => {
    child.once("error", (err) => resolve({ code: null, spawnError: err.message }));
    child.once("close", (code) => resolve({ code }));
  });

  const unregister = cfg.registry.add({
    async stop() {
      cancelled = true;
      terminate();
      await closed;
    },
  });
  const onAbort = () => {
    cancelled = true;
    terminate();
  };
  ctx.signal.addEventListener("abort", onAbort, { once: true });

  let idleTimer: NodeJS.Timeout | undefined;
  const bumpIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () =>
        fail(
          "Claude Code stopped responding, so I ended this request. Your edits so far are kept; you can undo them.",
        ),
      cfg.idleMs,
    );
  };
  const wallTimer = setTimeout(
    () =>
      fail(
        "This request took too long, so I ended it. Your edits so far are kept; you can undo them.",
      ),
    cfg.wallClockMs,
  );
  let afterResultTimer: NodeJS.Timeout | undefined;
  bumpIdle();

  const onLine = (line: string) => {
    // Once we decided to stop (cancel, timeout, failed start), whatever is still in the pipe is no longer wanted.
    if (terminating) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return; // Not an event (a stray log line): ignore.
    }
    sawOutput = true;
    bumpIdle();
    const rec = parsed as { type?: unknown; is_error?: unknown };
    // A failed `--resume` prints a bare error result before any init event; the caller retries without it.
    if (options.resume && !initSeen && rec.type === "result" && rec.is_error === true) {
      stale = true;
      return;
    }
    const mapped = mapper.handle(parsed);
    if (mapped.init) {
      initSeen = true;
      const status = mapped.init.mcpStatus;
      if (
        status === undefined ||
        status === "failed" ||
        status === "needs-auth" ||
        status === "disabled"
      ) {
        // Stop before the model works with tools it cannot call. (A known Claude Code failure mode.)
        fail(
          "Claude Code could not connect to dax's editing tools, so I stopped before changing anything. Try again; if it keeps happening, update Claude Code with `claude update`.",
        );
        return;
      }
      if (mapped.init.sessionId) sessionId = mapped.init.sessionId;
    }
    for (const event of mapped.events) emit(event);
    if (mapped.result) {
      worked = mapped.result.turns > 0;
      if (mapped.result.sessionId) sessionId = mapped.result.sessionId;
      if (mapped.result.deniedTools.length > 0) {
        cfg.log(`claude: blocked tools: ${[...new Set(mapped.result.deniedTools)].join(", ")}`);
      }
      // The CLI should exit right after the result; end it if it lingers (background work).
      afterResultTimer = setTimeout(terminate, cfg.killGraceMs);
    }
  };

  child.stdout?.setEncoding("utf8");
  child.stdout?.on(
    "data",
    lineSplitter(onLine, () =>
      fail("Claude Code sent an unexpectedly large message, so I stopped."),
    ),
  );
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_CHARS);
  });
  // The prompt: plain text on stdin, then end of input.
  child.stdin?.on("error", () => undefined);
  child.stdin?.end(message);

  const exit = await closed;
  // From here the process is gone (or never started).
  clearTimeout(wallTimer);
  if (idleTimer) clearTimeout(idleTimer);
  if (afterResultTimer) clearTimeout(afterResultTimer);
  if (killTimer) clearTimeout(killTimer);
  ctx.signal.removeEventListener("abort", onAbort);
  unregister();
  // Anything the CLI left behind in its process group (helper servers) is ended now.
  signalProcessTree(child, "SIGKILL");
  cfg.log(`claude: finished (exit ${exit.code ?? "none"}${cancelled ? ", cancelled" : ""})`);

  if (stale) return { staleResume: true };
  if (!terminal && !cancelled) {
    if (exit.spawnError) {
      emit({
        type: "error",
        message: `Claude Code could not be started (${exit.spawnError}). Check that it is still installed.`,
      });
    } else if (fatal) {
      emit({ type: "error", message: fatal });
    } else if (!sawOutput && exit.code === 0) {
      // Exit 0 with nothing on stdout is a known silent failure of `-p` with HTTP MCP servers.
      emit({
        type: "error",
        message: `Claude Code finished without answering.${stderrHint(stderrTail)} Try again, or update it with \`claude update\`.`,
      });
    } else {
      emit({
        type: "error",
        message: `Claude Code stopped before finishing (exit code ${exit.code ?? "unknown"}).${stderrHint(stderrTail)}`,
      });
    }
  }
  return { staleResume: false, ...(worked && sessionId ? { sessionId } : {}) };
}

/**
 * Build the runner for one chat message. The caller has already checked that Claude Code is ready.
 * @param install the executable and the options its version supports.
 * @param model model alias or name from Settings; omit to let Claude Code choose.
 */
export function createClaudeRunner(
  cfg: ClaudeRunnerConfig,
  install: ClaudeInstall,
  model?: string,
): AgentRunner {
  return {
    async run(message, ctx) {
      if (cfg.registry.closed) {
        ctx.onEvent({ type: "error", message: "dax is shutting down." });
        return;
      }
      const convo = cfg.conversations.get(ctx.session) ?? {};
      cfg.conversations.set(ctx.session, convo);
      ctx.onEvent({ type: "status", text: "Starting Claude Code..." });

      const withModel = model ? { model } : {};
      let outcome = await attempt(cfg, install, message, ctx, {
        ...withModel,
        ...(convo.claudeSessionId ? { resume: convo.claudeSessionId } : {}),
      });
      if (outcome.staleResume) {
        // Claude Code no longer has the earlier conversation (cleaned up, or a new machine): start a fresh one.
        convo.claudeSessionId = undefined;
        outcome = await attempt(cfg, install, message, ctx, withModel);
      }
      if (outcome.sessionId) convo.claudeSessionId = outcome.sessionId;
    },
  };
}
