// Tests for the registry-facing API: provider statuses (not installed / not signed in / ready), Codex detection-only,
// the Gemini decision, and the runners handed to the engine.

import { emptyProject, Session } from "@dax/core";
import type { AgentEvent } from "@dax/protocol";
import type { RunnerEnv } from "@dax/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCliBridges } from "./bridges.js";
import { type FakeScenario, makeTempDir, removeTempDir, writeFakeCli } from "./test/fake-cli.js";

let dir: string;
beforeEach(() => {
  dir = makeTempDir("dax-bridges-");
});
afterEach(() => removeTempDir(dir));

const env: RunnerEnv = {
  settings: { activeProvider: "cli-claude", providers: {} },
  getApiKey: async () => undefined,
};

/** Bridges whose search sees only `dir`. */
function bridgesWith(files: { claude?: FakeScenario; codex?: FakeScenario } = {}, extra = {}) {
  if (files.claude) writeFakeCli(dir, files.claude, "claude");
  if (files.codex) writeFakeCli(dir, { version: "codex-cli 0.9.1", ...files.codex }, "codex");
  return createCliBridges({ env: { PATH: dir, HOME: dir }, locate: { commonDirs: [] }, ...extra });
}

/** Run a message through the runner for `kind` and return the events. */
async function ask(
  bridges: ReturnType<typeof createCliBridges>,
  kind: Parameters<typeof bridges.extraProviders>[0],
) {
  const runner = await bridges.extraProviders(kind, env);
  const events: AgentEvent[] = [];
  await runner?.run("hi", {
    session: new Session(emptyProject("t")),
    signal: new AbortController().signal,
    allowedRoots: [dir],
    onEvent: (e) => events.push(e),
  });
  return { runner, events };
}

describe("statuses", () => {
  it("reports all three cli providers when nothing is installed, with plain next steps", async () => {
    const bridges = bridgesWith();
    const statuses = await bridges.statuses();
    expect(statuses.map((s) => s.kind)).toEqual(["cli-claude", "cli-codex", "cli-gemini"]);
    expect(statuses.every((s) => s.available === false)).toBe(true);
    expect(statuses[0]?.detail).toMatch(
      /not installed.*run `claude` once in a terminal to sign in/is,
    );
    expect(statuses[1]?.detail).toMatch(/not installed/i);
    await bridges.close();
  });

  it("reports Claude Code installed but signed out", async () => {
    const bridges = bridgesWith({ claude: { auth: { exit: 1, stdout: { loggedIn: false } } } });
    const [claude] = await bridges.statuses();
    expect(claude).toEqual({
      kind: "cli-claude",
      available: false,
      signedIn: false,
      detail:
        "Claude Code is installed but not signed in. Run `claude` once in a terminal to sign in.",
    });
    await bridges.close();
  });

  it("reports Claude Code ready", async () => {
    const bridges = bridgesWith({ claude: {} });
    const [claude] = await bridges.statuses();
    expect(claude).toMatchObject({ kind: "cli-claude", available: true, signedIn: true });
    expect(claude?.detail).toMatch(/^Ready/);
    await bridges.close();
  });

  it("answers within the deadline even when a check is slow, and has the real answer next time", async () => {
    const bridges = bridgesWith({ claude: { authDelayMs: 1500 } }, { statusDeadlineMs: 250 });
    const started = Date.now();
    const [first] = await bridges.statuses();
    expect(Date.now() - started).toBeLessThan(1200);
    expect(first).toMatchObject({ kind: "cli-claude", available: false });
    expect(first?.detail).toMatch(/still checking/i);
    // The check keeps running in the background; once it finishes the answer is cached.
    await new Promise((r) => setTimeout(r, 2200));
    const [second] = await bridges.statuses();
    expect(second).toMatchObject({ available: true });
    await bridges.close();
  });
});

describe("Codex CLI", () => {
  it("is detected but not supported yet, with the sign-in state it reports", async () => {
    const bridges = bridgesWith({ codex: { loginText: "Logged in using ChatGPT" } });
    const codex = (await bridges.statuses())[1];
    expect(codex).toMatchObject({ kind: "cli-codex", available: false, signedIn: true });
    expect(codex?.detail).toContain("0.9.1");
    expect(codex?.detail).toMatch(/signed in with ChatGPT/);
    expect(codex?.detail).toMatch(/not supported yet/);
    await bridges.close();
  });

  it("notes when it is installed but signed out, and keeps the sign-in method private", async () => {
    const bridges = bridgesWith({ codex: { loginText: "Not logged in", loginExit: 1 } });
    const codex = (await bridges.statuses())[1];
    expect(codex).toMatchObject({ available: false, signedIn: false });
    expect(codex?.detail).toMatch(/not signed in/);
    await bridges.close();
  });

  it("never prints an API key shown by the CLI", async () => {
    const bridges = bridgesWith({
      codex: { loginText: "Logged in using an API key - sk-proj-abc123SECRET" },
    });
    const codex = (await bridges.statuses())[1];
    expect(JSON.stringify(codex)).not.toContain("sk-proj");
    expect(codex?.detail).toMatch(/an API key/);
    await bridges.close();
  });

  it("gets a runner that explains it is not supported, and starts nothing", async () => {
    const bridges = bridgesWith({ codex: { loginText: "Logged in using ChatGPT" } });
    const { events } = await ask(bridges, "cli-codex");
    expect(events).toEqual([
      { type: "error", message: expect.stringContaining("not supported yet") },
    ]);
    await bridges.close();
  });
});

describe("Gemini", () => {
  it("is deliberately not supported and says why", async () => {
    const bridges = bridgesWith();
    const gemini = (await bridges.statuses())[2];
    expect(gemini).toMatchObject({ kind: "cli-gemini", available: false });
    expect(gemini?.detail).toMatch(/terms/i);
    expect(gemini?.detail).toMatch(/API key/);
    const { events } = await ask(bridges, "cli-gemini");
    expect(events[0]).toMatchObject({ type: "error" });
    await bridges.close();
  });
});

describe("extraProviders", () => {
  it("returns nothing for providers it does not own", async () => {
    const bridges = bridgesWith({ claude: {} });
    for (const kind of ["anthropic", "openai-compatible", "local"] as const) {
      expect(await bridges.extraProviders(kind, env)).toBeUndefined();
    }
    await bridges.close();
  });

  it("explains a signed-out Claude Code in the chat", async () => {
    const bridges = bridgesWith({ claude: { auth: { exit: 1, stdout: { loggedIn: false } } } });
    const { events } = await ask(bridges, "cli-claude");
    expect(events).toEqual([
      {
        type: "error",
        message: expect.stringContaining("Run `claude` once in a terminal to sign in"),
      },
    ]);
    await bridges.close();
  });

  it("reads DAX_CLAUDE_BIN from the environment it was given", async () => {
    const fake = writeFakeCli(dir, {}, "my-claude-copy");
    const bridges = createCliBridges({
      env: { PATH: "/nonexistent", HOME: dir, DAX_CLAUDE_BIN: fake.path },
      locate: { commonDirs: [] },
    });
    expect((await bridges.statuses())[0]).toMatchObject({ available: true });
    await bridges.close();
  });
});
