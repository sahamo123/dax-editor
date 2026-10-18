// Tests for the skills layer: the parser, the selection logic, and a lint of every file in the repo's
// `skills/` folder (commands must exist, call examples must validate, irreversible commands need confirmation).

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { COMMANDS, getCommand } from "./commands.js";
import { OVERLAY_PRESETS } from "./presets.js";
import {
  ALWAYS_ON_SKILLS,
  loadSkills,
  parseSkill,
  ROUTER_SKILL,
  type Skill,
  selectSkills,
  skillContext,
} from "./skills.js";
import { FORMAT_PRESETS } from "./timeline.js";

const SKILLS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../skills");
const MAX_SKILL_CHARS = 2500;
const MAX_ROUTER_CHARS = 3000;
const SECTIONS = ["When to use", "Steps", "How to verify", "Pitfalls", "Do not"];
/** Underscore identifiers that are not commands but appear in skills (cut kinds reported by plan_cuts). */
const NON_COMMAND_IDENTIFIERS = new Set(["false_start"]);

const all = loadSkills(SKILLS_DIR);
const content = all.filter((s) => s.name !== ROUTER_SKILL);
const byName = (name: string) => all.find((s) => s.name === name) as Skill;
const picked = (message: string, opts?: Parameters<typeof selectSkills>[2]) =>
  selectSkills(message, all, opts).items.map((i) => i.skill.name);

describe("parseSkill", () => {
  it("reads name, description, tags and body", () => {
    const s = parseSkill(
      '---\nname: demo-skill\ndescription: Use when testing: colons are fine.\ntags: [um, "clean up", tiktok]\nextra: ignored\n---\n\n## Steps\n1. Do it.\n',
      "demo/SKILL.md",
    );
    expect(s.name).toBe("demo-skill");
    expect(s.description).toBe("Use when testing: colons are fine.");
    expect(s.tags).toEqual(["um", "clean up", "tiktok"]);
    expect(s.body).toBe("## Steps\n1. Do it.");
    expect(s.path).toBe("demo/SKILL.md");
  });

  it("accepts Windows line endings and a missing tags field", () => {
    const s = parseSkill("---\r\nname: x\r\ndescription: Use when y.\r\n---\r\nBody\r\n");
    expect(s.tags).toEqual([]);
    expect(s.body).toBe("Body");
  });

  it("rejects a missing frontmatter block", () => {
    expect(() => parseSkill("# Just markdown", "a/SKILL.md")).toThrow(/a\/SKILL\.md.*frontmatter/);
  });

  it("rejects bad names, empty descriptions and unsupported YAML", () => {
    expect(() => parseSkill("---\nname: Bad Name\ndescription: x.\n---\n")).toThrow(/name/);
    expect(() => parseSkill("---\nname: ok\ndescription:\n---\n")).toThrow(/description/);
    expect(() => parseSkill("---\nname: ok\ndescription: x.\ntags: a, b\n---\n")).toThrow(/tags/);
    expect(() => parseSkill("---\nname: ok\ndescription: x.\n  nested: 1\n---\n")).toThrow(
      /indented/,
    );
    expect(() => parseSkill("---\nname: ok\ndescription: x.\ntags: [a, b\n---\n")).toThrow(
      /closing/,
    );
  });
});

describe("loadSkills", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const tmp = () => {
    const d = mkdtempSync(join(tmpdir(), "dax-skills-"));
    dirs.push(d);
    return d;
  };
  const write = (root: string, folder: string, name: string) => {
    mkdirSync(join(root, folder), { recursive: true });
    writeFileSync(
      join(root, folder, "SKILL.md"),
      `---\nname: ${name}\ndescription: Use when ${name}.\n---\nBody`,
    );
  };

  it("loads sorted skills and skips folders and files that are not skills", () => {
    const root = tmp();
    write(root, "b-skill", "b-skill");
    write(root, "a-skill", "a-skill");
    mkdirSync(join(root, "not-a-skill"));
    writeFileSync(join(root, "README.md"), "# readme");
    expect(loadSkills(root).map((s) => s.name)).toEqual(["a-skill", "b-skill"]);
  });

  it("refuses two skills with the same name", () => {
    const root = tmp();
    write(root, "one", "same");
    write(root, "two", "same");
    expect(() => loadSkills(root)).toThrow(/Duplicate skill name "same"/);
  });
});

describe("the skills in the repo", () => {
  it("has between 18 and 24 skills plus the router", () => {
    expect(content.length).toBeGreaterThanOrEqual(18);
    expect(content.length).toBeLessThanOrEqual(24);
    expect(all.some((s) => s.name === ROUTER_SKILL)).toBe(true);
  });

  it("covers the required topics", () => {
    const required = [
      "tighten-talking-video",
      "remove-silences",
      "remove-filler-words",
      "review-false-starts-and-retakes",
      "cut-to-length",
      "keep-the-best-parts",
      "add-title",
      "add-lower-third",
      "add-callout",
      "add-end-card-cta",
      "change-format-for-platform",
      "undo-and-versions",
      "verify-your-edit",
      "handle-ambiguous-requests",
      "explain-what-you-did",
      "tutorial-video-structure",
      "explainer-video-structure",
      "podcast-clip",
      "product-demo-or-screen-recording",
      "short-form-vertical-hook",
      "interview-with-lower-thirds",
    ];
    expect(all.map((s) => s.name)).toEqual(expect.arrayContaining(required));
  });

  it("has unique names that match their folder names", () => {
    const names = all.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const s of all) expect(basename(dirname(s.path))).toBe(s.name);
  });

  it("has a one-sentence description that says when to use the skill", () => {
    for (const s of all) {
      expect(s.description, s.name).toMatch(/^Use /);
      expect(s.description, s.name).toMatch(/\.$/);
      // A second sentence would show as ". " followed by a capital letter.
      expect(s.description, s.name).not.toMatch(/\.\s+[A-Z]/);
      expect(s.description.length, s.name).toBeLessThanOrEqual(240);
      expect(s.description, s.name).not.toContain("\n");
    }
  });

  it("has enough tags for matching", () => {
    for (const s of content) expect(s.tags.length, s.name).toBeGreaterThanOrEqual(5);
  });

  it("has the standard sections, with numbered steps", () => {
    for (const s of content) {
      for (const h of SECTIONS) expect(s.body, `${s.name}: ${h}`).toContain(`## ${h}\n`);
      expect(s.body, s.name).toMatch(/## Steps\n1\. /);
    }
  });

  it("fits in a small model's context", () => {
    for (const s of all) {
      const size = readFileSync(s.path, "utf8").length;
      expect(size, `${s.name} is ${size} characters`).toBeLessThanOrEqual(
        s.name === ROUTER_SKILL ? MAX_ROUTER_CHARS : MAX_SKILL_CHARS,
      );
    }
  });

  it("lists every skill in the router, one short line each", () => {
    const router = byName(ROUTER_SKILL);
    for (const s of content) {
      const line = router.body.split("\n").find((l) => l.startsWith(`- ${s.name}: `));
      expect(line, `router is missing ${s.name}`).toBeDefined();
      expect((line as string).length, s.name).toBeLessThanOrEqual(130);
    }
    const listed = router.body.split("\n").filter((l) => l.startsWith("- "));
    expect(listed.length).toBe(content.length);
  });

  it("only mentions commands that exist in the registry", () => {
    for (const s of all) {
      const snake = s.body.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [];
      for (const word of snake) {
        if (NON_COMMAND_IDENTIFIERS.has(word)) continue;
        expect(getCommand(word), `${s.name} mentions unknown command "${word}"`).toBeDefined();
      }
    }
  });

  it("uses call examples whose arguments the command accepts", () => {
    let checked = 0;
    for (const s of all) {
      for (const span of s.body.matchAll(/`([a-z][a-z_]*) (\{[^`]*\})`/g)) {
        const [, name, json] = span as unknown as [string, string, string];
        const def = getCommand(name);
        expect(def, `${s.name}: unknown command in \`${span[0]}\``).toBeDefined();
        let args: unknown;
        try {
          args = JSON.parse(json);
        } catch {
          throw new Error(`${s.name}: example is not valid JSON: ${json}`);
        }
        const parsed = def?.schema.safeParse(args);
        expect(parsed?.success, `${s.name}: bad arguments in \`${name} ${json}\``).toBe(true);
        if (def?.schema instanceof z.ZodObject) {
          const known = Object.keys(def.schema.shape);
          for (const key of Object.keys(args as object)) {
            expect(known, `${s.name}: ${name} has no argument "${key}"`).toContain(key);
          }
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  it("points only at skills and presets that exist when it says see/follow/with", () => {
    const valid = new Set<string>([
      ...all.map((s) => s.name),
      ...OVERLAY_PRESETS.map((p) => p.id),
      ...Object.keys(FORMAT_PRESETS),
    ]);
    for (const s of all) {
      for (const m of s.body.matchAll(/\b(?:see|follow|with|use|and) ([a-z]+(?:-[a-z]+)+)\b/g)) {
        const ref = m[1] as string;
        // Ordinary hyphenated words are fine; only references to our own folders must resolve.
        if (
          /^(?:add|remove|review|cut|keep|change|export|undo|verify|handle|explain|tighten)-/.test(
            ref,
          )
        ) {
          expect(valid.has(ref), `${s.name} refers to unknown skill "${ref}"`).toBe(true);
        }
      }
    }
  });

  it("says confirmation is needed whenever an irreversible command is mentioned", () => {
    const irreversible = COMMANDS.filter((c) => c.irreversible).map((c) => c.name);
    expect(irreversible.length).toBeGreaterThan(0);
    for (const s of all) {
      for (const cmd of irreversible) {
        if (s.body.includes(cmd)) {
          expect(s.body, `${s.name} mentions ${cmd} without saying it needs confirmation`).toMatch(
            /confirm/i,
          );
        }
      }
    }
    // The detector itself works: a skill that forgets would be caught.
    const bad = "Call `export_video` now.";
    expect(irreversible.some((c) => bad.includes(c) && !/confirm/i.test(bad))).toBe(true);
  });

  it("never tells the model to export without being asked", () => {
    for (const s of content) {
      if (s.name === "export-the-video") continue;
      expect(s.body, s.name).not.toMatch(/`export_video/);
    }
  });
});

describe("selectSkills", () => {
  it("picks the cutting skills for 'remove the ums and long pauses'", () => {
    const names = picked("remove the ums and long pauses");
    expect(names).toEqual(
      expect.arrayContaining(["remove-filler-words", "remove-silences", "tighten-talking-video"]),
    );
  });

  it("picks cut-to-length first for 'make it 30 seconds'", () => {
    expect(picked("make it 30 seconds")[0]).toBe("cut-to-length");
  });

  it("picks name skills for 'add my name at the start'", () => {
    expect(picked("add my name at the start")).toEqual(
      expect.arrayContaining(["add-title", "add-lower-third"]),
    );
  });

  it("picks format and short-form skills for 'make this vertical for TikTok'", () => {
    const names = picked("make this vertical for TikTok");
    expect(names).toEqual(
      expect.arrayContaining(["change-format-for-platform", "short-form-vertical-hook"]),
    );
  });

  it("routes other common requests to the right skill", () => {
    expect(picked("cut my false starts and repeated takes")[0]).toBe(
      "review-false-starts-and-retakes",
    );
    expect(picked("clean up this video")[0]).toBe("tighten-talking-video");
    expect(picked("make a highlight reel of the best parts")[0]).toBe("keep-the-best-parts");
    expect(picked("add captions and background music")[0]).toBe("handle-unsupported-requests");
    expect(picked("undo that, go back to the earlier version")[0]).toBe("undo-and-versions");
    expect(picked("export it as an mp4")[0]).toBe("export-the-video");
    expect(picked("cut the first 10 seconds")).toContain("remove-a-section");
    expect(picked("add a subscribe call to action at the end")[0]).toBe("add-end-card-cta");
  });

  it("matches despite plurals, tenses and capital letters", () => {
    expect(picked("REMOVING the UMS")).toContain("remove-filler-words");
    expect(picked("shortening it")).toContain("cut-to-length");
  });

  it("always includes verify-your-edit and explain-what-you-did, compactly", () => {
    const sel = selectSkills("make it 30 seconds", all);
    for (const name of ALWAYS_ON_SKILLS) {
      const item = sel.items.find((i) => i.skill.name === name);
      expect(item?.mode, name).toBe("compact");
      expect(item?.text.length ?? 0, name).toBeLessThan(900);
    }
  });

  it("keeps an always-on skill in full when the request names it", () => {
    const sel = selectSkills("verify the edit worked", all);
    expect(sel.items.find((i) => i.skill.name === "verify-your-edit")?.mode).toBe("full");
  });

  it("honours the limit", () => {
    const sel = selectSkills("remove the ums and long pauses, shorter, add a title", all, {
      limit: 2,
    });
    const matched = sel.items.filter((i) => i.score > 0);
    expect(matched.length).toBeLessThanOrEqual(2);
  });

  it("respects the character budget", () => {
    const messages = [
      "remove the ums and long pauses",
      "make it 30 seconds for TikTok with a title and my name",
      "banana smoothie",
      "",
    ];
    for (const maxChars of [200, 700, 1500, 3000, 6000, 20000]) {
      for (const message of messages) {
        const text = skillContext(selectSkills(message, all, { maxChars }));
        expect(text.length, `${message} @ ${maxChars}`).toBeLessThanOrEqual(maxChars);
      }
    }
  });

  it("shrinks skills to compact form when the budget is tight, instead of dropping them", () => {
    const big = selectSkills("remove the ums and long pauses", all, { maxChars: 6000 });
    const small = selectSkills("remove the ums and long pauses", all, { maxChars: 2200 });
    expect(big.items.filter((i) => i.mode === "full").length).toBeGreaterThan(0);
    expect(small.items.length).toBeGreaterThan(0);
    expect(skillContext(small).length).toBeLessThanOrEqual(2200);
    expect(
      small.items.some(
        (i) => i.skill.name === "tighten-talking-video" || i.skill.name === "remove-silences",
      ),
    ).toBe(true);
  });

  it("falls back to the router when nothing matches", () => {
    for (const message of ["banana smoothie recipe", "hello", ""]) {
      const sel = selectSkills(message, all);
      expect(sel.usedRouter, message).toBe(true);
      expect(sel.items[0]?.skill.name).toBe(ROUTER_SKILL);
      expect(skillContext(sel)).toContain("- cut-to-length:");
    }
  });

  it("does not use the router when something matched", () => {
    const sel = selectSkills("make it 30 seconds", all);
    expect(sel.usedRouter).toBe(false);
    expect(sel.items.some((i) => i.skill.name === ROUTER_SKILL)).toBe(false);
  });

  it("is deterministic", () => {
    const a = skillContext(selectSkills("add a title and cut the ums", all));
    const b = skillContext(selectSkills("add a title and cut the ums", all));
    expect(a).toBe(b);
  });

  it("returns nothing when the budget cannot hold even the header", () => {
    expect(skillContext(selectSkills("make it 30 seconds", all, { maxChars: 10 }))).toBe("");
  });
});

describe("skillContext", () => {
  it("renders a header and each skill body without frontmatter", () => {
    const text = skillContext(selectSkills("make it 30 seconds", all));
    expect(text.startsWith("# Editing skills")).toBe(true);
    expect(text).toContain("## Skill: cut-to-length");
    expect(text).toContain("## Steps");
    expect(text).not.toContain("tags: [");
  });

  it("puts the matched skill before the always-on ones", () => {
    const text = skillContext(selectSkills("make it 30 seconds", all));
    expect(text.indexOf("cut-to-length")).toBeLessThan(text.indexOf("verify-your-edit"));
  });
});
