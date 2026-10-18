import { describe, expect, it } from "vitest";
import {
  filterPath,
  overlayFilters,
  quoteFilterValue,
  TYPEWRITER_MAX_CHARS,
} from "./overlay-filters.js";
import { overlayFromPreset } from "./presets.js";

const fonts = { regular: "/f/Regular.otf", bold: "/f/Bold.otf" };
const build = (presetId: string, text: string, extra = {}) =>
  overlayFilters(
    overlayFromPreset(presetId, { start: 1, duration: 3, text, ...extra }),
    1280,
    720,
    fonts,
    "/tmp/w",
  );

describe("quoting", () => {
  it("quotes values and escapes apostrophes", () => {
    expect(quoteFilterValue("a:b,c")).toBe("'a:b,c'");
    expect(quoteFilterValue("it's")).toBe("'it'\\''s'");
  });
  it("turns Windows paths into forward-slash quoted paths", () => {
    expect(filterPath("C:\\Users\\me\\Inter.otf")).toBe("'C:/Users/me/Inter.otf'");
  });
});

describe("overlayFilters", () => {
  it("never puts user text in the filter string; it goes to a text file", () => {
    const hostile = `He said: "it's 100%" \\ ; [x] , drawtext=text=pwned`;
    const { filters, files } = build("title-fade", hostile);
    expect(filters.join("")).not.toContain("pwned");
    expect(filters.join("")).toContain("expansion=none");
    expect(files).toHaveLength(1);
    expect(files[0]?.content).toBe(hostile);
    expect(filters[0]).toContain(`textfile='${files[0]?.path}'`);
  });

  it("uses one filter per overlay for fade, slide-up and pop", () => {
    for (const id of ["title-fade", "callout-slide-up", "title-pop", "caption-bottom"]) {
      expect(build(id, "Hello").filters).toHaveLength(1);
    }
  });

  it("draws a lower-third as a name plate and a role plate", () => {
    const { filters, files } = build("lower-third-slide", "Ada", { subtitle: "Engineer" });
    expect(filters).toHaveLength(2);
    expect(files.map((f) => f.content)).toEqual(["Ada", "Engineer"]);
  });

  it("types out one prefix per character, and falls back to a fade for long text", () => {
    expect(build("title-typewriter", "Hey!").filters).toHaveLength(4);
    const long = "x".repeat(TYPEWRITER_MAX_CHARS + 1);
    expect(build("title-typewriter", long).filters).toHaveLength(1);
  });

  it("scales font size with the frame height", () => {
    const o = overlayFromPreset("title-fade", { start: 0, style: { fontSize: 100 } });
    const small = overlayFilters(o, 640, 360, fonts, "/t").filters[0];
    const big = overlayFilters(o, 1920, 1080, fonts, "/t").filters[0];
    expect(small).toContain("fontsize='33'");
    expect(big).toContain("fontsize='100'");
  });

  it("only shows the overlay between its start and end", () => {
    expect(build("title-fade", "Hi").filters[0]).toContain("enable='between(t,1,4)'");
  });
});
