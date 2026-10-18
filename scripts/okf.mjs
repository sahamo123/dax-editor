#!/usr/bin/env node
// Tools for the docs/ knowledge base, which is an Open Knowledge Format (OKF) v0.2 bundle.
//
//   node scripts/okf.mjs check [dir]            validate the bundle (exit 1 on errors)
//   node scripts/okf.mjs index [dir]            rewrite every index.md from concept frontmatter
//   node scripts/okf.mjs index [dir] --check    fail if any index.md is out of date (used in CI)
//
// `dir` defaults to `docs`. Spec: https://github.com/GoogleCloudPlatform/open-knowledge-format
// The rules enforced here are the spec's conformance rules plus the project conventions
// described in docs/engineering/knowledge-protocol.md.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";

const RESERVED = new Set(["index.md", "log.md"]);
const STATUSES = new Set(["draft", "stable", "deprecated"]);
const ACTOR = /^(human|process):[A-Za-z0-9._-]+$/;
// The repo must stay neutral about which tool produced the work.
const VENDOR_NAMES = /claude|anthropic|haiku|sonnet|opus|gpt|openai|gemini|gemma|llama/i;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Titles and one-line descriptions for well-known sections, used when generating index.md. */
const SECTION_META = {
  adr: [
    "Architecture decisions",
    "Why each significant choice was made, and what else was considered",
  ],
  architecture: ["Architecture", "How the system fits together"],
  engineering: ["Engineering standards", "Rules and workflows for contributing code and docs"],
  evals: ["Model evaluation", "How we measure whether a model can edit video"],
  maintainers: ["Maintainer guides", "Procedures for people who run the repository"],
  research: ["Research", "Outside facts, competitors and experiments"],
  specs: ["Specifications", "What a feature must do, written before it is built"],
};

/** Files listed first in the root index, in this order. */
const ROOT_PINNED = ["STATUS.md", "ROADMAP.md"];

const toPosix = (p) => p.split("\\").join("/");

/**
 * Split a markdown file into YAML frontmatter and body.
 * @param {string} text file contents
 * @returns {{data: object | null, body: string, error?: string}} `data` is null when there is no (valid) frontmatter
 */
export function splitFrontmatter(text) {
  const src = text.replace(/\r\n/g, "\n");
  if (!src.startsWith("---\n")) return { data: null, body: src };
  const end = src.indexOf("\n---", 3);
  if (end === -1) return { data: null, body: src, error: "frontmatter is not closed with ---" };
  let data;
  try {
    data = parseYaml(src.slice(4, end)) ?? {};
  } catch (err) {
    return { data: null, body: src, error: `invalid YAML in frontmatter: ${err.message}` };
  }
  if (typeof data !== "object" || Array.isArray(data)) {
    return { data: null, body: src, error: "frontmatter must be a YAML mapping" };
  }
  const nl = src.indexOf("\n", end + 1);
  return { data, body: nl === -1 ? "" : src.slice(nl + 1) };
}

/** All .md files under `dir`, skipping hidden folders and node_modules. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out.sort();
}

/** Remove fenced code blocks and inline code so example links are not treated as real ones. */
function stripCode(body) {
  return body.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
}

function isoTimestamp(value) {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return typeof value === "string" && ISO_DATETIME.test(value) && !Number.isNaN(Date.parse(value));
}

/** Validate one concept document's frontmatter. Pushes messages into `errors` / `warnings`. */
function checkConcept(rel, data, errors, warnings) {
  const need = (key) => typeof data[key] === "string" && data[key].trim() !== "";
  if (!need("type")) errors.push(`${rel}: frontmatter needs a non-empty "type"`);
  if (!need("title")) errors.push(`${rel}: frontmatter needs a "title"`);
  if (!need("description")) errors.push(`${rel}: frontmatter needs a one-sentence "description"`);
  if (data.status !== undefined && !STATUSES.has(data.status)) {
    errors.push(`${rel}: status must be one of draft, stable, deprecated`);
  }
  if (
    data.tags !== undefined &&
    !(Array.isArray(data.tags) && data.tags.every((t) => typeof t === "string"))
  ) {
    errors.push(`${rel}: tags must be a list of strings`);
  }

  const gen = data.generated;
  if (!gen || typeof gen !== "object") {
    errors.push(`${rel}: needs "generated" with "by" and "at"`);
  } else {
    if (!ACTOR.test(String(gen.by ?? ""))) {
      errors.push(`${rel}: generated.by must look like "process:<name>" or "human:<username>"`);
    } else if (VENDOR_NAMES.test(gen.by)) {
      errors.push(
        `${rel}: generated.by must not name a model or vendor (keep the repo tool-neutral)`,
      );
    }
    if (!isoTimestamp(gen.at))
      errors.push(`${rel}: generated.at must be ISO 8601 with a UTC offset`);
  }

  const verified = data.verified === undefined ? [] : [].concat(data.verified);
  for (const v of verified) {
    if (!v || !ACTOR.test(String(v.by ?? "")) || VENDOR_NAMES.test(String(v.by))) {
      errors.push(`${rel}: each verified entry needs a tool-neutral "by" actor`);
    }
    if (!v || !isoTimestamp(v.at))
      errors.push(`${rel}: each verified entry needs an ISO 8601 "at"`);
  }

  if (data.stale_after !== undefined) {
    if (!isoTimestamp(data.stale_after))
      errors.push(`${rel}: stale_after must be ISO 8601 with an offset`);
    else if (Date.now() >= new Date(data.stale_after).getTime())
      warnings.push(`${rel}: is past its stale_after date`);
  }
}

/** index.md carries no frontmatter, except an optional okf_version in the bundle root. */
function checkIndexFile(rel, data, isRoot, errors) {
  if (data === null) return;
  const keys = Object.keys(data);
  if (!isRoot) errors.push(`${rel}: index.md must not have frontmatter`);
  else if (keys.some((k) => k !== "okf_version"))
    errors.push(`${rel}: root index.md may only carry okf_version`);
}

/** log.md: one H1, ISO-dated H2 headings strictly newest first, bullets that start with a bold label. */
function checkLog(rel, body, errors, warnings) {
  const lines = body.split("\n");
  const firstReal = lines.find((l) => l.trim() !== "");
  if (!firstReal || !/^# /.test(firstReal))
    errors.push(`${rel}: log must start with a "# " heading`);

  let previous = null;
  lines.forEach((line, i) => {
    const where = `${rel}:${i + 1}`;
    const h2 = /^## (.*)$/.exec(line);
    if (h2) {
      const date = h2[1].trim();
      if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(date))) {
        errors.push(`${where}: date heading must be YYYY-MM-DD, got "${date}"`);
      } else if (previous !== null && date >= previous) {
        errors.push(`${where}: dates must be strictly newest first (${date} after ${previous})`);
      }
      previous = date;
    } else if (/^[*-] /.test(line) && !/^[*-] \*\*[^*]+\*\*/.test(line)) {
      errors.push(`${where}: log bullets must start with a bold label, e.g. "* **Update**: ..."`);
    } else if (line.trim() !== "" && !/^(#|[*-] | {2,}|\t)/.test(line)) {
      warnings.push(`${where}: unexpected prose between log entries`);
    }
  });
}

/** Report links to files that do not exist. Bundle-relative links start with "/". */
function checkLinks(root, file, rel, body, errors) {
  const link = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const m of stripCode(body).matchAll(link)) {
    const target = m[1];
    if (/^([a-z][a-z0-9+.-]*:|#)/i.test(target)) continue;
    const pathOnly = target.split("#")[0];
    if (pathOnly === "") continue;
    const abs = pathOnly.startsWith("/") ? join(root, pathOnly) : resolve(dirname(file), pathOnly);
    if (!existsSync(abs)) errors.push(`${rel}: broken link to "${target}"`);
  }
}

/**
 * Validate a bundle.
 * @param {string} root path of the bundle directory
 * @returns {{errors: string[], warnings: string[]}}
 */
export function checkBundle(root) {
  const errors = [];
  const warnings = [];
  const absRoot = resolve(root);

  for (const file of walk(absRoot)) {
    const rel = toPosix(relative(absRoot, file));
    const name = basename(file);
    const { data, body, error } = splitFrontmatter(readFileSync(file, "utf8"));
    if (error) errors.push(`${rel}: ${error}`);

    if (name === "index.md") checkIndexFile(rel, data, dirname(file) === absRoot, errors);
    else if (name === "log.md") checkLog(rel, body, errors, warnings);
    else if (data === null) {
      if (!error) errors.push(`${rel}: missing frontmatter (every concept needs a "type")`);
    } else checkConcept(rel, data, errors, warnings);

    checkLinks(absRoot, file, rel, body, errors);
  }
  return { errors, warnings };
}

/** True if `dir` or any folder below it holds a concept document. */
function hasConcepts(dir) {
  return walk(dir).some((f) => !RESERVED.has(basename(f)));
}

/** Build the text of the index.md for one directory. */
function buildIndex(dir, isRoot) {
  const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith("."));
  const concepts = entries
    .filter((e) => e.isFile() && e.name.endsWith(".md") && !RESERVED.has(e.name))
    .map((e) => {
      const { data } = splitFrontmatter(readFileSync(join(dir, e.name), "utf8"));
      const description = String(data?.description ?? "")
        .replace(/\s+/g, " ")
        .trim();
      return { file: e.name, title: String(data?.title ?? e.name), description };
    });
  const pin = (f) =>
    isRoot && ROOT_PINNED.includes(f) ? ROOT_PINNED.indexOf(f) : ROOT_PINNED.length;
  concepts.sort((a, b) => pin(a.file) - pin(b.file) || a.file.localeCompare(b.file));

  const sections = entries
    .filter((e) => e.isDirectory() && e.name !== "node_modules" && hasConcepts(join(dir, e.name)))
    .map((e) => {
      const [title, description] = SECTION_META[e.name] ?? [e.name, `Documents in ${e.name}/`];
      return { dir: e.name, title, description };
    })
    .sort((a, b) => a.dir.localeCompare(b.dir));

  const line = (title, href, description) =>
    `* [${title}](${href})${description ? ` - ${description}` : ""}`;
  const out = [];
  if (isRoot) out.push("---", 'okf_version: "0.2"', "---", "");
  out.push(
    `# ${isRoot ? "Knowledge base" : (SECTION_META[basename(dir)]?.[0] ?? basename(dir))}`,
    "",
  );
  if (concepts.length) {
    out.push("## Documents", "", ...concepts.map((c) => line(c.title, c.file, c.description)), "");
  }
  if (sections.length) {
    out.push(
      "## Sections",
      "",
      ...sections.map((s) => line(s.title, `${s.dir}/index.md`, s.description)),
      "",
    );
  }
  if (existsSync(join(dir, "log.md"))) {
    out.push(
      "## History",
      "",
      line("Project log", "log.md", "Newest-first record of changes and decisions"),
      "",
    );
  }
  return `${out.join("\n").trimEnd()}\n`;
}

/**
 * Write (or, with `check`, verify) the index.md of every directory that has documents.
 * @param {string} root bundle directory
 * @param {{check?: boolean}} [opts] with `check`, nothing is written
 * @returns {string[]} bundle-relative paths of index files that changed or are out of date
 */
export function generateIndexes(root, opts = {}) {
  const absRoot = resolve(root);
  const stale = [];
  const visit = (dir) => {
    if (!hasConcepts(dir)) return;
    const target = join(dir, "index.md");
    const next = buildIndex(dir, dir === absRoot);
    const current = existsSync(target) ? readFileSync(target, "utf8").replace(/\r\n/g, "\n") : null;
    if (current !== next) {
      stale.push(toPosix(relative(absRoot, target)));
      if (!opts.check) writeFileSync(target, next);
    }
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
        visit(join(dir, e.name));
    }
  };
  visit(absRoot);
  return stale;
}

function main(argv) {
  const [command, ...rest] = argv;
  const flags = rest.filter((a) => a.startsWith("--"));
  const dir = rest.find((a) => !a.startsWith("--")) ?? "docs";
  if (!existsSync(dir)) {
    console.error(`No such directory: ${dir}`);
    return 2;
  }

  if (command === "check") {
    const { errors, warnings } = checkBundle(dir);
    for (const w of warnings) console.warn(`warning: ${w}`);
    for (const e of errors) console.error(`error: ${e}`);
    console.log(
      errors.length ? `\nOKF check failed: ${errors.length} error(s).` : "OKF check passed.",
    );
    return errors.length ? 1 : 0;
  }
  if (command === "index") {
    const check = flags.includes("--check");
    const changed = generateIndexes(dir, { check });
    if (check) {
      for (const f of changed) console.error(`error: ${f} is out of date. Run: pnpm docs:index`);
      console.log(changed.length ? "OKF index check failed." : "OKF indexes are up to date.");
      return changed.length ? 1 : 0;
    }
    console.log(changed.length ? `Updated: ${changed.join(", ")}` : "Indexes already up to date.");
    return 0;
  }
  console.error("Usage: node scripts/okf.mjs <check|index> [dir] [--check]");
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
