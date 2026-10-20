/**
 * Wrapper around one `llama-server` child process: picks a free port, starts the process with
 * safe arguments, waits until the model is loaded, reports crashes, and stops it without
 * leaving orphans. It does not download anything and does not know where models live.
 */
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { ServerError } from "./errors.js";
import { listeningPids } from "./listener.js";
import {
  getFreePort,
  killTree,
  reapStaleProcess,
  registerForExitCleanup,
  removePidFile,
  withParentWatchdog,
  writePidFile,
} from "./process-guard.js";
import { LogRingBuffer } from "./ring-buffer.js";

const execFileAsync = promisify(execFile);

/** Lifecycle of a {@link LlamaServer}. `crashed` means it exited without being asked to. */
export type ServerState = "stopped" | "starting" | "running" | "stopping" | "crashed";

/** Details sent with the `crash` event. */
export interface CrashInfo {
  /** Exit code, or `null` if the process was killed by a signal. */
  code: number | null;
  /** Signal that ended the process, or `null`. */
  signal: NodeJS.Signals | null;
  /** The last lines the process printed. */
  logTail: string[];
}

/** Options for {@link LlamaServer}. */
export interface LlamaServerOptions {
  /** Absolute path of the `llama-server` executable. */
  binaryPath: string;
  /** Absolute path of the `.gguf` model file. */
  modelPath: string;
  /** Context window in tokens (`-c`). Default 16384. */
  contextSize?: number;
  /** CPU threads (`-t`). Default: let llama.cpp decide. */
  threads?: number;
  /** Number of layers to offload to the GPU (`-ngl`). Default: let llama.cpp decide. */
  gpuLayers?: number;
  /** Parallel request slots (`-np`). Default 1 so the whole context belongs to one chat. */
  parallel?: number;
  /** Whether the model may "think" before answering. Default `off`: faster and less error prone. */
  reasoning?: "on" | "off" | "auto";
  /** Fixed port. Default: a free one is chosen. */
  port?: number;
  /**
   * Bearer token the server requires on `/v1/*`. Default: a random one per launch, so other
   * programs and web pages on this computer cannot use the model. `false` disables it.
   */
  apiKey?: string | false;
  /** Extra command-line flags appended last (power users and tests). */
  extraArgs?: string[];
  /** Extra environment variables for the process. */
  env?: Record<string, string>;
  /** Maximum time to wait for the model to load, ms. Default 300000. */
  healthTimeoutMs?: number;
  /** Time between health checks, ms. Default 200. */
  healthPollMs?: number;
  /** Number of log lines kept. Default 500. */
  logLines?: number;
  /**
   * Run the child behind a shell watchdog that kills it if this process dies, even by SIGKILL.
   * POSIX only; default `true` there.
   */
  watchdog?: boolean;
  /** Pid file used to reap a server left over from a crashed earlier run. Optional. */
  pidFile?: string;
  /**
   * Replace the launched program (for tests): `command` is run with `args` followed by the
   * normal server arguments, instead of `binaryPath`.
   */
  launcher?: { command: string; args: string[] };
  /** Fetch implementation for health checks, for tests. */
  fetch?: typeof fetch;
}

/** Typed event names of {@link LlamaServer}. */
export interface LlamaServerEvents {
  /** The state changed. */
  state: [state: ServerState];
  /** One complete line of process output. */
  log: [line: string];
  /** The process ended without `stop()` being called. */
  crash: [info: CrashInfo];
}

/** Message used in the exit-code check when a port collision is suspected. */
const PORT_IN_USE = /address already in use|couldn'?t bind|failed to bind|EADDRINUSE/i;

/**
 * One running `llama-server`. Create, `start()`, use {@link LlamaServer.baseUrl} with any
 * OpenAI-compatible client (send {@link LlamaServer.apiKey} as the bearer token), then `stop()`.
 * A stopped server cannot be restarted; make a new instance.
 */
export class LlamaServer extends EventEmitter<LlamaServerEvents> {
  private readonly options: LlamaServerOptions;
  private child: ChildProcess | undefined;
  private currentState: ServerState = "stopped";
  private readonly buffer: LogRingBuffer;
  private unregister: (() => void) | undefined;
  private exited: Promise<void> | undefined;
  private stopRequested = false;
  private realPid: number | undefined;
  private chosenPort: number | undefined;
  private key: string | undefined;
  private startedAtMs = 0;
  private loadMs: number | undefined;

  /** @param options Paths and tuning for the server; nothing is started until `start()`. */
  constructor(options: LlamaServerOptions) {
    super();
    this.options = options;
    this.buffer = new LogRingBuffer(options.logLines ?? 500);
  }

  /** Current lifecycle state. */
  get state(): ServerState {
    return this.currentState;
  }

  /** Port the server listens on, once started. */
  get port(): number | undefined {
    return this.chosenPort;
  }

  /** `http://127.0.0.1:<port>/v1`, the OpenAI-compatible base URL; `undefined` until running. */
  get baseUrl(): string | undefined {
    return this.chosenPort === undefined ? undefined : `http://127.0.0.1:${this.chosenPort}/v1`;
  }

  /** Bearer token clients must send; `undefined` when authentication is disabled or not started. */
  get apiKey(): string | undefined {
    return this.key;
  }

  /** Pid of the spawned process (the shell watchdog when one is used). */
  get pid(): number | undefined {
    return this.child?.pid;
  }

  /** Pid of the actual server program (differs from `pid` when a watchdog wraps it). */
  get serverPid(): number | undefined {
    return this.realPid ?? this.child?.pid;
  }

  /** Milliseconds the last start took until the model was ready, or `undefined`. */
  get loadTimeMs(): number | undefined {
    return this.loadMs;
  }

  /** The most recent output lines of the process, oldest first (`limit` newest if given). */
  logs(limit?: number): string[] {
    return this.buffer.tail(limit);
  }

  /**
   * Resident memory of the server process in bytes, or `undefined` if it cannot be read
   * (not running, or an unsupported platform).
   */
  async memoryBytes(): Promise<number | undefined> {
    const pid = this.serverPid;
    if (pid === undefined) return undefined;
    try {
      if (process.platform === "linux") {
        const status = await readFile(`/proc/${pid}/status`, "utf8");
        const match = status.match(/VmRSS:\s+(\d+)\s+kB/);
        return match?.[1] ? Number(match[1]) * 1024 : undefined;
      }
      if (process.platform === "darwin") {
        const { stdout } = await execFileAsync("ps", ["-o", "rss=", "-p", String(pid)]);
        const kb = Number(stdout.trim());
        return Number.isFinite(kb) ? kb * 1024 : undefined;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  /**
   * Launch the process and wait until `/health` reports the model is loaded.
   *
   * Retries once with a new port if the chosen port was taken in the meantime.
   * @throws ServerError if the process cannot be spawned, exits before becoming healthy, does
   * not become healthy within `healthTimeoutMs`, or `signal` aborts (the process is killed).
   */
  async start(signal?: AbortSignal): Promise<void> {
    if (this.currentState !== "stopped") {
      throw new ServerError(`Cannot start a server that is ${this.currentState}`);
    }
    if (this.options.pidFile) await reapStaleProcess(this.options.pidFile);
    for (let attempt = 0; ; attempt++) {
      try {
        await this.launchOnce(signal);
        return;
      } catch (error) {
        const retry =
          attempt === 0 &&
          this.options.port === undefined &&
          error instanceof ServerError &&
          error.logTail.some((l) => PORT_IN_USE.test(l));
        if (!retry) throw error;
        this.buffer.push("[dax] port was taken, retrying with another port\n");
        this.currentState = "stopped";
        this.stopRequested = false;
      }
    }
  }

  private setState(state: ServerState): void {
    this.currentState = state;
    this.emit("state", state);
  }

  private async launchOnce(signal?: AbortSignal): Promise<void> {
    const o = this.options;
    this.chosenPort = o.port ?? (await getFreePort());
    this.key = o.apiKey === false ? undefined : (o.apiKey ?? randomBytes(24).toString("hex"));
    const args = [
      "--host",
      "127.0.0.1",
      "--port",
      String(this.chosenPort),
      "-m",
      o.modelPath,
      "-c",
      String(o.contextSize ?? 16384),
      "--jinja",
      "--no-webui",
      "-np",
      String(o.parallel ?? 1),
      "--reasoning",
      o.reasoning ?? "off",
    ];
    if (o.threads !== undefined) args.push("-t", String(o.threads));
    if (o.gpuLayers !== undefined) args.push("-ngl", String(o.gpuLayers));
    args.push(...(o.extraArgs ?? []));

    const base = o.launcher
      ? { command: o.launcher.command, args: [...o.launcher.args, ...args] }
      : { command: o.binaryPath, args };
    const useWatchdog = (o.watchdog ?? true) && process.platform !== "win32";
    const launch = useWatchdog ? withParentWatchdog(process.pid, base.command, base.args) : base;

    this.stopRequested = false;
    this.loadMs = undefined;
    this.setState("starting");
    this.startedAtMs = Date.now();

    // The key travels in the environment, not on the command line, where any local user could
    // read it from the process list. llama-server reads LLAMA_API_KEY. A key inherited from our
    // own environment is dropped so it cannot silently override the one we generated.
    const { LLAMA_API_KEY: _inherited, ...inheritedEnv } = { ...process.env, ...o.env };
    const env: NodeJS.ProcessEnv =
      this.key === undefined ? inheritedEnv : { ...inheritedEnv, LLAMA_API_KEY: this.key };
    // The release archives keep their shared libraries next to the executable.
    const libDir = dirname(o.binaryPath);
    if (process.platform === "linux") {
      env.LD_LIBRARY_PATH = [libDir, env.LD_LIBRARY_PATH].filter(Boolean).join(":");
    }

    let child: ChildProcess;
    try {
      child = spawn(launch.command, launch.args, {
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        // Own process group on POSIX so the whole tree can be signalled at once.
        detached: process.platform !== "win32",
      });
    } catch (error) {
      this.setState("stopped");
      throw new ServerError(`Could not start ${o.binaryPath}: ${String(error)}`);
    }
    this.child = child;
    this.realPid = undefined;

    const onData = (data: Buffer) => {
      for (const line of this.buffer.push(data.toString("utf8"))) {
        const m = line.match(/^dax-watchdog child-pid=(\d+)$/);
        if (m?.[1]) this.realPid = Number(m[1]);
        this.emit("log", line);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    const spawnError = new Promise<never>((_, reject) => {
      child.once("error", (err) =>
        reject(new ServerError(`Could not run ${o.binaryPath}: ${err.message}`)),
      );
    });
    this.exited = new Promise<void>((resolve) => {
      child.once("close", (code, sig) => {
        this.buffer.flush();
        this.unregister?.();
        this.unregister = undefined;
        if (o.pidFile) void removePidFile(o.pidFile);
        const wasStopping = this.stopRequested;
        const previous = this.currentState;
        this.child = undefined;
        if (wasStopping) {
          this.setState("stopped");
        } else if (previous === "running") {
          this.setState("crashed");
          this.emit("crash", { code, signal: sig, logTail: this.buffer.tail(40) });
        }
        // A process that dies while starting is reported by start() itself (it throws).
        resolve();
      });
    });
    this.exited.catch(() => undefined);

    this.unregister = registerForExitCleanup({
      killNow: () => {
        if (child.pid !== undefined) killTree(child.pid, "SIGKILL");
      },
    });
    if (o.pidFile && child.pid !== undefined) {
      await writePidFile(o.pidFile, {
        pid: child.pid,
        parentPid: process.pid,
        executable: o.launcher ? o.launcher.command : o.binaryPath,
        startedAt: new Date().toISOString(),
      });
    }

    try {
      await Promise.race([this.waitHealthy(child, signal), spawnError]);
    } catch (error) {
      const wasExited = child.exitCode !== null || child.signalCode !== null;
      this.stopRequested = true;
      if (child.pid !== undefined && !wasExited) killTree(child.pid, "SIGKILL");
      await this.exited;
      this.stopRequested = false;
      if (this.currentState !== "stopped") this.setState("stopped");
      const tail = this.buffer.tail(40);
      if (error instanceof ServerError) {
        throw new ServerError(error.message.split("\n--- last log")[0] ?? error.message, tail);
      }
      throw error;
    }
    this.loadMs = Date.now() - this.startedAtMs;
    this.setState("running");
  }

  private async waitHealthy(child: ChildProcess, signal?: AbortSignal): Promise<void> {
    const o = this.options;
    const doFetch = o.fetch ?? fetch;
    const deadline = Date.now() + (o.healthTimeoutMs ?? 300_000);
    const url = `http://127.0.0.1:${this.chosenPort}/health`;
    for (;;) {
      if (signal?.aborted) throw new ServerError("Starting the server was cancelled");
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new ServerError(
          `llama-server exited during start-up (code ${child.exitCode}, signal ${child.signalCode})`,
        );
      }
      let healthy = false;
      try {
        const response = await doFetch(url, { signal: AbortSignal.timeout(2000) });
        healthy = response.status === 200;
        // 503 means "model still loading"; anything else is also worth another try.
        if (!healthy) await response.body?.cancel();
      } catch {
        // connection refused while the process is still starting
      }
      if (healthy) {
        // A 200 only counts once the listener is shown to be ours: the port may belong to another
        // program, and the caller sends the API key to whatever answers there. Checked outside the
        // try above so a refusal is not swallowed.
        await this.assertOwnListener(child);
        return;
      }
      if (Date.now() > deadline) {
        throw new ServerError(
          `llama-server was not healthy after ${o.healthTimeoutMs ?? 300_000} ms`,
        );
      }
      await new Promise((r) => setTimeout(r, o.healthPollMs ?? 200));
    }
  }

  /**
   * Confirm that the process listening on our port is the one we spawned, or the server it wraps
   * (the watchdog's child). Fails closed: a listener that cannot be identified is refused.
   *
   * @throws ServerError when another process holds the port, or the owner cannot be determined.
   */
  private async assertOwnListener(child: ChildProcess): Promise<void> {
    const port = this.chosenPort;
    if (port === undefined) throw new ServerError("No port was chosen for the server");
    const ours = [child.pid, this.realPid].filter((pid): pid is number => pid !== undefined);
    const listeners = await listeningPids(port);
    if (listeners === undefined) {
      throw new ServerError(
        `Could not confirm which process listens on port ${port}; not sending the API key to it`,
      );
    }
    if (!listeners.some((pid) => ours.includes(pid))) {
      throw new ServerError(
        `Port ${port} is answered by a process that is not the llama-server this app started; not sending the API key to it`,
      );
    }
  }

  /**
   * Stop the process and everything it spawned: SIGTERM first, SIGKILL after `graceMs`.
   * Resolves when the process is gone. Safe to call in any state, and more than once.
   */
  async stop(graceMs = 5000): Promise<void> {
    const child = this.child;
    if (!child || child.pid === undefined || this.currentState === "stopped") {
      if (this.currentState === "crashed") this.setState("stopped");
      return;
    }
    this.stopRequested = true;
    if (this.currentState !== "stopping") this.setState("stopping");
    killTree(child.pid, "SIGTERM");
    const timer = setTimeout(() => {
      if (child.pid !== undefined) killTree(child.pid, "SIGKILL");
    }, graceMs);
    try {
      await this.exited;
    } finally {
      clearTimeout(timer);
    }
  }
}
