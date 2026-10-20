import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zodToJsonSchema } from "zod-to-json-schema";
import { audioClips } from "./audio-layer.js";
import { type CommandContext, type CommandDef, CommandError, getCommand } from "./commands.js";
import { CUT_PRESET_NAMES } from "./cuts.js";
import { probe } from "./media.js";
import { getPreset, OVERLAY_PRESETS } from "./presets.js";
import { exportProject } from "./render.js";
import type { Asset, Overlay, Project, Word } from "./schema.js";
import { Session } from "./session.js";
import { TEMPLATE_COMMANDS } from "./template-commands.js";
import {
  applyTemplate,
  configureTemplates,
  defaultTemplatesDir,
  ENGINE_FEATURES,
  loadTemplates,
  resolveVariables,
  sanitizeText,
  TEMPLATE_ASPECTS,
  TEMPLATE_LICENSES,
  TEMPLATE_NOTES_DISCLAIMER,
  type Template,
  TemplateError,
  TemplateSchema,
} from "./templates.js";
import {
  addAsset,
  appendClip,
  emptyProject,
  FORMAT_PRESETS,
  mainClips,
  shotRanges,
  timelineDuration,
} from "./timeline.js";
import { zoomsOf } from "./zoom.js";

const templates = await loadTemplates(defaultTemplatesDir());

// ---------- fixtures (no FFmpeg: the asset carries a transcript, so the cut step never touches the file) ----------

/** Words 0.3 s long with a 1.5 s pause and an "um" every ~4 s, covering about `seconds` of source. */
function transcript(seconds: number): Word[] {
  const words: Word[] = [];
  let t = 0.2;
  let i = 0;
  while (t < seconds - 1) {
    words.push({ text: `word${i}`, start: t, end: t + 0.3 });
    t += 0.4;
    i++;
    if (i % 10 === 0) {
      words.push({ text: "um", start: t + 0.5, end: t + 0.8 });
      t += 2;
    }
  }
  return words;
}

function fakeProject(seconds: number, extra: Partial<Asset> = {}): Project {
  const asset: Asset = {
    id: "a1",
    path: "/not/a/real/file.mp4",
    kind: "video",
    duration: seconds,
    width: 1920,
    height: 1080,
    fps: 30,
    hasAudio: true,
    transcript: { words: transcript(seconds) },
    ...extra,
  };
  return appendClip(addAsset(emptyProject("t"), asset), "a1");
}

function ctxFor(project: Project): CommandContext {
  return { session: new Session(project) };
}

/** The example value of every variable: what a user who fills in everything would give. */
function allVars(t: Template): Record<string, string> {
  return Object.fromEntries(t.variables.map((v) => [v.name, v.example]));
}

function overlayEnd(o: Overlay): number {
  return o.start + o.duration;
}

function samePositionOverlaps(overlays: Overlay[]): string[] {
  const out: string[] = [];
  for (const [i, a] of overlays.entries()) {
    for (const b of overlays.slice(i + 1)) {
      if (a.style.position !== b.style.position) continue;
      if (a.start < overlayEnd(b) - 1e-6 && b.start < overlayEnd(a) - 1e-6) {
        out.push(
          `${a.id} [${a.start}-${overlayEnd(a)}] overlaps ${b.id} [${b.start}-${overlayEnd(b)}]`,
        );
      }
    }
  }
  return out;
}

const styles = templates.filter((t) => t.kind === "style");
const industries = templates.filter((t) => t.kind === "industry");

// ---------- the catalogue ----------

describe("template catalogue", () => {
  it("ships at least 14 creator styles and 16 industries", () => {
    expect(styles.length).toBeGreaterThanOrEqual(14);
    expect(industries.length).toBeGreaterThanOrEqual(16);
  });

  it("has unique ids", () => {
    const ids = templates.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses only overlay presets that exist", () => {
    const known = new Set(OVERLAY_PRESETS.map((p) => p.id));
    for (const t of templates) {
      for (const o of t.overlays)
        expect(known.has(o.preset), `${t.id}/${o.id}: ${o.preset}`).toBe(true);
    }
  });

  it("uses only cut presets that exist", () => {
    for (const t of templates) {
      if ("preset" in t.cleanup) expect(CUT_PRESET_NAMES).toContain(t.cleanup.preset);
      else expect(t.cleanup.reason.length).toBeGreaterThan(10);
    }
  });

  it("records every step the engine cannot do under deferred, with a known `requires`", () => {
    const known = Object.keys(ENGINE_FEATURES);
    for (const t of templates) {
      for (const d of t.deferred) {
        expect(d.requires.length, `${t.id}/${d.id}`).toBeGreaterThan(0);
        for (const f of d.requires) expect(known).toContain(f);
      }
    }
  });

  it("rejects an unavailable step hidden outside `deferred`, or deferred without `requires`", () => {
    const sample = structuredClone(templates[0]) as Record<string, unknown>;
    expect(TemplateSchema.safeParse({ ...sample, captions: { style: "word" } }).success).toBe(
      false,
    );
    const noRequires = {
      ...sample,
      deferred: [{ id: "caps", title: "Captions", description: "Word captions", requires: [] }],
    };
    expect(TemplateSchema.safeParse(noRequires).success).toBe(false);
    const unknownFeature = {
      ...sample,
      deferred: [{ id: "x", title: "X", description: "Y", requires: ["teleport"] }],
    };
    expect(TemplateSchema.safeParse(unknownFeature).success).toBe(false);
  });

  it("rejects bad references, defaults and cleanup", () => {
    const sample = structuredClone(
      templates.find((t) => t.overlays.length > 0 && t.variables.length > 0),
    ) as Template;
    const bad = (patch: Record<string, unknown>) =>
      TemplateSchema.safeParse({ ...sample, ...patch }).success;
    expect(bad({ overlays: [{ ...sample.overlays[0], preset: "nope" }] })).toBe(false);
    expect(bad({ overlays: [{ ...sample.overlays[0], text: "{{missing_var}}" }] })).toBe(false);
    expect(bad({ defaultAspect: "21:9" })).toBe(false);
    expect(bad({ cleanup: { preset: "extreme" } })).toBe(false);
    expect(
      bad({ cleanup: { preset: "tight", overrides: { pauseMin: 0.3, keepPause: 0.9 } } }),
    ).toBe(false);
    const v0 = sample.variables[0];
    expect(
      bad({ variables: [{ ...v0, type: "phone", default: "not a phone", maxLength: 10 }] }),
    ).toBe(false);
  });

  it("has a licence from the allow-list, a source, notes with valid categories and sensible lengths", () => {
    for (const t of templates) {
      expect(TEMPLATE_LICENSES).toContain(t.license);
      expect(t.source).toMatch(/^docs\/research\//);
      expect(t.notes.length, t.id).toBeGreaterThan(0);
      expect(t.formats.some((f) => f.aspect === t.defaultAspect)).toBe(true);
      for (const f of t.formats) expect(Object.keys(TEMPLATE_ASPECTS)).toContain(f.aspect);
      const minTotal = t.beats.reduce((n, b) => n + b.durationSec.min, 0);
      const longest = Math.max(...t.formats.map((f) => f.lengthSec.max));
      expect(minTotal, `${t.id}: beats cannot fit the longest format`).toBeLessThanOrEqual(longest);
    }
  });

  it("carries the compliance reminders the research calls for", () => {
    const has = (id: string, category: string) =>
      templates.find((t) => t.id === id)?.notes.some((n) => n.category === category) ?? false;
    expect(has("healthcare-clinic", "health")).toBe(true);
    expect(has("fitness-coaching", "health")).toBe(true);
    expect(has("finance-explainer", "finance")).toBe(true);
    expect(has("real-estate-listing", "real-estate")).toBe(true);
    expect(has("b2b-testimonial", "testimonials")).toBe(true);
    expect(has("ugc-testimonial-ad", "testimonials")).toBe(true);
    for (const t of templates) {
      if (t.effects.some((e) => e.kind === "music")) {
        expect(
          t.notes.some((n) => n.category === "music"),
          `${t.id} needs a music-licensing note`,
        ).toBe(true);
      }
    }
    // Styles named after a creator say they are not affiliated with them.
    for (const id of [
      "hormozi-captions",
      "mrbeast-retention",
      "ali-abdaal-talking-head",
      "mkbhd-product-review",
    ]) {
      expect(
        templates.find((t) => t.id === id)?.notes.some((n) => /not affiliated/.test(n.text)),
      ).toBe(true);
    }
  });

  it("only uses variables that are declared, with valid defaults and examples", () => {
    for (const t of templates) {
      const vars = resolveVariables(t, allVars(t)); // throws on an invalid example
      for (const v of t.variables) expect(vars[v.name], `${t.id}.${v.name}`).toBeTruthy();
      expect(() =>
        resolveVariables(
          t,
          Object.fromEntries(t.variables.filter((v) => v.required).map((v) => [v.name, v.example])),
        ),
      ).not.toThrow();
    }
  });
});

// ---------- loading ----------

describe("loadTemplates", () => {
  it("reports every problem and refuses a bad folder", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dax-tpl-"));
    try {
      const { writeFileSync, mkdirSync } = await import("node:fs");
      mkdirSync(join(dir, "sub"));
      writeFileSync(join(dir, "sub", "broken.json"), "{ not json");
      writeFileSync(join(dir, "wrong-name.json"), JSON.stringify(templates[0]));
      writeFileSync(join(dir, "_ignored.json"), "{ not json");
      await expect(loadTemplates(dir)).rejects.toThrow(/broken\.json[\s\S]*wrong-name\.json/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------- variables ----------

describe("variables", () => {
  const tpl = templates.find((t) => t.id === "real-estate-listing") as Template;

  it("sanitises control, invisible and extra whitespace characters", () => {
    expect(sanitizeText("  Hello\u0000\n\tWorld​‮!  ")).toBe("Hello World!");
  });

  it("fills defaults, drops empty values and tidies web addresses", () => {
    const v = resolveVariables(tpl, {
      agent_name: "  Jordan   Lee ",
      url: "https://example.com/book/",
      price: "",
    });
    expect(v.agent_name).toBe("Jordan Lee");
    expect(v.url).toBe("example.com/book");
    expect(v.cta_text).toBe("Book a showing");
    expect(v.price).toBeUndefined();
  });

  it("rejects too-long, malformed, unknown, missing-required and non-text values", () => {
    expect(() => resolveVariables(tpl, { agent_name: "x".repeat(51) })).toThrow(/limit is 50/);
    expect(() => resolveVariables(tpl, { agent_name: "Jo <script>" })).toThrow(TemplateError);
    expect(() => resolveVariables(tpl, { agent_name: "Jo", phone: "call me" })).toThrow(/phone/);
    expect(() => resolveVariables(tpl, { agent_name: "Jo", url: "javascript:alert(1)" })).toThrow(
      /web address/,
    );
    expect(() => resolveVariables(tpl, { agent_name: "Jo", url: "exa mple.com" })).toThrow(
      /web address/,
    );
    expect(() => resolveVariables(tpl, { agent_name: "Jo", colour: "red" })).toThrow(
      /Unknown variable "colour"/,
    );
    expect(() => resolveVariables(tpl, {})).toThrow(/needs a value for "agent_name"/);
    expect(() => resolveVariables(tpl, { agent_name: { evil: true } })).toThrow(/must be text/);
    expect(() =>
      resolveVariables(tpl, JSON.parse('{"__proto__": "x", "agent_name": "Jo"}')),
    ).toThrow(/Unknown variable/);
  });

  it("accepts numbers and leaves a rejected call without effect", async () => {
    const ctx = ctxFor(fakeProject(30));
    const before = ctx.session.history().length;
    await expect(applyTemplate(ctx, tpl, { agent_name: "Jo", price: 5 })).resolves.toBeDefined();
    const ctx2 = ctxFor(fakeProject(30));
    await expect(applyTemplate(ctx2, tpl, { agent_name: "x".repeat(99) })).rejects.toThrow(
      TemplateError,
    );
    expect(ctx2.session.history()).toHaveLength(before);
  });
});

// ---------- applying every template ----------

describe.each(templates.map((t) => [t.id, t] as const))("apply %s", (_id, t) => {
  const vars = allVars(t);

  it("sets the format, adds the overlays at the right times and reports honestly (60 s source)", async () => {
    const original = fakeProject(60);
    const ctx = ctxFor(original);
    const r = await applyTemplate(ctx, t, vars);
    const project = ctx.session.project;
    const D = timelineDuration(project);

    // format
    const want = FORMAT_PRESETS[TEMPLATE_ASPECTS[t.defaultAspect]];
    expect(project.timeline.width).toBe(want.width);
    expect(project.timeline.height).toBe(want.height);
    expect(r.aspect).toBe(t.defaultAspect);

    // cleanup either cut something (the fixture has long pauses and fillers) or was skipped by the template
    const cleanup = r.steps.find((s) => s.id === "cleanup");
    if ("skip" in t.cleanup) {
      expect(cleanup?.status).toBe("skipped");
      expect(D).toBeCloseTo(60, 1);
    } else {
      expect(D).toBeLessThan(60);
      expect(cleanup?.status).not.toBe("skipped");
    }
    expect(r.durationAfter).toBeCloseTo(D, 6);

    // every overlay: right id, inside the video, timing from its rule
    const overlays = project.timeline.overlays;
    expect(overlays).toHaveLength(t.overlays.length);
    for (const step of t.overlays) {
      const o = overlays.find((x) => x.id === `tpl-${t.id}-${step.id}`);
      expect(
        o,
        `${step.id} missing; steps: ${JSON.stringify(r.steps.filter((s) => s.kind === "overlay"))}`,
      ).toBeDefined();
      if (!o) continue;
      expect(o.preset).toBe(step.preset);
      expect(o.start).toBeGreaterThanOrEqual(0);
      expect(overlayEnd(o)).toBeLessThanOrEqual(D + 1e-6);
      if (step.anchor === "start") expect(o.start).toBeCloseTo(step.offset, 2);
      if (step.anchor === "end") expect(overlayEnd(o)).toBeCloseTo(D - step.offset, 2);
      if (step.anchor === "full") {
        expect(o.start).toBeCloseTo(step.offset, 2);
        expect(overlayEnd(o)).toBeCloseTo(D, 2);
      }
      if (step.anchor !== "full" && step.duration !== undefined) {
        expect(o.duration).toBeLessThanOrEqual(step.duration + 1e-6);
      }
      expect(o.text.length).toBeGreaterThan(0);
      expect(o.style.position).toBe(step.style?.position ?? getPreset(step.preset)?.style.position);
    }
    expect(samePositionOverlaps(overlays)).toEqual([]);

    // report: honest about skipped, review and notes
    for (const d of t.deferred) {
      const s = r.steps.find((x) => x.id === d.id);
      expect(s?.status, d.id).toBe("skipped");
      for (const f of d.requires) expect(s?.detail).toContain(f);
    }
    for (const c of t.confirmations) {
      expect(r.steps.find((x) => x.id === c.id)?.status).toBe("needs-review");
    }
    expect(r.steps.find((s) => s.id === "structure")?.status).toBe("needs-review");
    expect(r.notes).toEqual(t.notes);
    expect(r.disclaimer).toBe(TEMPLATE_NOTES_DISCLAIMER);
    expect(r.disclaimer).toMatch(/not legal advice/);
    expect(r.missingVariables).toEqual([]);

    // fades from the template
    const clips = project.timeline.tracks[0]?.clips ?? [];
    if (t.fades?.in) expect(clips[0]?.fadeIn).toBeGreaterThan(0);
    if (t.fades?.out) expect(clips[clips.length - 1]?.fadeOut).toBeGreaterThan(0);

    // one history entry, labelled and sourced, and one undo restores the original
    const history = ctx.session.history();
    expect(history).toHaveLength(2);
    expect(history[1]?.source).toBe("template");
    expect(history[1]?.label).toBe(`Template: ${t.name}`);
    expect(r.changed).toBe(true);
    expect(r.historyId).toBe(1);
    await ctx.session.undo();
    expect(ctx.session.project).toEqual(original);
  });

  it("does not stack duplicates when applied twice, and stacks them only when asked", async () => {
    const ctx = ctxFor(fakeProject(60));
    await applyTemplate(ctx, t, vars);
    const once = structuredClone(ctx.session.project);
    const second = await applyTemplate(ctx, t, vars);
    expect(ctx.session.project).toEqual(once);
    expect(second.changed).toBe(false);
    expect(second.historyId).toBeUndefined();
    expect(ctx.session.history()).toHaveLength(2);

    const skipped = await applyTemplate(ctx, t, vars, { existing: "skip" });
    expect(ctx.session.project.timeline.overlays).toHaveLength(t.overlays.length);
    expect(
      skipped.steps.filter((s) => s.kind === "overlay").every((s) => s.status === "skipped"),
    ).toBe(true);

    await applyTemplate(ctx, t, vars, { existing: "add" });
    expect(ctx.session.project.timeline.overlays).toHaveLength(t.overlays.length * 2);
    const ids = ctx.session.project.timeline.overlays.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps overlays inside a 6 second video and never lets the end card overlap another overlay", async () => {
    const ctx = ctxFor(
      fakeProject(6, { transcript: { words: [{ text: "hello", start: 0.2, end: 5.8 }] } }),
    );
    const r = await applyTemplate(ctx, t, vars);
    const D = timelineDuration(ctx.session.project);
    expect(D).toBeGreaterThan(5);
    for (const o of ctx.session.project.timeline.overlays) {
      expect(overlayEnd(o)).toBeLessThanOrEqual(D + 1e-6);
      expect(o.start).toBeGreaterThanOrEqual(0);
    }
    expect(samePositionOverlaps(ctx.session.project.timeline.overlays)).toEqual([]);
    // an overlay that was dropped says why
    const placed = new Set(ctx.session.project.timeline.overlays.map((o) => o.id));
    for (const step of t.overlays) {
      if (!placed.has(`tpl-${t.id}-${step.id}`)) {
        expect(r.steps.find((s) => s.id === step.id)?.status).toBe("skipped");
      }
    }
  });

  it("applies every supported aspect ratio", async () => {
    for (const f of t.formats) {
      const ctx = ctxFor(fakeProject(40));
      await applyTemplate(ctx, t, vars, { aspect: f.aspect });
      const want = FORMAT_PRESETS[TEMPLATE_ASPECTS[f.aspect]];
      expect(ctx.session.project.timeline.width).toBe(want.width);
      expect(ctx.session.project.timeline.height).toBe(want.height);
    }
  });

  it("skips overlays whose variables are missing and says so", async () => {
    const required = Object.fromEntries(
      t.variables.filter((v) => v.required).map((v) => [v.name, v.example]),
    );
    const ctx = ctxFor(fakeProject(40));
    const r = await applyTemplate(ctx, t, required);
    for (const step of t.overlays) {
      const placed = ctx.session.project.timeline.overlays.some(
        (o) => o.id === `tpl-${t.id}-${step.id}`,
      );
      const report = r.steps.find((s) => s.id === step.id);
      if (!placed) expect(report?.status).toBe("skipped");
      if (
        step.when &&
        !required[step.when] &&
        !t.variables.find((v) => v.name === step.when)?.default
      ) {
        expect(placed, `${step.id} placed without ${step.when}`).toBe(false);
        expect(report?.detail).toContain(step.when);
      }
    }
    for (const v of t.variables) {
      if (!v.required && v.default === undefined) expect(r.missingVariables).toContain(v.name);
    }
  });
});

// ---------- specific behaviours ----------

describe("applyTemplate behaviour", () => {
  const get = (id: string) => templates.find((t) => t.id === id) as Template;

  it("keeps the end card clear of the hook on a 6 second video (Hormozi-style)", async () => {
    const ctx = ctxFor(
      fakeProject(6, { transcript: { words: [{ text: "hello", start: 0.2, end: 5.8 }] } }),
    );
    await applyTemplate(ctx, get("hormozi-captions"), {
      title: "Stop doing this",
      cta_text: "Follow me",
    });
    const byId = (s: string) => ctx.session.project.timeline.overlays.find((o) => o.id.endsWith(s));
    const hook = byId("-hook");
    const card = byId("-end-card");
    expect(hook).toBeDefined();
    expect(card).toBeDefined();
    expect(card?.start).toBeGreaterThanOrEqual(overlayEnd(hook as Overlay) - 1e-6);
    expect(overlayEnd(card as Overlay)).toBeCloseTo(timelineDuration(ctx.session.project), 2);
  });

  it("shortens the lower-priority overlay on a very short clip and drops what cannot fit", async () => {
    const ctx = ctxFor(
      fakeProject(3.2, { transcript: { words: [{ text: "hi", start: 0.2, end: 3 }] } }),
    );
    const r = await applyTemplate(ctx, get("hormozi-captions"), { title: "Hello there" });
    const D = timelineDuration(ctx.session.project);
    for (const o of ctx.session.project.timeline.overlays)
      expect(overlayEnd(o)).toBeLessThanOrEqual(D + 1e-6);
    expect(samePositionOverlaps(ctx.session.project.timeline.overlays)).toEqual([]);
    expect(r.steps.filter((s) => s.kind === "overlay").length).toBe(2);

    const tiny = ctxFor(
      fakeProject(1.2, { transcript: { words: [{ text: "hi", start: 0.1, end: 1.1 }] } }),
    );
    const r2 = await applyTemplate(
      tiny,
      get("real-estate-listing"),
      allVars(get("real-estate-listing")),
    );
    for (const s of r2.steps.filter((x) => x.kind === "overlay" && x.status === "skipped")) {
      expect(s.detail).toMatch(/too short|No room/);
    }
    for (const o of tiny.session.project.timeline.overlays) {
      expect(overlayEnd(o)).toBeLessThanOrEqual(timelineDuration(tiny.session.project) + 1e-6);
    }
  });

  it("names the cut preset, keeps the plan for review and applies cleanup overrides (podcast clip)", async () => {
    const ctx = ctxFor(fakeProject(60));
    const r = await applyTemplate(
      ctx,
      get("podcast-clip-audiogram"),
      allVars(get("podcast-clip-audiogram")),
    );
    const cleanup = r.steps.find((s) => s.id === "cleanup");
    expect(cleanup?.detail).toMatch(/pauseMin/);
    expect(timelineDuration(ctx.session.project)).toBeLessThan(60);
    expect(ctx.session.plans.size).toBeGreaterThan(0);
  });

  it("reports letterboxing instead of faking a reframe", async () => {
    const ctx = ctxFor(fakeProject(30));
    const r = await applyTemplate(ctx, get("short-form-hooks"), { title: "Hi" });
    const framing = r.steps.find((s) => s.id === "framing");
    expect(framing?.status).toBe("needs-review");
    expect(framing?.detail).toMatch(/reframe/);
    const matching = ctxFor(fakeProject(30, { width: 1080, height: 1920 }));
    const r2 = await applyTemplate(matching, get("short-form-hooks"), { title: "Hi" });
    expect(r2.steps.find((s) => s.id === "framing")?.status).toBe("done");
    const unknown = ctxFor(fakeProject(30, { width: undefined, height: undefined }));
    const r3 = await applyTemplate(unknown, get("short-form-hooks"), { title: "Hi" });
    expect(r3.steps.find((s) => s.id === "framing")?.status).toBe("skipped");
  });

  it("flags a video that is longer than the target length", async () => {
    const ctx = ctxFor(fakeProject(300));
    const r = await applyTemplate(ctx, get("short-form-hooks"), { title: "Hi" });
    expect(r.steps.find((s) => s.id === "length")?.status).toBe("needs-review");
  });

  it("shrinks long text to fit a vertical frame", async () => {
    const long = "A".repeat(2) + " very long hook line that would not fit".repeat(1);
    const ctx = ctxFor(fakeProject(30));
    await applyTemplate(ctx, get("hormozi-captions"), { title: long.slice(0, 55) });
    const hook = ctx.session.project.timeline.overlays.find((o) => o.id.endsWith("-hook"));
    expect(hook?.style.fontSize).toBeLessThan(getPreset("title-pop")?.style.fontSize ?? 0);
    expect(hook?.style.fontSize).toBeGreaterThanOrEqual(24);
    const short = ctxFor(fakeProject(30));
    await applyTemplate(short, get("hormozi-captions"), { title: "Hi" });
    const h2 = short.session.project.timeline.overlays.find((o) => o.id.endsWith("-hook"));
    expect(h2?.style.fontSize).toBe(getPreset("title-pop")?.style.fontSize);
  });

  it("covers a long video with a disclaimer in pieces the overlay command accepts, and replaces them cleanly", async () => {
    const t = get("finance-explainer");
    const asset = { transcript: { words: [{ text: "hello", start: 0.2, end: 299.5 }] } };
    const ctx = ctxFor(fakeProject(300, asset));
    await applyTemplate(ctx, t, allVars(t));
    const pieces = ctx.session.project.timeline.overlays.filter((o) =>
      o.id.startsWith(`tpl-${t.id}-disclosure`),
    );
    expect(pieces).toHaveLength(3);
    for (const p of pieces) expect(p.duration).toBeLessThanOrEqual(120);
    const D = timelineDuration(ctx.session.project);
    expect(Math.min(...pieces.map((p) => p.start))).toBeCloseTo(0, 2);
    expect(Math.max(...pieces.map(overlayEnd))).toBeCloseTo(D, 2);
    const before = ctx.session.project.timeline.overlays.length;
    await applyTemplate(ctx, t, allVars(t));
    expect(ctx.session.project.timeline.overlays).toHaveLength(before);
  });

  it("keeps the earlier copy when its replacement cannot be added", async () => {
    const t = get("hormozi-captions");
    const ctx = ctxFor(fakeProject(30));
    await applyTemplate(ctx, t, { title: "First" });
    // Make add_overlay refuse for this one call, as it would for a bad style or a rejected text.
    const add = getCommand("add_overlay");
    if (!add) throw new Error("add_overlay is not registered");
    const original = add.run;
    add.run = async () => {
      throw new CommandError("forced failure for the test");
    };
    try {
      await applyTemplate(ctx, t, { title: "Second" });
    } finally {
      add.run = original;
    }
    const hooks = ctx.session.project.timeline.overlays.filter((o) => o.id.endsWith("-hook"));
    // Before the fix the old copy was removed first, so nothing was left on the timeline.
    expect(hooks.map((h) => h.text)).toEqual(["First"]);
  });

  it("re-applies with changed text by replacing, not stacking", async () => {
    const t = get("hormozi-captions");
    const ctx = ctxFor(fakeProject(30));
    await applyTemplate(ctx, t, { title: "First" });
    await applyTemplate(ctx, t, { title: "Second" });
    const hooks = ctx.session.project.timeline.overlays.filter((o) => o.id.endsWith("-hook"));
    expect(hooks.map((h) => h.text)).toEqual(["Second"]);
    expect(ctx.session.history()).toHaveLength(3);
    await ctx.session.undo();
    expect(ctx.session.project.timeline.overlays.find((o) => o.id.endsWith("-hook"))?.text).toBe(
      "First",
    );
  });

  it("refuses an empty timeline and an unknown aspect without changing anything", async () => {
    const empty = { session: new Session(emptyProject("e")) };
    await expect(applyTemplate(empty, get("hormozi-captions"))).rejects.toThrow(/no video/i);
    const ctx = ctxFor(fakeProject(30));
    await expect(
      applyTemplate(ctx, get("hormozi-captions"), {}, { aspect: "1:1" }),
    ).rejects.toThrow(/no 1:1 format/);
    expect(ctx.session.history()).toHaveLength(1);
  });

  it("refuses to commit if the project changed while the template ran", async () => {
    const ctx = ctxFor(fakeProject(30));
    const session = ctx.session;
    const real = session.apply.bind(session);
    session.apply = async (edit, meta) => {
      session.project = structuredClone(session.project); // someone else touched the project
      return real(edit, meta);
    };
    await expect(applyTemplate(ctx, get("hormozi-captions"), { title: "x" })).rejects.toThrow(
      /changed while/,
    );
    expect(session.history()).toHaveLength(1);
  });

  it("turns a failing step into a skipped step instead of aborting", async () => {
    // Without a transcript the cut step must read the (missing) file, which fails; the rest still happens.
    const ctx = ctxFor(fakeProject(30, { transcript: undefined }));
    const r = await applyTemplate(ctx, get("hormozi-captions"), { title: "Hi" });
    const cleanup = r.steps.find((s) => s.id === "cleanup");
    expect(cleanup?.status).toBe("skipped");
    expect(cleanup?.detail).toMatch(/^Failed:/);
    expect(ctx.session.project.timeline.overlays.length).toBeGreaterThan(0);
    expect(ctx.session.project.timeline.width).toBe(1080);
  });
});

// ---------- effects: zoom, music, logo ----------

describe("template effects", () => {
  const get = (id: string) => templates.find((t) => t.id === id) as Template;
  const song: Asset = {
    id: "song",
    path: "/not/a/real/song.mp3",
    kind: "audio",
    duration: 90,
    hasAudio: true,
  };
  const logo: Asset = {
    id: "logo",
    path: "/not/a/real/logo.png",
    kind: "image",
    duration: 0,
    width: 400,
    height: 200,
    hasAudio: false,
  };

  it("no template still lists a feature the engine has now (music, ducking, zoom, image overlays)", () => {
    for (const t of templates) {
      for (const d of t.deferred) {
        for (const gone of ["music-bed", "audio-ducking", "zoom-keyframes", "image-overlays"]) {
          expect(d.requires, `${t.id}/${d.id}`).not.toContain(gone);
        }
      }
    }
    for (const gone of ["music-bed", "audio-ducking", "zoom-keyframes", "image-overlays"]) {
      expect(Object.keys(ENGINE_FEATURES)).not.toContain(gone);
    }
  });

  it("every effect has a unique id, a title and a description, and zoom scales stay modest", () => {
    for (const t of templates) {
      const ids = t.effects.map((e) => e.id);
      expect(new Set(ids).size, t.id).toBe(ids.length);
      for (const e of t.effects) {
        expect(e.title.length).toBeGreaterThan(2);
        expect(e.description.length).toBeGreaterThan(20);
        if (e.kind === "zoom") expect(e.scale).toBeLessThanOrEqual(1.5);
      }
    }
    // The research calls for these looks; each template that asks for them has the step.
    const kinds = (id: string) => get(id).effects.map((e) => e.kind);
    expect(kinds("hormozi-captions")).toEqual(expect.arrayContaining(["zoom", "music"]));
    expect(kinds("minimal-corporate-linkedin")).toContain("logo");
    expect(kinds("internal-training")).toEqual(["music"]);
  });

  it("rejects an unknown kind, an unknown image preset, a stray key and a duplicate id", () => {
    const sample = structuredClone(get("hormozi-captions")) as Record<string, unknown>;
    const ok = (effects: unknown[]) => TemplateSchema.safeParse({ ...sample, effects }).success;
    const zoom = get("hormozi-captions").effects.find((e) => e.kind === "zoom");
    expect(ok([zoom])).toBe(true);
    expect(ok([{ ...zoom, kind: "sparkle" }])).toBe(false);
    expect(ok([{ ...zoom, scale: 2.5 }])).toBe(false);
    expect(ok([{ ...zoom, shell: "rm -rf /" }])).toBe(false);
    expect(ok([zoom, zoom])).toBe(false);
    const logoEffect = get("minimal-corporate-linkedin").effects.find((e) => e.kind === "logo");
    expect(ok([{ ...logoEffect, preset: "nope" }])).toBe(false);
    expect(ok([{ ...zoom, id: "hook" }])).toBe(false); // clashes with an overlay id
  });

  it("puts a tighter frame on every second shot (Hormozi-style), and nothing overlaps", async () => {
    const t = get("hormozi-captions");
    const ctx = ctxFor(fakeProject(60));
    const r = await applyTemplate(ctx, t, allVars(t));
    const p = ctx.session.project;
    const shots = shotRanges(p);
    expect(shots.length).toBeGreaterThan(3);
    const zooms = zoomsOf(p).filter((z) => z.id.startsWith("tpl-hormozi-captions-punch-ins"));
    const want = shots.filter((s, i) => i % 2 === 1 && s.end - s.start >= 1);
    expect(zooms.length).toBeGreaterThan(0);
    expect(zooms).toHaveLength(want.length);
    zooms.forEach((z, i) => {
      expect(z.start).toBeCloseTo(want[i]?.start ?? -1, 2);
      expect(z.start + z.duration).toBeCloseTo(want[i]?.end ?? -1, 2);
      expect(z).toMatchObject({ fromScale: 1.15, toScale: 1.15 });
    });
    const step = r.steps.find((s) => s.id === "punch-ins");
    expect(step).toMatchObject({ kind: "effect", status: "done" });
    expect(step?.detail).toMatch(/1\.15x on every second shot/);
    // Applying again changes nothing and never stacks.
    const once = structuredClone(p);
    const again = await applyTemplate(ctx, t, allVars(t));
    expect(ctx.session.project).toEqual(once);
    expect(again.changed).toBe(false);
  });

  it("glides a slow push-in over each long shot (documentary)", async () => {
    const t = get("documentary-interview");
    const ctx = ctxFor(fakeProject(60));
    await applyTemplate(ctx, t, allVars(t));
    const zooms = zoomsOf(ctx.session.project);
    expect(zooms.length).toBeGreaterThan(0);
    for (const z of zooms) {
      expect(z.id).toMatch(/^tpl-documentary-interview-push-in_p\d+$/);
      expect(z.fromScale).toBe(1);
      expect(z.toScale).toBe(1.05);
      expect(z.duration).toBeGreaterThanOrEqual(4 - 1e-6);
    }
  });

  it("says why when there is nothing to alternate between (a single shot) and keeps zooms of the user's own", async () => {
    const t = TemplateSchema.parse({
      ...get("hormozi-captions"),
      cleanup: { skip: true, reason: "Keep every pause for this test." },
    });
    const ctx = ctxFor(fakeProject(30));
    const r = await applyTemplate(ctx, t, allVars(t));
    expect(mainClips(ctx.session.project)).toHaveLength(1);
    const step = r.steps.find((s) => s.id === "punch-ins");
    expect(step?.status).toBe("skipped");
    expect(step?.detail).toMatch(/single shot/);
    expect(zoomsOf(ctx.session.project)).toHaveLength(0);

    // A zoom the user made covers one of the shots: theirs wins, and the report says so.
    const own = ctxFor(fakeProject(60));
    await applyTemplate(own, get("hormozi-captions"), {});
    const first = zoomsOf(own.session.project)[0];
    expect(first).toBeDefined();
    const { runCommand } = await import("./commands.js");
    await runCommand(own, "remove_zoom", { zoomId: first?.id });
    await runCommand(own, "add_zoom", {
      start: Math.max(0, (first?.start ?? 0) - 0.01),
      end: (first?.start ?? 0) + (first?.duration ?? 1) + 0.01,
      scale: 1.4,
    });
    const r2 = await applyTemplate(own, get("hormozi-captions"), {});
    expect(r2.steps.find((s) => s.id === "punch-ins")?.detail).toMatch(/overlap your own zooms/);
    expect(zoomsOf(own.session.project).some((z) => z.toScale === 1.4)).toBe(true);
  });

  it("without a music file it says what to do instead of faking one", async () => {
    const t = get("hormozi-captions");
    const ctx = ctxFor(fakeProject(30));
    const r = await applyTemplate(ctx, t, {});
    const step = r.steps.find((s) => s.id === "music-bed");
    expect(step?.status).toBe("skipped");
    expect(step?.detail).toMatch(/add_audio/);
    expect(audioClips(ctx.session.project)).toHaveLength(0);
  });

  it("places supplied music under the whole video, ducked, once, however often it is applied", async () => {
    const t = get("hormozi-captions");
    const ctx = ctxFor(fakeProject(40));
    const r = await applyTemplate(ctx, t, {}, { music: song });
    const p = ctx.session.project;
    const D = timelineDuration(p);
    expect(audioClips(p)).toHaveLength(1);
    expect(audioClips(p)[0]).toMatchObject({
      id: "tpl-hormozi-captions-music-bed",
      role: "music",
      start: 0,
      loop: true,
      volume: 0.12,
    });
    expect(audioClips(p)[0]?.length).toBeCloseTo(D, 6);
    expect(p.timeline.ducking?.enabled).toBe(true);
    expect(p.assets.song).toBeDefined();
    expect(r.steps.find((s) => s.id === "music-bed")).toMatchObject({
      kind: "effect",
      status: "done",
    });
    const once = structuredClone(p);
    await applyTemplate(ctx, t, {}, { music: song });
    expect(ctx.session.project).toEqual(once);
    // One undo takes the whole template, music and its import included.
    await ctx.session.undo();
    expect(ctx.session.project.assets.song).toBeUndefined();
  });

  it("with music already on the timeline it only turns ducking on, and leaves the user's clip alone", async () => {
    const t = get("events-weddings");
    const ctx = ctxFor(addAsset(fakeProject(40), song));
    const { runCommand } = await import("./commands.js");
    await runCommand(ctx, "add_audio", { assetId: "song", loop: true, volume: 0.5 });
    await runCommand(ctx, "set_ducking", { enabled: false });
    const mine = structuredClone(audioClips(ctx.session.project)[0]);
    const r = await applyTemplate(ctx, t, allVars(t));
    expect(audioClips(ctx.session.project)).toEqual([mine]);
    expect(ctx.session.project.timeline.ducking).toMatchObject({ enabled: true, amountDb: 20 });
    expect(r.steps.find((s) => s.id === "bed")).toMatchObject({ kind: "effect", status: "done" });
  });

  it("an intro-only bed is placed for the intro, and flagged when the user's music runs much longer", async () => {
    const t = get("internal-training");
    const ctx = ctxFor(fakeProject(60));
    await applyTemplate(ctx, t, allVars(t), { music: song });
    expect(audioClips(ctx.session.project)[0]?.length).toBe(10);

    const long = ctxFor(addAsset(fakeProject(60), song));
    const { runCommand } = await import("./commands.js");
    await runCommand(long, "add_audio", { assetId: "song" });
    const r = await applyTemplate(long, t, allVars(t));
    expect(r.steps.find((s) => s.id === "intro-bed")?.status).toBe("needs-review");
  });

  it("rejects music that has no sound, as a skipped step with the reason", async () => {
    const t = get("hormozi-captions");
    const ctx = ctxFor(fakeProject(30));
    const mute: Asset = { ...song, id: "mute", kind: "video", hasAudio: false };
    const r = await applyTemplate(ctx, t, {}, { music: mute });
    const step = r.steps.find((s) => s.id === "music-bed");
    expect(step?.status).toBe("skipped");
    expect(step?.detail).toMatch(/no sound/);
  });

  it("places a supplied logo on the end card, replaces it on a second run, and skips without one", async () => {
    const t = get("minimal-corporate-linkedin");
    const none = ctxFor(fakeProject(40));
    const r0 = await applyTemplate(none, t, allVars(t));
    expect(r0.steps.find((s) => s.id === "logo")?.status).toBe("skipped");
    expect(none.session.project.timeline.images ?? []).toHaveLength(0);

    const ctx = ctxFor(fakeProject(40));
    await applyTemplate(ctx, t, allVars(t), { logo });
    const D = timelineDuration(ctx.session.project);
    const images = ctx.session.project.timeline.images ?? [];
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      id: "tpl-minimal-corporate-linkedin-logo",
      assetId: "logo",
      preset: "logo-end-card",
      position: "top",
    });
    expect((images[0]?.start ?? 0) + (images[0]?.duration ?? 0)).toBeCloseTo(D, 2);
    const once = structuredClone(ctx.session.project);
    await applyTemplate(ctx, t, allVars(t), { logo });
    expect(ctx.session.project).toEqual(once);

    const wrong = ctxFor(fakeProject(40));
    const r2 = await applyTemplate(wrong, t, allVars(t), { logo: song });
    expect(r2.steps.find((s) => s.id === "logo")?.detail).toMatch(/not a picture/);
  });

  it("with existing: skip, an effect already on the timeline is left as it is", async () => {
    const t = get("hormozi-captions");
    const ctx = ctxFor(fakeProject(60));
    await applyTemplate(ctx, t, {}, { music: song });
    const r = await applyTemplate(ctx, t, {}, { music: song, existing: "skip" });
    expect(r.steps.find((s) => s.id === "punch-ins")?.detail).toMatch(/Already on the timeline/);
    expect(r.steps.find((s) => s.id === "music-bed")?.status).toBe("skipped");
  });

  it("a template that was applied is one undo step, effects included", async () => {
    const t = get("hormozi-captions");
    const original = fakeProject(60);
    const ctx = ctxFor(original);
    await applyTemplate(ctx, t, allVars(t), { music: song });
    expect(ctx.session.history()).toHaveLength(2);
    await ctx.session.undo();
    expect(ctx.session.project).toEqual(original);
  });
});

// ---------- registry commands ----------

describe("template commands", () => {
  const [list, apply] = TEMPLATE_COMMANDS as unknown as [CommandDef, CommandDef];

  beforeAll(() => configureTemplates({ templates }));

  it("have unique snake_case names, a model-readable description and an object JSON schema", () => {
    expect(TEMPLATE_COMMANDS.map((c) => c.name)).toEqual(["list_templates", "apply_template"]);
    for (const c of TEMPLATE_COMMANDS) {
      expect(c.description.length).toBeGreaterThan(40);
      const js = zodToJsonSchema(c.schema, { $refStrategy: "none" }) as Record<string, unknown>;
      expect(js.type).toBe("object");
    }
    expect(list.readOnly).toBe(true);
    expect(apply.readOnly).toBe(false);
    expect(apply.irreversible).toBe(false);
  });

  it("list_templates filters by kind and words", async () => {
    const ctx = ctxFor(fakeProject(10));
    const all = await list.run(ctx, {} as never);
    expect((all.data as unknown[]).length).toBe(templates.length);
    const industry = await list.run(ctx, { kind: "industry" } as never);
    expect((industry.data as unknown[]).length).toBe(industries.length);
    const re = await list.run(ctx, { query: "real estate" } as never);
    expect((re.data as { id: string }[]).map((d) => d.id)).toEqual(["real-estate-listing"]);
    const tiktok = await list.run(ctx, { query: "tiktok" } as never);
    expect((tiktok.data as unknown[]).length).toBeGreaterThan(3);
  });

  it("apply_template validates its arguments and applies through the registry-style call", async () => {
    expect(apply.schema.safeParse({ templateId: "x", variables: { a: { b: 1 } } }).success).toBe(
      false,
    );
    const parsed = apply.schema.parse({ templateId: "hormozi-captions" });
    expect(parsed).toMatchObject({ variables: {}, existing: "replace" });
    expect(
      apply.schema.safeParse({ templateId: "x", music: "/a/b.mp3", logo: "asset_1" }).success,
    ).toBe(true);
    const ctx = ctxFor(fakeProject(30));
    const r = await apply.run(ctx, {
      templateId: "hormozi-captions",
      variables: { title: "Hello" },
      existing: "replace",
    } as never);
    expect(r.summary).toMatch(/not legal advice/);
    expect(ctx.session.project.timeline.overlays.length).toBeGreaterThan(0);
    await expect(
      apply.run(ctx, { templateId: "nope", variables: {}, existing: "replace" } as never),
    ).rejects.toThrow(/Unknown template/);
  });
});

// ---------- end to end with real media ----------

function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasFfmpeg())("templates on generated media (needs ffmpeg)", () => {
  let dir: string;
  let src: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "dax-tpl-e2e-"));
    src = join(dir, "src.mp4");
    // 8 s: tone 2 s, silence 4 s, tone 2 s, with a moving test picture.
    execFileSync("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=d=8:s=320x180:r=30",
      "-f",
      "lavfi",
      "-i",
      "sine=f=440:d=2",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=44100:cl=mono:d=4",
      "-f",
      "lavfi",
      "-i",
      "sine=f=440:d=2",
      "-filter_complex",
      "[1:a][2:a][3:a]concat=n=3:v=0:a=1[a]",
      "-map",
      "0:v",
      "-map",
      "[a]",
      "-c:v",
      "mpeg4",
      "-c:a",
      "aac",
      "-shortest",
      src,
    ]);
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  async function imported(): Promise<CommandContext> {
    const ctx = ctxFor(emptyProject("e2e"));
    const asset = await probe(src);
    await ctx.session.apply((p) => appendClip(addAsset(p, asset), asset.id));
    return ctx;
  }

  it("cuts the silence with the preset, sets the format and adds timed overlays", async () => {
    const ctx = await imported();
    const t = templates.find((x) => x.id === "short-form-hooks") as Template;
    const r = await applyTemplate(ctx, t, { title: "Watch this", cta_text: "Follow" });
    const D = timelineDuration(ctx.session.project);
    expect(D).toBeLessThan(6);
    expect(D).toBeGreaterThan(3);
    expect(ctx.session.project.timeline.width).toBe(1080);
    expect(r.steps.find((s) => s.id === "cleanup")?.detail).toMatch(/Removed/);
    const hook = ctx.session.project.timeline.overlays.find((o) => o.id.endsWith("-hook"));
    expect(hook?.start).toBeCloseTo(0.2, 2);
    // history: start, the import, then exactly one entry for the whole template
    expect(ctx.session.history()).toHaveLength(3);
    expect(ctx.session.history()[2]?.source).toBe("template");
  });

  it("adds the zoom moves and music of a style, and the result renders with both", async () => {
    configureTemplates({ templates });
    const apply = TEMPLATE_COMMANDS[1] as CommandDef;
    const music = join(dir, "bed.wav");
    execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=f=220:d=10", music]);
    const ctx = await imported();
    const r = await apply.run(ctx, {
      templateId: "hormozi-captions",
      variables: { title: "Watch this" },
      music,
      existing: "replace",
    } as never);
    const report = r.data as { steps: { id: string; status: string }[] };
    expect(report.steps.find((s) => s.id === "music-bed")?.status).toBe("done");
    expect(report.steps.find((s) => s.id === "punch-ins")?.status).toBe("done");
    expect(audioClips(ctx.session.project)).toHaveLength(1);
    expect(zoomsOf(ctx.session.project).length).toBeGreaterThan(0);
    const out = join(dir, "styled.mp4");
    await exportProject(ctx.session.project, out);
    const info = await probe(out);
    expect(info.duration).toBeCloseTo(timelineDuration(ctx.session.project), 0);
    expect(info.width).toBe(1080);
    // The music is audible (the source's own sound is a 440 Hz tone; 220 Hz is the bed).
    const run = spawnSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-i",
        out,
        "-vn",
        "-af",
        "bandpass=f=220:width_type=h:w=30,astats=metadata=0",
      ].concat(["-f", "null", "-"]),
      { encoding: "utf8" },
    );
    const lines = run.stderr.split("\\n").filter((l) => l.includes("RMS level dB"));
    expect(Number(lines.at(-1)?.split(":").pop())).toBeGreaterThan(-50);
  }, 120_000);

  it("uses audio analysis with cleanup overrides (podcast clip) and the result renders", async () => {
    const ctx = await imported();
    const t = templates.find((x) => x.id === "podcast-clip-audiogram") as Template;
    const r = await applyTemplate(ctx, t, allVars(t));
    expect(r.steps.find((s) => s.id === "cleanup")?.detail).toMatch(/pauseMin/);
    const out = join(dir, "out.mp4");
    await exportProject(ctx.session.project, out);
    const info = await probe(out);
    expect(info.duration).toBeCloseTo(timelineDuration(ctx.session.project), 0);
    expect(info.width).toBe(1080);
    expect(info.height).toBe(1920);
  }, 120_000);
});
