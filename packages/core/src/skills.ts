// The skills layer: loads the `SKILL.md` playbooks from the repo's `skills/` folder and picks the few that fit a
// request, within a character budget, so a small model gets the right know-how without a flooded context.
// Pure and deterministic: no model, no network, no YAML dependency. It only reads files in `loadSkills`.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/** One editing playbook, as loaded from `skills/<name>/SKILL.md`. */
export interface Skill {
  /** Unique id, lowercase with hyphens. Equals the folder name. */
  name: string;
  /** One sentence saying WHEN to use the skill. Written so a router (or a person) can match a request to it. */
  description: string;
  /** Extra words and short phrases a request might use (`um`, `clean up`, `tiktok`). Matched after stemming. */
  tags: string[];
  /** The Markdown after the frontmatter: When to use, Steps, How to verify, Pitfalls, Do not. */
  body: string;
  /** Absolute path of the `SKILL.md` file (or the label given to {@link parseSkill}). */
  path: string;
}

/** The name of the skill that lists all the others, used when a request matches nothing. */
export const ROUTER_SKILL = "router";

/** Skills that are added to every selection in compact form, because every edit should be verified and explained. */
export const ALWAYS_ON_SKILLS: readonly string[] = ["verify-your-edit", "explain-what-you-did"];

type FrontmatterValue = string | string[];

/** Split `a, "b, c", d` into items, honouring quotes. Used for inline lists such as `[a, b]`. */
function splitList(inner: string): string[] {
  const items: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (const ch of inner) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ",") {
      items.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  items.push(cur.trim());
  return items.filter((s) => s.length > 0);
}

function parseValue(raw: string): FrontmatterValue {
  const v = raw.trim();
  if (v.startsWith("[")) {
    if (!v.endsWith("]")) throw new Error(`list is missing its closing ]: ${v}`);
    return splitList(v.slice(1, -1));
  }
  const q = v[0];
  if ((q === '"' || q === "'") && v.length >= 2 && v.endsWith(q)) {
    return v.slice(1, -1).replace(/\\(["'\\])/g, "$1");
  }
  return v;
}

/**
 * Parse the flat frontmatter this repo uses: `key: value` lines, where a value is plain text, a quoted string
 * or an inline list `[a, b, c]`. Nested YAML, multi-line values and block lists are rejected with a clear error.
 */
function parseFrontmatter(block: string, path: string): Record<string, FrontmatterValue> {
  const out: Record<string, FrontmatterValue> = {};
  block.split("\n").forEach((line, i) => {
    if (line.trim() === "" || line.trimStart().startsWith("#")) return;
    const where = `${path}: frontmatter line ${i + 1}`;
    if (/^\s/.test(line)) {
      throw new Error(`${where} is indented. Only flat "key: value" lines are supported.`);
    }
    const m = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) throw new Error(`${where} is not "key: value": ${line}`);
    try {
      out[m[1] as string] = parseValue(m[2] ?? "");
    } catch (err) {
      throw new Error(`${where}: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  return out;
}

/**
 * Parse the text of one `SKILL.md`: a `---` frontmatter block with `name`, `description` and optional `tags`,
 * then the Markdown body. Throws an Error that names `path` if the frontmatter is missing or invalid.
 * Unknown frontmatter keys are ignored so the format can grow.
 */
export function parseSkill(text: string, path = "SKILL.md"): Skill {
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const m = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(src);
  if (!m) throw new Error(`${path}: a SKILL.md must start with a --- frontmatter block`);
  const fields = parseFrontmatter(m[1] ?? "", path);
  const name = fields.name;
  const description = fields.description;
  const tags = fields.tags ?? [];
  if (typeof name !== "string" || !/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(
      `${path}: "name" must be lowercase letters, digits and hyphens, got ${String(name)}`,
    );
  }
  if (typeof description !== "string" || description.trim() === "") {
    throw new Error(`${path}: "description" must be a non-empty sentence`);
  }
  if (!Array.isArray(tags)) {
    throw new Error(`${path}: "tags" must be an inline list like [um, uh, filler]`);
  }
  return { name, description: description.trim(), tags, body: src.slice(m[0].length).trim(), path };
}

/**
 * Load every `<dir>/<name>/SKILL.md`, sorted by name so results are deterministic. Folders without a
 * `SKILL.md` are skipped. Throws if a file cannot be parsed or two skills share a name.
 */
export function loadSkills(dir: string): Skill[] {
  const root = resolve(dir);
  const skills: Skill[] = [];
  const folders = readdirSync(root).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const folder of folders) {
    const folderPath = join(root, folder);
    if (!statSync(folderPath).isDirectory()) continue;
    const file = join(folderPath, "SKILL.md");
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue; // not a skill folder
    }
    skills.push(parseSkill(text, file));
  }
  const seen = new Set<string>();
  for (const s of skills) {
    if (seen.has(s.name)) throw new Error(`Duplicate skill name "${s.name}" (${s.path})`);
    seen.add(s.name);
  }
  return skills;
}

// ---------- matching ----------

/** Words that carry no topic: generic verbs, pronouns and filler. Compared before stemming. */
const STOP_WORDS = new Set(
  (
    "a an the and or but if so of to in on at by for with from into onto up out as is are was were be been am " +
    "i me my mine we our you your it its this that these those there here then than too now what how when where " +
    "which who why about have has had do does did not no can could would should will shall may might please " +
    "just really very also some any all more most one thing things stuff someone " +
    "make makes made get got let lets want wants need needs like add put give take remove delete cut edit " +
    "video videos footage"
  ).split(" "),
);

/** Reduce a word to a rough stem so `pauses`, `pausing` and `pause` meet. Applied to requests and skill text alike. */
function stem(word: string): string {
  let s = word;
  if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith("ed")) s = s.slice(0, -2);
  else if (s.length >= 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
  if (s.length > 4 && s.endsWith("e")) s = s.slice(0, -1);
  // cutting -> cutt -> cut
  if (s.length > 3 && /([bdgmnprt])\1$/.test(s)) s = s.slice(0, -1);
  return s;
}

/** Lowercase words of `text` (apostrophes dropped), unstemmed. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);
}

interface Index {
  /** Every token of a request, stemmed, in order (stop words kept so phrases can match). */
  seq: string[];
  /** Topic tokens of a request: stemmed, stop words removed. */
  topics: Set<string>;
}

function indexRequest(message: string): Index {
  const raw = words(message);
  return {
    seq: raw.map(stem),
    topics: new Set(raw.filter((w) => !STOP_WORDS.has(w)).map(stem)),
  };
}

function hasPhrase(seq: string[], phrase: string[]): boolean {
  for (let i = 0; i + phrase.length <= seq.length; i++) {
    if (phrase.every((p, j) => seq[i + j] === p)) return true;
  }
  return false;
}

/** How strongly a skill matches a request. Tags weigh most, then name words, then description words. */
function scoreSkill(skill: Skill, req: Index): number {
  let score = 0;
  const seenTags = new Set<string>();
  for (const tag of skill.tags) {
    const t = words(tag).map(stem);
    const key = t.join(" ");
    if (t.length === 0 || seenTags.has(key)) continue;
    seenTags.add(key);
    if (t.length === 1) {
      if (req.topics.has(t[0] as string)) score += 3;
    } else if (hasPhrase(req.seq, t)) {
      score += 4;
    }
  }
  const nameTokens = new Set(
    words(skill.name)
      .filter((w) => !STOP_WORDS.has(w))
      .map(stem),
  );
  for (const t of nameTokens) if (req.topics.has(t)) score += 2;
  const descTokens = new Set(
    words(skill.description)
      .filter((w) => !STOP_WORDS.has(w))
      .map(stem),
  );
  let desc = 0;
  for (const t of descTokens) if (req.topics.has(t)) desc++;
  return score + Math.min(desc, 2);
}

// ---------- selection and rendering ----------

/** Options for {@link selectSkills}. */
export interface SelectOptions {
  /** Most skills to include in full because the request matched them. Default 3. */
  limit?: number;
  /** Hard cap on the characters {@link skillContext} returns, about a quarter as many tokens. Default 6000. */
  maxChars?: number;
  /** Lowest score that counts as a match. Default 3: one tag hit. */
  minScore?: number;
}

/** One skill chosen for the prompt, with the exact text that will be injected. */
export interface SelectedSkill {
  skill: Skill;
  /** `full` is the whole body; `compact` is the description plus the first steps; `router` is the skill list. */
  mode: "full" | "compact" | "router";
  /** Match score; 0 for skills added because they are always on or because nothing matched. */
  score: number;
  /** The rendered Markdown for this skill. */
  text: string;
}

/** The outcome of {@link selectSkills}. Turn it into prompt text with {@link skillContext}. */
export interface SkillSelection {
  items: SelectedSkill[];
  /** True when nothing matched and the router skill was offered instead. */
  usedRouter: boolean;
  /** The budget the selection was built for. */
  maxChars: number;
}

const HEADER =
  "# Editing skills\nFollow the steps of the skill that fits the request. Use only the tools you were given. Times are seconds.\n\n";
const COMPACT_STEPS_CHARS = 420;
const DEFAULT_LIMIT = 3;
const DEFAULT_MAX_CHARS = 6000;

/** The text under a `## <heading>` line, up to the next `## ` line. Empty if absent. */
function section(body: string, heading: string): string {
  const lines = body.split("\n");
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start < 0) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
}

/** Cut `text` to at most `max` characters at a line boundary, marking the cut. */
function truncateLines(text: string, max: number): string {
  if (text.length <= max) return text;
  const mark = "\n...";
  const kept: string[] = [];
  let used = mark.length;
  for (const line of text.split("\n")) {
    if (used + line.length + 1 > max) break;
    kept.push(line);
    used += line.length + 1;
  }
  return kept.join("\n") + mark;
}

function renderFull(s: Skill): string {
  return `## Skill: ${s.name}\n${s.body}\n\n`;
}

function renderCompact(s: Skill): string {
  const steps = truncateLines(section(s.body, "steps") || s.body, COMPACT_STEPS_CHARS);
  return `## Skill (short): ${s.name}\n${s.description}\n${steps}\n\n`;
}

/**
 * Choose which skills to give the model for `message`. Deterministic: stems the request, drops stop words, and
 * scores each skill by tag, name and description hits (see {@link SelectOptions}).
 *
 * - The best `limit` matching skills are included in full if they fit, else in compact form.
 * - `verify-your-edit` and `explain-what-you-did` ({@link ALWAYS_ON_SKILLS}) are always added compactly.
 * - Matches get at least half of `maxChars`; the always-on skills use what remains if it fits.
 * - If nothing matches, the `router` skill (a list of all skills) is offered instead, cut to fit.
 *
 * The rendered text never exceeds `maxChars`. Pass the result to {@link skillContext}.
 */
export function selectSkills(
  message: string,
  skills: readonly Skill[],
  opts: SelectOptions = {},
): SkillSelection {
  const limit = Math.max(0, opts.limit ?? DEFAULT_LIMIT);
  const maxChars = Math.max(0, opts.maxChars ?? DEFAULT_MAX_CHARS);
  const minScore = opts.minScore ?? 3;
  const budget = maxChars - HEADER.length;
  const router = skills.find((s) => s.name === ROUTER_SKILL);
  const always = ALWAYS_ON_SKILLS.map((n) => skills.find((s) => s.name === n)).filter(
    (s): s is Skill => s !== undefined,
  );
  const items: SelectedSkill[] = [];
  if (budget <= 0) return { items, usedRouter: false, maxChars };

  const req = indexRequest(message);
  // Ties keep the catalogue order (alphabetical when loaded with loadSkills), so results are stable.
  const ranked = skills
    .filter((s) => s.name !== ROUTER_SKILL)
    .map((skill, i) => ({ skill, i, score: scoreSkill(skill, req) }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit);

  const matchedNames = new Set(ranked.map((r) => r.skill.name));
  const extras = always.filter((s) => !matchedNames.has(s.name));
  const reserve = extras.reduce((n, s) => n + renderCompact(s).length, 0);
  const matchBudget = Math.max(budget - reserve, Math.floor(budget / 2));
  let used = 0;

  for (const r of ranked) {
    const full = renderFull(r.skill);
    const compact = renderCompact(r.skill);
    if (used + full.length <= matchBudget) {
      items.push({ skill: r.skill, mode: "full", score: r.score, text: full });
      used += full.length;
    } else if (used + compact.length <= matchBudget) {
      items.push({ skill: r.skill, mode: "compact", score: r.score, text: compact });
      used += compact.length;
    }
  }

  let usedRouter = false;
  if (items.length === 0 && router) {
    // Nothing matched: show the list so the model can pick, using at most the match budget.
    const head = `## Skill: ${router.name}\n`;
    const text = `${head}${truncateLines(router.body, Math.max(0, matchBudget - head.length - 2))}\n\n`;
    items.push({ skill: router, mode: "router", score: 0, text });
    used += text.length;
    usedRouter = true;
  }

  for (const s of extras) {
    const compact = renderCompact(s);
    if (used + compact.length <= budget) {
      items.push({ skill: s, mode: "compact", score: 0, text: compact });
      used += compact.length;
    }
  }
  return { items, usedRouter, maxChars };
}

/**
 * The text to put in the agent's system prompt for a selection (this is what the agent's `contextProvider`
 * returns). Empty string when nothing was selected. Never longer than the selection's `maxChars`.
 */
export function skillContext(selection: SkillSelection): string {
  if (selection.items.length === 0) return "";
  return (HEADER + selection.items.map((i) => i.text).join("")).trimEnd();
}
