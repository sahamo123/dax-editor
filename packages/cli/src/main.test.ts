// Tests for the dax command line, run in-process against the real core registry.
// Commands that need media generate a clip with FFmpeg and are skipped when FFmpeg is missing.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commandTools } from "@dax/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EXIT } from "./index.js";
import { cli, hasFfmpeg, makeClip, makeTempDir, removeTempDir } from "./test/harness.js";

let dir: string;
let work: string;
let n = 0;
beforeAll(() => {
  dir = makeTempDir();
});
afterAll(() => removeTempDir(dir));
/** A fresh empty working folder per test, inside the suite's temp dir (removed with it). */
beforeEach(() => {
  work = join(dir, `w${++n}`);
  mkdirSync(work);
});

describe("help and version", () => {
  it("prints usage with exit 2 when given nothing, and exit 0 for --help", async () => {
    const cwd = work;
    const none = await cli([], { cwd });
    expect(none.code).toBe(EXIT.usage);
    expect(none.stdout).toContain("Usage: dax");
    const help = await cli(["--help"], { cwd });
    expect(help.code).toBe(EXIT.ok);
    expect(help.stdout).toContain("dax run");
    const sub = await cli(["export", "--help"], { cwd });
    expect(sub.code).toBe(EXIT.ok);
    expect((await cli(["--version"], { cwd })).stdout).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("rejects unknown subcommands and flags with exit 2", async () => {
    const cwd = work;
    const unknown = await cli(["frobnicate"], { cwd });
    expect(unknown.code).toBe(EXIT.usage);
    expect(unknown.stderr).toContain("Unknown command");
    expect((await cli(["constructor"], { cwd })).code).toBe(EXIT.usage);
    expect((await cli(["__proto__"], { cwd })).code).toBe(EXIT.usage);
    const flag = await cli(["commands", "--nope"], { cwd });
    expect(flag.code).toBe(EXIT.usage);
    expect(flag.stdout).toBe("");
  });

  it("reports errors as JSON on stdout (and nothing on stderr) with --json", async () => {
    const cwd = work;
    const r = await cli(["frobnicate", "--json"], { cwd });
    expect(r.code).toBe(EXIT.usage);
    expect(r.stderr).toBe("");
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, exitCode: 2 });
  });
});

describe("dax commands", () => {
  it("lists every command with its flags", async () => {
    const cwd = work;
    const r = await cli(["commands"], { cwd });
    expect(r.code).toBe(EXIT.ok);
    for (const t of commandTools()) expect(r.stdout).toContain(t.name);
    expect(r.stdout).toMatch(/export_video.*\[irreversible\]/);
    expect(r.stdout).toMatch(/get_project.*\[read-only\]/);
  });

  it("emits tool specs as JSON, optionally read-only only", async () => {
    const cwd = work;
    const all = JSON.parse((await cli(["commands", "--json"], { cwd })).stdout);
    expect(all.ok).toBe(true);
    expect(all.commands).toHaveLength(commandTools().length);
    const ro = JSON.parse((await cli(["commands", "--read-only", "--json"], { cwd })).stdout);
    expect(ro.commands.every((c: { readOnly: boolean }) => c.readOnly)).toBe(true);
    expect(ro.commands.length).toBeLessThan(all.commands.length);
  });

  it("shows one command's arguments", async () => {
    const cwd = work;
    const r = await cli(["commands", "delete_range"], { cwd });
    expect(r.code).toBe(EXIT.ok);
    expect(r.stdout).toContain("from");
    expect(r.stdout).toContain("to");
    expect((await cli(["commands", "nope"], { cwd })).code).toBe(EXIT.usage);
  });
});

describe("dax project", () => {
  it("creates, shows and refuses to overwrite a project", async () => {
    const cwd = work;
    const made = await cli(["project", "new", "talk.dax.json", "--name", "My talk"], { cwd });
    expect(made.code).toBe(EXIT.ok);
    const file = join(cwd, "talk.dax.json");
    expect(JSON.parse(readFileSync(file, "utf8")).name).toBe("My talk");

    const show = await cli(["project", "show", "talk.dax.json"], { cwd });
    expect(show.code).toBe(EXIT.ok);
    expect(show.stdout).toContain("My talk");
    expect(show.stdout).toContain("1920x1080");

    const again = await cli(["project", "new", "talk.dax.json"], { cwd });
    expect(again.code).toBe(EXIT.failure);
    expect(again.stderr).toContain("already exists");
    expect(
      (await cli(["project", "new", "talk.dax.json", "--force", "--name", "B"], { cwd })).code,
    ).toBe(0);
    expect(JSON.parse(readFileSync(file, "utf8")).name).toBe("B");

    const json = JSON.parse((await cli(["project", "show", "--json"], { cwd })).stdout);
    expect(json).toMatchObject({ ok: true, data: { name: "B" } });
    const full = JSON.parse((await cli(["project", "show", "--full", "--json"], { cwd })).stdout);
    expect(full.full.version).toBe(1);
  });

  it("exits 3 for a missing, unreadable or invalid project file", async () => {
    const cwd = work;
    const missing = await cli(["project", "show", "none.dax.json"], { cwd });
    expect(missing.code).toBe(EXIT.project);
    writeFileSync(join(cwd, "bad.dax.json"), "{not json");
    const bad = await cli(["project", "show", "bad.dax.json"], { cwd });
    expect(bad.code).toBe(EXIT.project);
    expect(bad.stderr).toContain("not valid JSON");
    writeFileSync(join(cwd, "wrong.dax.json"), JSON.stringify({ hello: "world" }));
    const wrong = await cli(
      ["run", "save_checkpoint", "-p", "wrong.dax.json", "--json", '{"name":"a"}'],
      { cwd },
    );
    expect(wrong.code).toBe(EXIT.project);
    expect(wrong.stderr + wrong.stdout).toContain("not a valid dax project");
  });

  it("picks the project from --project, DAX_PROJECT, or the only *.dax.json in the folder", async () => {
    const cwd = work;
    await cli(["project", "new", "only.dax.json", "--name", "Only"], { cwd });
    const discovered = JSON.parse((await cli(["project", "show", "--json"], { cwd })).stdout);
    expect(discovered.data.name).toBe("Only");

    await cli(["project", "new", "other.dax.json", "--name", "Other"], { cwd });
    const ambiguous = await cli(["project", "show"], { cwd });
    expect(ambiguous.code).toBe(EXIT.usage);
    expect(ambiguous.stderr).toContain("only.dax.json");

    const flagged = JSON.parse(
      (await cli(["project", "show", "-p", "other.dax.json", "--json"], { cwd })).stdout,
    );
    expect(flagged.data.name).toBe("Other");
    const viaEnv = JSON.parse(
      (
        await cli(["project", "show", "--json"], {
          cwd,
          env: { PATH: process.env.PATH, DAX_PROJECT: "only.dax.json" },
        })
      ).stdout,
    );
    expect(viaEnv.data.name).toBe("Only");
  });
});

describe("dax run", () => {
  it("runs a command with --json arguments and prints machine-readable output", async () => {
    const cwd = work;
    const r = await cli(["run", "save_checkpoint", "--json", '{"name":"first"}'], { cwd });
    expect(r.code).toBe(EXIT.ok);
    const out = JSON.parse(r.stdout);
    expect(out).toMatchObject({ ok: true, command: "save_checkpoint" });
    expect(out.summary).toContain("first");
    // The project was created on first edit, and the edit persisted.
    const file = join(cwd, "project.dax.json");
    expect(existsSync(file)).toBe(true);
    expect(existsSync(`${file}.history.json`)).toBe(true);
  });

  it("accepts --args as an alternative and '-' to read arguments from stdin", async () => {
    const cwd = work;
    const viaArgs = await cli(["run", "save_checkpoint", "--args", '{"name":"a"}', "--json"], {
      cwd,
    });
    expect(JSON.parse(viaArgs.stdout).ok).toBe(true);
    const viaStdin = await cli(["run", "save_checkpoint", "--args", "-", "--json"], {
      cwd,
      stdin: '{"name":"b"}',
    });
    expect(JSON.parse(viaStdin.stdout).summary).toContain("b");
  });

  it("prints a human summary and the data for text output", async () => {
    const cwd = work;
    const r = await cli(["run", "get_project"], { cwd });
    expect(r.code).toBe(EXIT.ok);
    expect(r.stdout).toContain("clip(s)");
    expect(r.stdout).toContain('"format"');
  });

  it("does not create a project file for a read-only command", async () => {
    const cwd = work;
    await cli(["run", "get_project"], { cwd });
    await cli(["run", "list_presets"], { cwd });
    expect(existsSync(join(cwd, "project.dax.json"))).toBe(false);
  });

  it("exits 2 for an unknown command or malformed arguments and 1 when the command fails", async () => {
    const cwd = work;
    expect((await cli(["run", "nope"], { cwd })).code).toBe(EXIT.usage);
    expect((await cli(["run"], { cwd })).code).toBe(EXIT.usage);
    const notObject = await cli(["run", "get_project", "--args", "[1]"], { cwd });
    expect(notObject.code).toBe(EXIT.usage);
    const notJson = await cli(["run", "get_project", "--args", "{oops"], { cwd });
    expect(notJson.code).toBe(EXIT.usage);

    const invalid = await cli(["run", "delete_range", "--json", '{"from":"x"}'], { cwd });
    expect(invalid.code).toBe(EXIT.failure);
    expect(JSON.parse(invalid.stdout).error).toContain("Invalid arguments for delete_range");
    const humanInvalid = await cli(["run", "delete_range", "--args", '{"from":"x"}'], { cwd });
    expect(humanInvalid.code).toBe(EXIT.failure);
    expect(humanInvalid.stderr).toContain("Invalid arguments for delete_range");
    const failing = await cli(["run", "split", "--json", '{"time":3}'], { cwd });
    expect(failing.code).toBe(EXIT.failure);
    const asJson = await cli(["run", "split", "--json", '{"time":3}'], { cwd });
    expect(asJson.stderr).toBe("");
    expect(JSON.parse(asJson.stdout)).toMatchObject({ ok: false, exitCode: 1 });
  });

  it("keeps undo history between separate invocations", async () => {
    const cwd = work;
    await cli(["run", "save_checkpoint", "--json", '{"name":"x"}'], { cwd });
    const history = JSON.parse((await cli(["run", "get_history", "--json"], { cwd })).stdout);
    expect(history.ok).toBe(true);
    expect(JSON.stringify(history.data)).toContain("x");
  });
});

describe.skipIf(!hasFfmpeg())("editing real media (needs ffmpeg)", () => {
  let clip: string;
  beforeAll(() => {
    clip = makeClip(dir, "talk.mp4");
  }, 60_000);

  it("imports, edits, undoes across invocations, cuts silence and exports", async () => {
    const cwd = work;
    const imported = await cli(["import", clip, "--json"], { cwd });
    expect(imported.code, imported.stderr + imported.stdout).toBe(EXIT.ok);
    expect(JSON.parse(imported.stdout).imported).toHaveLength(1);

    const show = await cli(["project", "show"], { cwd });
    expect(show.stdout).toContain("talk.mp4");
    expect(show.stdout).toContain("Clips:");

    const duration = async () =>
      JSON.parse((await cli(["project", "show", "--json"], { cwd })).stdout).data
        .duration as number;
    const full = await duration();
    expect(full).toBeGreaterThan(5.5);

    // A relative path in a later run resolves against the folder it runs in.
    const del = await cli(["run", "delete_range", "--json", '{"from":1,"to":2}'], { cwd });
    expect(del.code, del.stderr).toBe(EXIT.ok);
    expect(await duration()).toBeCloseTo(full - 1, 1);
    expect((await cli(["run", "undo"], { cwd })).code).toBe(EXIT.ok);
    expect(await duration()).toBeCloseTo(full, 1);

    const bogus = await cli(["cut", "--preset", "bogus"], { cwd });
    expect(bogus.code).toBe(EXIT.usage);
    const cut = await cli(["cut", "--preset", "standard", "--json"], { cwd });
    expect(cut.code, cut.stderr + cut.stdout).toBe(EXIT.ok);
    expect(JSON.parse(cut.stdout).data.secondsRemoved).toBeGreaterThan(1);
    expect(await duration()).toBeLessThan(full - 1);

    const out = join(cwd, "out.mp4");
    const exported = await cli(["export", "out.mp4", "--json"], { cwd });
    expect(exported.code, exported.stderr + exported.stdout).toBe(EXIT.ok);
    expect(JSON.parse(exported.stdout).data.path).toBe(out);
    expect(existsSync(out)).toBe(true);

    const exists = await cli(["export", "out.mp4"], { cwd });
    expect(exists.code).toBe(EXIT.failure);
    expect(exists.stderr).toContain("already exists");
    const over = await cli(["export", "out.mp4", "--overwrite"], { cwd });
    expect(over.code, over.stderr).toBe(EXIT.ok);
  }, 240_000);

  it("draws a progress line on stderr only for a terminal in text mode, never with --json", async () => {
    const cwd = work;
    await cli(["import", clip], { cwd });
    const tty = await cli(["export", "a.mp4"], { cwd, tty: true });
    expect(tty.code, tty.stderr).toBe(EXIT.ok);
    expect(tty.stderr).toContain("100%");
    const json = await cli(["export", "c.mp4", "--json"], { cwd, tty: true });
    expect(json.stderr).toBe("");
  }, 240_000);

  it("fails with a clear message for a missing file and for cut/export without a project", async () => {
    const cwd = work;
    expect((await cli(["cut"], { cwd })).code).toBe(EXIT.project);
    expect((await cli(["export", "x.mp4"], { cwd })).code).toBe(EXIT.project);
    const missing = await cli(["import", "nope.mp4"], { cwd });
    expect(missing.code).toBe(EXIT.failure);
    expect(missing.stderr).toContain("File not found");
  });
});
