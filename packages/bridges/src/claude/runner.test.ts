// End-to-end tests of the Claude bridge with a fake `claude` executable: a real loopback MCP endpoint on a real core Session,
// a real child process, no network and no real CLI. Covers events, edits landing with source ai, the tool allow-list flags,
// secrets, cancel, timeouts, cleanup and shutdown.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { emptyProject, Session } from "@dax/core";
import type { AgentEvent } from "@dax/protocol";
import type { AgentRunner, RunnerEnv } from "@dax/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CliBridges, type CliBridgesOptions, createCliBridges } from "../bridges.js";
import {
  type FakeCall,
  type FakeCli,
  type FakeScenario,
  isAlive,
  makeTempDir,
  removeTempDir,
  waitFor,
  writeFakeCli,
} from "../test/fake-cli.js";

let dir: string; // holds the fake executable
let dataDir: string; // the "engine data folder"
let bridges: CliBridges | undefined;
let logLines: string[];

beforeEach(() => {
  dir = makeTempDir("dax-run-bin-");
  dataDir = makeTempDir("dax-run-data-");
  logLines = [];
});
afterEach(async () => {
  await bridges?.close();
  bridges = undefined;
  removeTempDir(dir);
  removeTempDir(dataDir);
});

/** Settings shaped like the server's, with the Claude CLI active. */
function runnerEnv(model?: string): RunnerEnv {
  return {
    settings: {
      activeProvider: "cli-claude",
      providers: model ? { "cli-claude": { model } } : {},
    },
    getApiKey: async () => undefined,
  };
}

interface Harness {
  fake: FakeCli;
  bridges: CliBridges;
  session: Session;
  /** Run one chat message to completion. */
  chat(
    message: string,
    options?: { signal?: AbortSignal; model?: string; session?: Session },
  ): Promise<AgentEvent[]>;
  /** The runner for the next message, to start a run without awaiting it. */
  runner(model?: string): Promise<AgentRunner>;
  /** The newest recorded `run` call of the fake. */
  lastRun(): FakeCall;
}

function harness(scenario: FakeScenario = {}, options: CliBridgesOptions = {}): Harness {
  const fake = writeFakeCli(dir, {
    sigtermMarker: join(dir, "sigterm.marker"),
    ...scenario,
  });
  const made = createCliBridges({
    dataDir,
    env: {
      PATH: dir,
      HOME: dir,
      ANTHROPIC_API_KEY: "sk-ant-must-not-reach-the-child",
      CLAUDE_CODE_OAUTH_TOKEN: "oauth-must-not-reach-the-child",
    },
    binaries: { claude: fake.path },
    locate: { commonDirs: [] },
    killGraceMs: 400,
    log: (line) => logLines.push(line),
    ...options,
  });
  bridges = made;
  const session = new Session(emptyProject("test"));
  const getRunner = async (model?: string) => {
    const runner = await made.extraProviders("cli-claude", runnerEnv(model));
    if (!runner) throw new Error("no runner");
    return runner;
  };
  return {
    fake,
    bridges: made,
    session,
    runner: getRunner,
    async chat(message, opts = {}) {
      const events: AgentEvent[] = [];
      const runner = await getRunner(opts.model);
      await runner.run(message, {
        session: opts.session ?? session,
        signal: opts.signal ?? new AbortController().signal,
        allowedRoots: [dataDir],
        onEvent: (e) => events.push(e),
      });
      return events;
    },
    lastRun() {
      const runs = fake.calls().filter((c) => c.mode === "run");
      const last = runs[runs.length - 1];
      if (!last) throw new Error("the fake CLI was never run");
      return last;
    },
  };
}

/** The `run-*` folders left under the bridge's work folder. */
function leftoverRunDirs(): string[] {
  const root = join(dataDir, "bridges");
  return existsSync(root) ? readdirSync(root).filter((n) => n.startsWith("run-")) : [];
}

const terminal = (events: AgentEvent[]) =>
  events.filter((e) => e.type === "done" || e.type === "error");

describe("a normal run", () => {
  it("edits the live session through MCP, credited to the AI in the history, and reports it in the chat", async () => {
    const h = harness({
      run: [
        { callTool: { name: "get_project" } },
        { callTool: { name: "set_format", args: { preset: "square-1080" } } },
        { text: "The format is now square.", stream: true },
        { result: { num_turns: 3 } },
      ],
    });
    const events = await h.chat("make it square");

    // The edit is in the engine's own session...
    expect(h.session.project.timeline.width).toBe(1080);
    expect(h.session.project.timeline.height).toBe(1080);
    // ...and the history says the AI did it.
    const history = h.session.history();
    expect(history[history.length - 1]).toMatchObject({
      label: "Change format",
      source: "ai",
      current: true,
    });
    expect(history.filter((x) => x.source === "ai")).toHaveLength(1);

    // The chat saw status, both tool calls with results, the streamed answer, and exactly one done.
    expect(events[0]).toEqual({ type: "status", text: "Starting Claude Code..." });
    const names = events
      .filter((e) => e.type === "tool_call")
      .map((e) => (e.type === "tool_call" ? e.name : ""));
    expect(names).toEqual(["get_project", "set_format"]);
    expect(events.find((e) => e.type === "tool_result" && e.name === "set_format")).toMatchObject({
      ok: true,
      summary: "Format is now 1080x1080 at 30 fps (fit: blur).",
    });
    const text = events.map((e) => (e.type === "text" ? e.text : "")).join("");
    expect(text.trim()).toBe("The format is now square.");
    expect(terminal(events)).toHaveLength(1);
    expect(events[events.length - 1]).toMatchObject({ type: "done", turns: 3 });
  });

  it("reports a failing tool as not ok and still finishes", async () => {
    const h = harness({
      run: [
        { callTool: { name: "remove_clip", args: { clipId: "nope" } } },
        { text: "That clip does not exist." },
        { result: {} },
      ],
    });
    const events = await h.chat("remove clip nope");
    const result = events.find((e) => e.type === "tool_result");
    expect(result).toMatchObject({ name: "remove_clip", ok: false });
    expect(terminal(events)).toEqual([expect.objectContaining({ type: "done" })]);
    expect(h.session.history().filter((x) => x.source === "ai")).toHaveLength(0);
  });

  it("replays a recorded real run without duplicating text", async () => {
    const h = harness({ run: [{ replay: "claude-edit.jsonl" }] });
    const events = await h.chat("anything");
    const text = events.map((e) => (e.type === "text" ? e.text : "")).join("");
    expect(text).toContain("The final format is 1920x1080");
    expect(text.match(/The final format/g)).toHaveLength(1);
    expect(terminal(events)).toEqual([expect.objectContaining({ type: "done", turns: 5 })]);
  });

  it("runs in an empty private folder, never in the project or the process folder", async () => {
    const h = harness({ run: [{ result: {} }] });
    await h.chat("hi");
    expect(h.lastRun().cwd).toBe(join(dataDir, "bridges", "workspace"));
    expect(readdirSync(join(dataDir, "bridges", "workspace"))).toEqual([]);
  });

  it("removes its per-run files and closes the endpoint after the run", async () => {
    const h = harness({ run: [{ result: {} }] });
    await h.chat("hi");
    expect(leftoverRunDirs()).toEqual([]);
    const url = (
      JSON.parse(h.lastRun().configText ?? "{}") as { mcpServers: { dax: { url: string } } }
    ).mcpServers.dax.url;
    await expect(fetch(url, { method: "POST" })).rejects.toThrow();
  });
});

describe("the tool allow-list", () => {
  it("starts the CLI with only our tools allowed, built-ins removed and denial instead of prompts", async () => {
    const h = harness({ run: [{ result: {} }] });
    await h.chat("hi");
    const args = h.lastRun().args ?? [];
    const valueAfter = (flag: string) => args[args.indexOf(flag) + 1];
    expect(args).toContain("--strict-mcp-config");
    expect(valueAfter("--tools")).toBe("");
    expect(valueAfter("--allowedTools")).toBe("mcp__dax__*");
    expect(valueAfter("--disallowedTools")).toContain("Bash");
    expect(valueAfter("--disallowedTools")).toContain("Write");
    expect(valueAfter("--permission-mode")).toBe("dontAsk");
    expect(valueAfter("--permission-prompts")).toBe("none");
    expect(valueAfter("--max-turns")).toBe("25");
    expect(args.join(" ")).not.toMatch(/--bare|--dangerously|bypassPermissions|--safe-mode/);
  });

  it("serves only the dax editing tools to the CLI: the core commands plus preview_frame, nothing like a shell", async () => {
    const h = harness({ run: [{ recordTools: true }, { result: {} }] });
    await h.chat("hi");
    const offered = h.fake.calls().find((c) => c.mode === "tools")?.tools ?? [];
    expect(offered).toEqual(
      expect.arrayContaining([
        "mcp__dax__get_project",
        "mcp__dax__set_format",
        "mcp__dax__undo",
        "mcp__dax__preview_frame",
      ]),
    );
    for (const name of offered) expect(name.startsWith("mcp__dax__")).toBe(true);
    expect(offered.join(" ")).not.toMatch(/bash|shell|exec|write_file|ffmpeg/i);
  });

  it("gives the CLI the system prompt and any skill context, on a file", async () => {
    const h = harness(
      { run: [{ result: {} }] },
      { context: (m) => `SKILL for "${m.slice(0, 5)}"` },
    );
    await h.chat("trim the intro please");
    const run = h.lastRun();
    expect(run.systemPrompt).toContain("mcp__dax__");
    expect(run.systemPrompt).toContain('SKILL for "trim "');
  });

  it("passes the model chosen in Settings, and refuses a name that could be read as an option", async () => {
    const h = harness({ run: [{ result: {} }] });
    await h.chat("hi", { model: "sonnet" });
    const args = h.lastRun().args ?? [];
    expect(args[args.indexOf("--model") + 1]).toBe("sonnet");

    const before = h.fake.calls().length;
    const events = await h.chat("hi", { model: "--dangerously-skip-permissions" });
    expect(events).toEqual([
      { type: "error", message: expect.stringContaining("not a valid model name") },
    ]);
    // Nothing was spawned for the refused run (detection answers are cached).
    expect(h.fake.calls().length).toBe(before);
  });
});

describe("secrets", () => {
  it("keeps the token out of argv, files, the prompt, logs and chat events, while the CLI still receives it", async () => {
    const h = harness({
      run: [
        { leakTokenToStderr: true },
        { leakTokenToText: true },
        { callTool: { name: "get_project" } },
        { result: {} },
      ],
    });
    const message = "my password is hunter2-secret, please keep it quiet";
    const events = await h.chat(message);
    const run = h.lastRun();
    const token = run.token ?? "";

    // The CLI got a strong per-run token in its environment, which is how the config file's placeholder is filled in.
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(run.envKeys).toContain("DAX_MCP_TOKEN");
    // It is not in anything else.
    expect(JSON.stringify(run.args)).not.toContain(token);
    expect(run.configText).not.toContain(token);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal placeholder that the CLI expands itself
    expect(run.configText).toContain("${DAX_MCP_TOKEN}");
    expect(run.systemPrompt).not.toContain(token);
    expect(JSON.stringify(events)).not.toContain(token);
    expect(logLines.join("\n")).not.toContain(token);
    // The CLI itself echoed it into the text stream; the bridge scrubbed it before the chat saw it.
    expect(JSON.stringify(events)).toContain("my token is [redacted]");

    // The prompt travels on stdin only: not on the command line, not in a log line, not in an event.
    expect(run.prompt).toBe(message);
    expect(JSON.stringify(run.args)).not.toContain("hunter2");
    expect(logLines.join("\n")).not.toContain("hunter2");
    expect(logLines.join("\n")).not.toContain("password");
    expect(JSON.stringify(events)).not.toContain("hunter2");
  });

  it("scrubs the token from a failure message built from the CLI's stderr", async () => {
    const h = harness({ run: [{ leakTokenToStderr: true }], exitCode: 3 });
    const events = await h.chat("hi");
    const token = h.lastRun().token ?? "";
    expect(events[events.length - 1]).toMatchObject({
      type: "error",
      message: expect.stringContaining("[redacted]"),
    });
    expect(JSON.stringify(events)).not.toContain(token);
    expect(logLines.join("\n")).not.toContain(token);
  });

  it("does not pass API keys, OAuth tokens or the rest of our environment to the CLI", async () => {
    const h = harness({ run: [{ result: {} }] });
    await h.chat("hi");
    const keys = h.lastRun().envKeys;
    expect(keys).not.toContain("ANTHROPIC_API_KEY");
    expect(keys).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
    expect(keys).toContain("PATH");
    expect(keys).toContain("HOME");
    expect(keys).toContain("NO_PROXY");
  });

  it("uses a different token for every run", async () => {
    const h = harness({ run: [{ result: {} }] });
    await h.chat("one");
    await h.chat("two");
    const runs = h.fake.calls().filter((c) => c.mode === "run");
    expect(runs).toHaveLength(2);
    expect(runs[0]?.token).not.toBe(runs[1]?.token);
  });

  it("writes the per-run files with owner-only permissions", async () => {
    // Observe the folder while the run is in progress.
    const h = harness({ run: [{ hang: true }] });
    const controller = new AbortController();
    const running = h.chat("hi", { signal: controller.signal });
    await waitFor(
      () => leftoverRunDirs().length === 1 && h.fake.calls().some((c) => c.mode === "run"),
    );
    const [runDirName] = leftoverRunDirs();
    const root = join(dataDir, "bridges", runDirName ?? "");
    expect(statSync(root).mode & 0o077).toBe(0);
    expect(statSync(join(root, "mcp.json")).mode & 0o077).toBe(0);
    controller.abort();
    await running;
  });
});

describe("failures", () => {
  it("stops before the model works when the CLI could not connect to our tools", async () => {
    const h = harness({
      connect: false,
      run: [{ text: '<invoke name="mcp__dax__get_project"></invoke>' }, { result: {} }],
    });
    const events = await h.chat("hi");
    expect(terminal(events)).toEqual([
      {
        type: "error",
        message: expect.stringContaining("could not connect to dax's editing tools"),
      },
    ]);
    // Nothing the model "said" without tools reached the chat.
    expect(events.some((e) => e.type === "text")).toBe(false);
  });

  it("reports a CLI that exits without a result, with its stderr", async () => {
    const h = harness({
      run: [{ text: "partial" }, { stderr: "something broke inside the CLI" }],
      exitCode: 2,
    });
    const events = await h.chat("hi");
    const last = events[events.length - 1];
    expect(last).toMatchObject({ type: "error", message: expect.stringContaining("exit code 2") });
    expect(last).toMatchObject({
      message: expect.stringContaining("something broke inside the CLI"),
    });
    expect(terminal(events)).toHaveLength(1);
  });

  it("reports a silent exit 0 instead of pretending it worked", async () => {
    const h = harness({ exitBeforeInit: 0 });
    const events = await h.chat("hi");
    expect(events[events.length - 1]).toMatchObject({
      type: "error",
      message: expect.stringContaining("finished without answering"),
    });
  });

  it("tells the user to sign in when the CLI says it is signed out", async () => {
    const h = harness({
      run: [
        {
          emit: {
            type: "result",
            subtype: "success",
            is_error: true,
            num_turns: 1,
            result: "Not logged in · Please run /login",
            session_id: "s",
            usage: {},
            permission_denials: [],
          },
        },
      ],
      exitCode: 1,
    });
    const events = await h.chat("hi");
    expect(events[events.length - 1]).toMatchObject({
      type: "error",
      message: expect.stringContaining("Run `claude` once in a terminal to sign in"),
    });
  });

  it("explains the turn limit", async () => {
    const h = harness({
      run: [
        {
          emit: {
            type: "result",
            subtype: "error_max_turns",
            is_error: true,
            num_turns: 25,
            session_id: "s",
            usage: {},
            permission_denials: [],
          },
        },
      ],
      exitCode: 1,
    });
    const events = await h.chat("hi");
    expect(events[events.length - 1]).toMatchObject({
      type: "error",
      message: expect.stringContaining("25 steps"),
    });
  });

  it("flags a run that bills an API key", async () => {
    const h = harness({ apiKeySource: "ANTHROPIC_API_KEY", run: [{ result: {} }] });
    const events = await h.chat("hi");
    expect(events.find((e) => e.type === "status" && e.text.includes("billed"))).toBeDefined();
  });

  it("explains when the CLI is not installed instead of failing obscurely", async () => {
    const missing = createCliBridges({ env: { PATH: dir }, locate: { commonDirs: [] } });
    const runner = await missing.extraProviders("cli-claude", runnerEnv());
    const events: AgentEvent[] = [];
    await runner?.run("hi", {
      session: new Session(emptyProject("t")),
      signal: new AbortController().signal,
      allowedRoots: [dataDir],
      onEvent: (e) => events.push(e),
    });
    await missing.close();
    expect(events).toEqual([
      { type: "error", message: expect.stringMatching(/not installed.*sign in/is) },
    ]);
  });
});

describe("cancel", () => {
  it("ends the CLI with SIGTERM, leaves no process, endpoint or files, and reports nothing more", async () => {
    const h = harness({ run: [{ hang: true }] });
    const controller = new AbortController();
    const events: AgentEvent[] = [];
    const runner = await h.runner();
    const running = runner.run("hi", {
      session: h.session,
      signal: controller.signal,
      allowedRoots: [dataDir],
      onEvent: (e) => events.push(e),
    });
    expect(await waitFor(() => h.fake.calls().some((c) => c.mode === "run"))).toBe(true);
    const pid = h.lastRun().pid ?? 0;
    expect(isAlive(pid)).toBe(true);
    const url = (
      JSON.parse(h.lastRun().configText ?? "{}") as { mcpServers: { dax: { url: string } } }
    ).mcpServers.dax.url;

    const started = Date.now();
    controller.abort();
    await running;
    expect(Date.now() - started).toBeLessThan(3000);

    expect(isAlive(pid)).toBe(false);
    expect(readFileSync(join(dir, "sigterm.marker"), "utf8")).toBe("SIGTERM");
    await expect(fetch(url, { method: "POST" })).rejects.toThrow();
    expect(leftoverRunDirs()).toEqual([]);
    // The server reports "Cancelled." itself; the bridge adds no done or error.
    expect(terminal(events)).toEqual([]);
  });

  it("kills a CLI that ignores SIGTERM once the grace period passes", async () => {
    const h = harness({ ignoreSigterm: true, run: [{ hang: true }] });
    const controller = new AbortController();
    const runner = await h.runner();
    const running = runner.run("hi", {
      session: h.session,
      signal: controller.signal,
      allowedRoots: [dataDir],
      onEvent: () => undefined,
    });
    await waitFor(() => h.fake.calls().some((c) => c.mode === "run"));
    const pid = h.lastRun().pid ?? 0;
    const started = Date.now();
    controller.abort();
    await running;
    expect(Date.now() - started).toBeGreaterThanOrEqual(350); // waited for the 400 ms grace
    expect(isAlive(pid)).toBe(false);
  });

  it("does not start anything when already cancelled", async () => {
    const h = harness({ run: [{ result: {} }] });
    const controller = new AbortController();
    controller.abort();
    const events = await h.chat("hi", { signal: controller.signal });
    expect(h.fake.calls().filter((c) => c.mode === "run")).toEqual([]);
    expect(terminal(events)).toEqual([]);
  });

  it("ends helper processes the CLI started, both when cancelled and when the run ends normally", async () => {
    // Cancelled while helpers are running.
    const h = harness({ run: [{ spawnGrandchild: true }, { hang: true }] });
    const controller = new AbortController();
    const runner = await h.runner();
    const running = runner.run("hi", {
      session: h.session,
      signal: controller.signal,
      allowedRoots: [dataDir],
      onEvent: () => undefined,
    });
    expect(await waitFor(() => h.fake.grandchildPids().length === 1)).toBe(true);
    const [helper] = h.fake.grandchildPids();
    expect(isAlive(helper ?? 0)).toBe(true);
    controller.abort();
    await running;
    expect(await waitFor(() => !isAlive(helper ?? 0))).toBe(true);
  });

  it("reaps helpers left behind by a run that finished normally", async () => {
    const h = harness({ run: [{ spawnGrandchild: true }, { result: {} }] });
    await h.chat("hi");
    const [helper] = h.fake.grandchildPids();
    expect(helper).toBeGreaterThan(0);
    expect(await waitFor(() => !isAlive(helper ?? 0))).toBe(true);
  });
});

describe("timeouts", () => {
  it("ends a CLI that goes quiet", async () => {
    // The idle clock starts at spawn, so leave room for the fake's own start-up before it prints its first line.
    const h = harness({ run: [{ hang: true }] }, { idleMs: 2500 });
    const events = await h.chat("hi");
    expect(events[events.length - 1]).toMatchObject({
      type: "error",
      message: expect.stringContaining("stopped responding"),
    });
    expect(isAlive(h.lastRun().pid ?? 0)).toBe(false);
  });

  it("ends a run that takes too long overall, even while it keeps printing", async () => {
    const chatter = Array.from({ length: 30 }, () => [
      { sleep: 100 },
      { emit: { type: "system", subtype: "status", status: "requesting" } },
    ]).flat();
    const h = harness({ run: chatter }, { wallClockMs: 2500, idleMs: 60_000 });
    const events = await h.chat("hi");
    expect(events[events.length - 1]).toMatchObject({
      type: "error",
      message: expect.stringContaining("took too long"),
    });
    expect(isAlive(h.lastRun().pid ?? 0)).toBe(false);
  });
});

describe("shutdown", () => {
  it("stops a run in flight, then refuses new ones", async () => {
    const h = harness({ run: [{ hang: true }] });
    const events: AgentEvent[] = [];
    const runner = await h.runner();
    const running = runner.run("hi", {
      session: h.session,
      signal: new AbortController().signal,
      allowedRoots: [dataDir],
      onEvent: (e) => events.push(e),
    });
    await waitFor(() => h.fake.calls().some((c) => c.mode === "run"));
    const pid = h.lastRun().pid ?? 0;

    await h.bridges.close();
    await running;
    expect(isAlive(pid)).toBe(false);
    expect(leftoverRunDirs()).toEqual([]);

    const later = await runner.run("again", {
      session: h.session,
      signal: new AbortController().signal,
      allowedRoots: [dataDir],
      onEvent: (e) => events.push(e),
    });
    expect(later).toBeUndefined();
    expect(events[events.length - 1]).toEqual({ type: "error", message: "dax is shutting down." });
    await h.bridges.close(); // twice is fine
  });

  it("removes the temporary folder it made when no data folder was given", async () => {
    const fake = writeFakeCli(dir, { run: [{ result: {} }] });
    const b = createCliBridges({
      env: { PATH: dir, HOME: dir },
      binaries: { claude: fake.path },
      locate: { commonDirs: [] },
    });
    const session = new Session(emptyProject("t"));
    const runner = await b.extraProviders("cli-claude", runnerEnv());
    await runner?.run("hi", {
      session,
      signal: new AbortController().signal,
      allowedRoots: [dir],
      onEvent: () => undefined,
    });
    const cwd = fake.calls().find((c) => c.mode === "run")?.cwd ?? "";
    const root = join(cwd, "..");
    expect(existsSync(root)).toBe(true);
    await b.close();
    expect(existsSync(root)).toBe(false);
    // Only that folder went away: the folder holding the fake is untouched.
    expect(existsSync(fake.path)).toBe(true);
  });
});

describe("conversation", () => {
  it("continues the same Claude Code conversation for follow-up messages in one project", async () => {
    const h = harness({
      sessionId: "11111111-1111-4111-8111-111111111111",
      run: [{ text: "ok" }, { result: {} }],
    });
    await h.chat("first");
    await h.chat("second");
    const runs = h.fake.calls().filter((c) => c.mode === "run");
    expect(runs[0]?.args).not.toContain("--resume");
    const args = runs[1]?.args ?? [];
    expect(args[args.indexOf("--resume") + 1]).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("starts a fresh conversation for another project", async () => {
    const h = harness({ run: [{ text: "ok" }, { result: {} }] });
    await h.chat("first");
    await h.chat("second", { session: new Session(emptyProject("other")) });
    const runs = h.fake.calls().filter((c) => c.mode === "run");
    expect(runs[1]?.args).not.toContain("--resume");
  });

  it("silently starts over when Claude Code has lost the saved conversation", async () => {
    const h = harness({ resumeFails: true, run: [{ text: "ok" }, { result: {} }] });
    await h.chat("first");
    const events = await h.chat("second");
    const runs = h.fake.calls().filter((c) => c.mode === "run");
    expect(runs).toHaveLength(3); // first, the failed resume, the retry
    expect(runs[1]?.args).toContain("--resume");
    expect(runs[2]?.args).not.toContain("--resume");
    expect(terminal(events)).toEqual([expect.objectContaining({ type: "done" })]);
    expect(events.some((e) => e.type === "error")).toBe(false);
  });
});

describe("slash commands", () => {
  it("sends a message that starts with a slash as plain text, with slash commands disabled", async () => {
    const h = harness({ run: [{ result: {} }] });
    await h.chat("/clear everything");
    expect(h.lastRun().prompt).toBe("/clear everything");
    expect(h.lastRun().args).toContain("--disable-slash-commands");
  });
});
