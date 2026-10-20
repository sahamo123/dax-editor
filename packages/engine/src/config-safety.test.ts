// Configuration that could leak a secret or load the wrong folder: API keys over clear text, and where skills are found.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Session } from "@dax/core";
import type { AgentEvent, Settings } from "@dax/protocol";
import type { RunnerEnv } from "@dax/server";
import { afterEach, describe, expect, it } from "vitest";
import { defaultSkillsDir } from "./launch.js";
import { createRunnerFactory, keyMayGoTo } from "./runner.js";

describe("keyMayGoTo", () => {
  it("allows https anywhere and plain http only to this machine", () => {
    expect(keyMayGoTo("https://api.example.com/v1")).toBe(true);
    expect(keyMayGoTo("http://localhost:11434/v1")).toBe(true);
    expect(keyMayGoTo("http://127.0.0.1:8080/v1")).toBe(true);
    expect(keyMayGoTo("http://[::1]:8080/v1")).toBe(true);
    expect(keyMayGoTo("http://api.example.com/v1")).toBe(false);
    expect(keyMayGoTo("http://192.168.1.20:8080/v1")).toBe(false);
    expect(keyMayGoTo("ftp://example.com")).toBe(false);
    expect(keyMayGoTo("not a url")).toBe(false);
  });
});

describe("runner and API keys", () => {
  it("refuses to send a key over clear text to a remote host, and never shows the key", async () => {
    const secret = "sk-test-secret-0123456789";
    const env: RunnerEnv = {
      settings: {
        activeProvider: "openai-compatible",
        providers: { "openai-compatible": { baseUrl: "http://api.example.com/v1", model: "m" } },
      } as Settings,
      getApiKey: async () => secret,
    };
    const events: AgentEvent[] = [];
    const runner = await createRunnerFactory()(env);
    // The refusal happens before any request, so nothing is sent over the network.
    await runner.run("hi", {
      session: new Session(),
      onEvent: (e) => events.push(e),
      signal: new AbortController().signal,
      allowedRoots: [],
    });
    expect(events).toEqual([
      {
        type: "error",
        message: expect.stringContaining("unencrypted connection to api.example.com"),
      },
    ]);
    expect(JSON.stringify(events)).not.toContain(secret);
  });
});

describe("defaultSkillsDir", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  // Keep real checkout skills beyond the six-ancestor search, even when TEMP lives inside the repository.
  const isolatedRoot = () => {
    const base = mkdtempSync(join(tmpdir(), "dax-skills-"));
    dirs.push(base);
    const root = join(base, "isolated", "tree", "root");
    mkdirSync(root, { recursive: true });
    return root;
  };

  it("uses the configured folder before searching", () => {
    expect(defaultSkillsDir({ DAX_SKILLS_DIR: "/opt/dax/skills" }, "/nowhere/x.js")).toBe(
      resolve("/opt/dax/skills"),
    );
  });

  it("does not take an ancestor folder that only has a README", () => {
    // Before the fix any folder called skills with a README counted, including one in a parent directory.
    const root = isolatedRoot();
    mkdirSync(join(root, "skills"));
    writeFileSync(join(root, "skills", "README.md"), "not the shipped skills");
    const from = join(root, "app", "src", "launch.js");
    expect(defaultSkillsDir({}, from)).toBeUndefined();
  });

  it("finds a skills folder that holds skill folders", () => {
    const root = isolatedRoot();
    mkdirSync(join(root, "skills", "add-title"), { recursive: true });
    writeFileSync(join(root, "skills", "README.md"), "skills");
    writeFileSync(join(root, "skills", "add-title", "SKILL.md"), "---\nname: add-title\n---");
    const from = join(root, "packages", "engine", "src", "launch.js");
    expect(defaultSkillsDir({}, from)).toBe(join(root, "skills"));
  });
});
