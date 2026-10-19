// Tests for Claude Code detection against a fake executable: not installed, too old, not signed in, ready, slow, and hygiene.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FakeScenario, makeTempDir, removeTempDir, writeFakeCli } from "../test/fake-cli.js";
import { ClaudeDetector, type ClaudeDetectorOptions } from "./detect.js";

let dir: string;
beforeEach(() => {
  dir = makeTempDir("dax-detect-");
});
afterEach(() => removeTempDir(dir));

/** A detector pointed at a fake CLI with the given behavior. */
function detectorFor(scenario: FakeScenario, options: ClaudeDetectorOptions = {}) {
  const fake = writeFakeCli(dir, scenario);
  const detector = new ClaudeDetector({
    env: { PATH: dir, HOME: dir },
    locate: { commonDirs: [] },
    ...options,
  });
  return { fake, detector };
}

describe("not installed", () => {
  it("says so and tells the user how to get started", async () => {
    const detector = new ClaudeDetector({ env: { PATH: dir }, locate: { commonDirs: [] } });
    const { status, install } = await detector.detect();
    expect(status).toMatchObject({ kind: "cli-claude", state: "not-installed", available: false });
    expect(status.detail).toMatch(/not installed/i);
    expect(status.detail).toMatch(/run `claude` once in a terminal to sign in/i);
    expect(install).toBeUndefined();
  });
});

describe("installed", () => {
  it("is ready when the CLI's own status command says it is signed in", async () => {
    const { detector } = detectorFor({});
    const { status, install } = await detector.detect();
    expect(status).toMatchObject({
      kind: "cli-claude",
      state: "ready",
      available: true,
      signedIn: true,
      version: "2.1.302",
      authMethod: "claude.ai",
    });
    expect(status.detail).toMatch(/subscription/i);
    expect(install).toMatchObject({
      version: "2.1.302",
      capabilities: { permissionPrompts: true, disableSlashCommands: true },
    });
  });

  it("reports not signed in with the hint to sign in", async () => {
    const { detector } = detectorFor({
      auth: { exit: 1, stdout: { loggedIn: false, authMethod: "none" } },
    });
    const { status, install } = await detector.detect();
    expect(status).toMatchObject({ state: "not-signed-in", available: false, signedIn: false });
    expect(status.detail).toBe(
      "Claude Code is installed but not signed in. Run `claude` once in a terminal to sign in.",
    );
    expect(install).toBeUndefined();
  });

  it("treats exit code 1 as not signed in even without JSON", async () => {
    const { detector } = detectorFor({ auth: { exit: 1, stdout: "Not logged in" } });
    expect((await detector.detect()).status.state).toBe("not-signed-in");
  });

  it("warns when the login is an API key, because that bills per use", async () => {
    const { detector } = detectorFor({
      auth: { exit: 0, stdout: { loggedIn: true, authMethod: "api_key" } },
    });
    const { status } = await detector.detect();
    expect(status.state).toBe("ready");
    expect(status.detail).toMatch(/API key/);
    expect(status.detail).toMatch(/billed to that key/);
  });

  it("refuses a version older than the minimum, with the fix", async () => {
    const { detector } = detectorFor({ version: "2.0.5 (Claude Code)" });
    const { status } = await detector.detect();
    expect(status).toMatchObject({ state: "unsupported", available: false, version: "2.0.5" });
    expect(status.detail).toContain("2.1.259");
    expect(status.detail).toContain("claude update");
  });

  it("will not run a program that is not Claude Code", async () => {
    const { detector } = detectorFor({ version: "1.2.3 (Something Else)" });
    const { status } = await detector.detect();
    expect(status.state).toBe("unsupported");
    expect(status.detail).toMatch(/does not identify itself as Claude Code/);
  });

  it("refuses a CLI that lacks the flags that keep it restricted", async () => {
    const { detector } = detectorFor({
      helpFlags: [
        "--output-format",
        "--include-partial-messages",
        "--mcp-config",
        "--tools",
        "--permission-mode (dontAsk)",
      ],
    });
    const { status } = await detector.detect();
    expect(status.state).toBe("unsupported");
    expect(status.detail).toContain("--strict-mcp-config");
    expect(status.detail).toContain("--allowedTools");
  });

  it("refuses a CLI without dontAsk, the mode that turns prompts into denials", async () => {
    const { detector } = detectorFor({
      helpFlags: [
        "--output-format",
        "--include-partial-messages",
        "--mcp-config",
        "--strict-mcp-config",
        "--allowedTools",
        "--tools",
        '--permission-mode <mode> (choices: "plan", "default")',
      ],
    });
    const { status } = await detector.detect();
    expect(status.state).toBe("unsupported");
    expect(status.detail).toContain("dontAsk");
  });

  it("is still ready when only the optional flags are missing, and records which are absent", async () => {
    const required = [
      "--output-format",
      "--include-partial-messages",
      "--mcp-config",
      "--strict-mcp-config",
      "--allowedTools",
      "--tools",
      "--permission-mode <mode> (dontAsk)",
    ];
    const { detector } = detectorFor({ helpFlags: required });
    const { status, install } = await detector.detect();
    expect(status.state).toBe("ready");
    expect(install?.capabilities).toEqual({
      permissionPrompts: false,
      disableSlashCommands: false,
    });
  });

  it("reports a slow sign-in check as an error that is worth retrying, instead of hanging", async () => {
    const { detector } = detectorFor({ authDelayMs: 5000 }, { probeTimeoutMs: 300 });
    const started = Date.now();
    const { status } = await detector.detect();
    expect(Date.now() - started).toBeLessThan(3000);
    expect(status.state).toBe("error");
    expect(status.detail).toMatch(/did not answer in time/);
  });

  it("uses an explicit binary path over the search", async () => {
    const fake = writeFakeCli(dir, {}, "my-claude");
    const detector = new ClaudeDetector({
      binary: fake.path,
      env: { PATH: "/nonexistent" },
      locate: { commonDirs: [] },
    });
    expect((await detector.detect()).status).toMatchObject({ state: "ready", binary: fake.path });
  });
});

describe("hygiene", () => {
  it("never hands API keys or tokens to the CLI during checks, so the subscription is what gets reported", async () => {
    const { fake, detector } = detectorFor(
      {},
      {
        env: {
          PATH: dir,
          HOME: dir,
          ANTHROPIC_API_KEY: "sk-ant-leak",
          CLAUDE_CODE_OAUTH_TOKEN: "oauth-leak",
          OPENAI_API_KEY: "sk-openai-leak",
        },
      },
    );
    await detector.detect();
    const calls = fake.calls();
    expect(calls.map((c) => c.mode).sort()).toEqual(["auth", "help", "version"]);
    for (const call of calls) {
      expect(call.envKeys).not.toContain("ANTHROPIC_API_KEY");
      expect(call.envKeys).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
      expect(call.envKeys).not.toContain("OPENAI_API_KEY");
    }
  });

  it("reuses a recent answer instead of spawning again, and re-checks when forced", async () => {
    const { fake, detector } = detectorFor({});
    await detector.detect();
    await detector.detect();
    expect(fake.calls().filter((c) => c.mode === "auth")).toHaveLength(1);
    expect(fake.calls().filter((c) => c.mode === "version")).toHaveLength(1);
    await detector.detect(true);
    expect(fake.calls().filter((c) => c.mode === "auth")).toHaveLength(2);
    // Version and options are cached per file and not asked again.
    expect(fake.calls().filter((c) => c.mode === "version")).toHaveLength(1);
  });

  it("shares one check between concurrent callers", async () => {
    const { fake, detector } = detectorFor({});
    await Promise.all([detector.detect(), detector.detect(), detector.detect()]);
    expect(fake.calls().filter((c) => c.mode === "auth")).toHaveLength(1);
  });
});
