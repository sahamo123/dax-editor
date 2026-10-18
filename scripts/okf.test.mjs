// Tests for scripts/okf.mjs. Run with: node --test scripts
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { checkBundle, generateIndexes, splitFrontmatter } from "./okf.mjs";

const made = [];
/** Create a throwaway bundle from a map of relative path to file contents. */
function bundle(files) {
  const dir = mkdtempSync(join(tmpdir(), "okf-test-"));
  made.push(dir);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}
after(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true });
});

const concept = (extra = "") =>
  `---\ntype: Guide\ntitle: A thing\ndescription: Says something.\nstatus: stable\ngenerated:\n  by: process:scribe\n  at: 2026-10-18T10:00:00Z\n${extra}---\n\nBody.\n`;

describe("splitFrontmatter", () => {
  it("parses a mapping and returns the body", () => {
    const r = splitFrontmatter("---\ntype: A\n---\nhello\n");
    assert.deepEqual(r.data, { type: "A" });
    assert.equal(r.body, "hello\n");
  });
  it("returns null data when there is no frontmatter", () => {
    assert.equal(splitFrontmatter("# Title\n").data, null);
  });
  it("reports an unclosed block", () => {
    assert.match(splitFrontmatter("---\ntype: A\n").error, /not closed/);
  });
});

describe("checkBundle", () => {
  it("accepts a conformant bundle", () => {
    const dir = bundle({ "a.md": concept() });
    assert.deepEqual(checkBundle(dir).errors, []);
  });

  it("rejects missing frontmatter and missing type", () => {
    const dir = bundle({ "a.md": "# no frontmatter\n", "b.md": "---\ntitle: x\n---\n" });
    const { errors } = checkBundle(dir);
    assert.ok(errors.some((e) => e.startsWith("a.md") && /missing frontmatter/.test(e)));
    assert.ok(errors.some((e) => e.startsWith("b.md") && /"type"/.test(e)));
  });

  it("rejects vendor names and bad actors in generated.by", () => {
    const named = concept().replace("process:scribe", "process:claude-agent");
    const bad = concept().replace("process:scribe", "scribe");
    const { errors } = checkBundle(bundle({ "a.md": named, "b.md": bad }));
    assert.ok(errors.some((e) => e.startsWith("a.md") && /tool-neutral/.test(e)));
    assert.ok(errors.some((e) => e.startsWith("b.md") && /generated\.by/.test(e)));
  });

  it("rejects timestamps without an offset", () => {
    const dir = bundle({ "a.md": concept().replace("2026-10-18T10:00:00Z", "2026-10-18 10:00") });
    assert.ok(checkBundle(dir).errors.some((e) => /generated\.at/.test(e)));
  });

  it("flags broken links but ignores links inside code", () => {
    const dir = bundle({
      "a.md": `${concept()}\n[gone](/nope.md)\n\n\`\`\`\n[example](/also-nope.md)\n\`\`\`\n\`[x](/inline.md)\`\n`,
    });
    const broken = checkBundle(dir).errors.filter((e) => /broken link/.test(e));
    assert.equal(broken.length, 1);
    assert.match(broken[0], /\/nope\.md/);
  });

  it("allows only okf_version frontmatter in the root index", () => {
    const ok = bundle({ "a.md": concept(), "index.md": '---\nokf_version: "0.2"\n---\n# Root\n' });
    assert.deepEqual(checkBundle(ok).errors, []);
    const bad = bundle({
      "a.md": concept(),
      "sub/b.md": concept(),
      "sub/index.md": "---\ntype: X\n---\n# Sub\n",
    });
    assert.ok(checkBundle(bad).errors.some((e) => /index\.md must not have frontmatter/.test(e)));
  });
});

describe("log.md", () => {
  const log = (body) => bundle({ "a.md": concept(), "log.md": body });

  it("accepts newest-first entries with bold labels", () => {
    const dir = log(
      "# Log\n\n## 2026-10-18\n* **Update**: x\n\n## 2026-10-17\n* **Creation**: y\n",
    );
    assert.deepEqual(checkBundle(dir).errors, []);
  });
  it("rejects oldest-first order and duplicate dates", () => {
    const asc = log("# Log\n\n## 2026-10-17\n* **Update**: x\n\n## 2026-10-18\n* **Update**: y\n");
    assert.ok(checkBundle(asc).errors.some((e) => /newest first/.test(e)));
    const dup = log("# Log\n\n## 2026-10-18\n* **Update**: x\n\n## 2026-10-18\n* **Update**: y\n");
    assert.ok(checkBundle(dup).errors.some((e) => /newest first/.test(e)));
  });
  it("rejects non-ISO dates and unlabeled bullets", () => {
    const dir = log("# Log\n\n## Oct 18\n* just text\n");
    const { errors } = checkBundle(dir);
    assert.ok(errors.some((e) => /YYYY-MM-DD/.test(e)));
    assert.ok(errors.some((e) => /bold label/.test(e)));
  });
});

describe("generateIndexes", () => {
  it("writes indexes, then reports them up to date", () => {
    const dir = bundle({
      "STATUS.md": concept()
        .replace("A thing", "Status")
        .replace("Says something.", "Where we are."),
      "z.md": concept().replace("A thing", "Zed"),
      "adr/0001-x.md": concept().replace("A thing", "First decision"),
      "log.md": "# Log\n\n## 2026-10-18\n* **Update**: x\n",
    });
    const first = generateIndexes(dir);
    assert.deepEqual(first.sort(), ["adr/index.md", "index.md"]);
    const root = readFileSync(join(dir, "index.md"), "utf8");
    assert.match(root, /^---\nokf_version: "0\.2"\n---/);
    assert.ok(
      root.indexOf("[Status](STATUS.md)") < root.indexOf("[Zed](z.md)"),
      "pinned file comes first",
    );
    assert.match(root, /\[Architecture decisions\]\(adr\/index\.md\)/);
    assert.match(root, /\[Project log\]\(log\.md\)/);
    assert.deepEqual(generateIndexes(dir, { check: true }), []);
    assert.deepEqual(checkBundle(dir).errors, []);
  });

  it("detects a stale index in --check mode without writing", () => {
    const dir = bundle({ "a.md": concept() });
    generateIndexes(dir);
    writeFileSync(join(dir, "b.md"), concept().replace("A thing", "Second"));
    assert.deepEqual(generateIndexes(dir, { check: true }), ["index.md"]);
    assert.doesNotMatch(readFileSync(join(dir, "index.md"), "utf8"), /Second/);
  });
});
