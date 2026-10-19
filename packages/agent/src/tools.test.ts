import { commandTools } from "@dax/core";
import { describe, expect, it } from "vitest";
import { coerceArguments, toolSignature, toToolDefinition } from "./tools.js";

const tool = (name: string) => {
  const t = commandTools({ names: [name] })[0];
  if (!t) throw new Error(`no tool ${name}`);
  return t;
};

describe("toToolDefinition", () => {
  it("full style keeps the description and every schema detail", () => {
    const def = toToolDefinition(tool("delete_range"), "full");
    expect(def.description).toBe(tool("delete_range").description);
    expect(JSON.stringify(def.parameters)).toContain("in seconds");
  });

  it("compact style keeps names, types, enums, limits and required, and drops most prose", () => {
    const def = toToolDefinition(tool("add_overlay"), "compact");
    const params = def.parameters as {
      properties: Record<string, Record<string, unknown>>;
      required: string[];
    };
    expect(def.name).toBe("add_overlay");
    expect(params.required).toEqual(["preset", "start"]);
    // A field whose description names a unit keeps a short hint, so the unit is not lost.
    expect(params.properties.start).toEqual({
      type: "number",
      minimum: 0,
      description: "When the text appears, in seconds",
    });
    expect(params.properties.position?.enum).toEqual(["center", "top", "bottom", "lower-third"]);
    // A field without a unit keeps no prose at all.
    expect(params.properties.position).not.toHaveProperty("description");
    expect(def.description.length).toBeLessThanOrEqual(163);
  });

  it("compact style keeps limits, defaults and the shape of free-form objects", () => {
    const def = toToolDefinition(tool("detect_silence"), "compact");
    const noise = (def.parameters as { properties: Record<string, Record<string, unknown>> })
      .properties.noiseDb;
    expect(noise).toMatchObject({ type: "number", minimum: -80, maximum: -5, default: -30 });
    const tpl = toToolDefinition(tool("apply_template"), "compact");
    const vars = (tpl.parameters as { properties: Record<string, Record<string, unknown>> })
      .properties.variables;
    expect(vars).toMatchObject({ type: "object", additionalProperties: expect.any(Object) });
  });

  it("compact style is much smaller than full for the whole registry", () => {
    const size = (style: "full" | "compact") =>
      JSON.stringify(commandTools().map((t) => toToolDefinition(t, style))).length;
    // Limits and units are kept on purpose, so compact is not as small as it once was; it is still clearly smaller.
    expect(size("compact")).toBeLessThan(size("full") * 0.8);
  });

  it("compact descriptions are the first sentence", () => {
    const def = toToolDefinition(tool("split"), "compact");
    expect(def.description).toBe("Cut the clip at one timeline time into two clips.");
  });

  it("accepts a function for custom styles", () => {
    const def = toToolDefinition(tool("split"), (t) => ({
      name: t.name.toUpperCase(),
      description: "x",
      parameters: {},
    }));
    expect(def).toEqual({ name: "SPLIT", description: "x", parameters: {} });
  });
});

describe("toolSignature", () => {
  it("lists arguments with types and marks optional ones", () => {
    expect(toolSignature(tool("delete_range"))).toBe("delete_range(from: number, to: number)");
    expect(toolSignature(tool("trim_clip"))).toBe(
      "trim_clip(clipId: string, in?: number, out?: number)",
    );
    expect(toolSignature(tool("get_project"))).toBe(
      "get_project(offset?: integer, limit?: integer)",
    );
  });

  it("shows enums, lists and nested objects", () => {
    expect(toolSignature(tool("keep_only"))).toBe(
      "keep_only(ranges: Array<{start: number, end: number}>)",
    );
    expect(toolSignature(tool("update_overlay"))).toContain('animation?: "none"|"fade"');
    expect(toolSignature(tool("update_overlay"))).toContain("subtitle?: string|null");
  });
});

describe("coerceArguments", () => {
  const schema = (name: string) => tool(name).parameters;

  it("turns numeric strings into numbers", () => {
    const r = coerceArguments({ from: "2", to: "4.5" }, schema("delete_range"));
    expect(r).toEqual({ value: { from: 2, to: 4.5 }, changed: true });
  });

  it("understands a trailing s for seconds", () => {
    expect(coerceArguments({ at: "3s" }, schema("split")).value).toEqual({ at: 3 });
  });

  it("leaves text that is not a number alone, so validation can reject it", () => {
    expect(coerceArguments({ at: "soon" }, schema("split"))).toEqual({
      value: { at: "soon" },
      changed: false,
    });
  });

  it("turns boolean strings into booleans", () => {
    expect(
      coerceArguments({ path: "/a.mp4", overwrite: "true" }, schema("export_video")).value,
    ).toEqual({ path: "/a.mp4", overwrite: true });
  });

  it("drops null for an omitted optional field but keeps null where it is allowed", () => {
    expect(coerceArguments({ clipId: "c1", in: null, out: 3 }, schema("trim_clip")).value).toEqual({
      clipId: "c1",
      out: 3,
    });
    expect(
      coerceArguments({ overlayId: "o1", subtitle: null }, schema("update_overlay")).value,
    ).toEqual({ overlayId: "o1", subtitle: null });
  });

  it("wraps a single object where a list is expected and fixes the numbers inside", () => {
    const r = coerceArguments({ ranges: { start: "0", end: "3" } }, schema("keep_only"));
    expect(r.value).toEqual({ ranges: [{ start: 0, end: 3 }] });
    expect(r.changed).toBe(true);
  });

  it("parses a list written as a JSON string", () => {
    const r = coerceArguments({ ranges: '[{"start": 0, "end": 3}]' }, schema("keep_only"));
    expect(r.value).toEqual({ ranges: [{ start: 0, end: 3 }] });
  });

  it("reports no change for correct arguments", () => {
    expect(coerceArguments({ from: 2, to: 4 }, schema("delete_range")).changed).toBe(false);
  });
});
