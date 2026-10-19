import {
  type Animation,
  TYPEWRITER_MAX_CHARS as CORE_TYPEWRITER_MAX,
  type Overlay,
  overlayFilters,
} from "@dax/core";
import { describe, expect, it } from "vitest";
import { overlay } from "../test-utils";
import {
  edgeSeconds,
  fadeEnvelope,
  LINE_HEIGHT,
  layoutOverlay,
  overlayFrame,
  TYPEWRITER_MAX_CHARS,
  typewriterStep,
  usesTypewriter,
} from "./overlay-anim";

const at = (animation: Animation, extra: Partial<Overlay> = {}) =>
  overlay("o", 10, 4, { animation, ...extra });

describe("fade envelope", () => {
  it("is 0 before, ramps in, holds, ramps out, 0 after", () => {
    const f = (t: number) => fadeEnvelope(t, 10, 14, 0.4, 0.4);
    expect(f(9.9)).toBe(0);
    expect(f(10)).toBe(0);
    expect(f(10.2)).toBeCloseTo(0.5);
    expect(f(10.4)).toBeCloseTo(1);
    expect(f(12)).toBe(1);
    expect(f(13.8)).toBeCloseTo(0.5);
    expect(f(14)).toBe(0);
  });

  it("uses a third of the duration at most for short overlays", () => {
    expect(edgeSeconds(4)).toBe(0.4);
    expect(edgeSeconds(0.6)).toBeCloseTo(0.2);
  });
});

describe("overlayFrame per animation", () => {
  it("is invisible outside [start, start + duration]", () => {
    expect(overlayFrame(at("fade"), 9.99).visible).toBe(false);
    expect(overlayFrame(at("fade"), 14.01).visible).toBe(false);
    expect(overlayFrame(at("fade"), 10).visible).toBe(true);
    expect(overlayFrame(at("fade"), 14).visible).toBe(true);
  });

  it("fade: opacity only, no motion", () => {
    const mid = overlayFrame(at("fade"), 10.2);
    expect(mid.opacity).toBeCloseTo(0.5);
    expect(mid).toMatchObject({ offsetX: 0, offsetY: 0, scale: 1, visibleChars: null });
    expect(overlayFrame(at("fade"), 12).opacity).toBe(1);
  });

  it("none: fully opaque for the whole duration", () => {
    expect(overlayFrame(at("none"), 10).opacity).toBe(1);
    expect(overlayFrame(at("none"), 14).opacity).toBe(1);
  });

  it("slide-up: starts 6% of the frame low and eases to rest (cubic), only on the way in", () => {
    expect(overlayFrame(at("slide-up"), 10).offsetY).toBeCloseTo(0.06);
    const t = 10 + 0.25; // entrance = 0.25 / 0.5 = 0.5 -> (1 - 0.5)^3 = 0.125
    expect(overlayFrame(at("slide-up"), t).offsetY).toBeCloseTo(0.06 * 0.125);
    expect(overlayFrame(at("slide-up"), 11).offsetY).toBe(0);
    expect(overlayFrame(at("slide-up"), 13.9).offsetY).toBe(0);
  });

  it("slide-left: starts 30% of the frame to the left", () => {
    expect(overlayFrame(at("slide-left"), 10).offsetX).toBeCloseTo(-0.3);
    expect(overlayFrame(at("slide-left"), 10.25).offsetX).toBeCloseTo(-0.3 * 0.125);
    expect(overlayFrame(at("slide-left"), 12).offsetX).toBeCloseTo(0, 9);
  });

  it("pop: scales linearly from 50% to 100% over a quarter second", () => {
    expect(overlayFrame(at("pop"), 10).scale).toBeCloseTo(0.5);
    expect(overlayFrame(at("pop"), 10.125).scale).toBeCloseTo(0.75);
    expect(overlayFrame(at("pop"), 10.25).scale).toBeCloseTo(1);
    expect(overlayFrame(at("pop"), 12).scale).toBe(1);
  });

  it("typewriter: reveals one letter per step, fully opaque until the fade-out", () => {
    const o = at("typewriter", { text: "Hello" });
    const step = typewriterStep(4, 5);
    expect(step).toBeCloseTo(0.08);
    expect(overlayFrame(o, 10).visibleChars).toBe(1);
    expect(overlayFrame(o, 10 + step * 2.01).visibleChars).toBe(3);
    expect(overlayFrame(o, 11).visibleChars).toBe(5);
    expect(overlayFrame(o, 11).opacity).toBe(1);
    expect(overlayFrame(o, 13.8).opacity).toBeCloseTo(0.5);
  });

  it("typewriter: letter step is capped by 60% of the duration for long text", () => {
    expect(typewriterStep(1, 60)).toBeCloseTo(0.01);
    expect(typewriterStep(10, 5)).toBe(0.08);
  });

  it("typewriter falls back to a fade for long text", () => {
    const long = "x".repeat(TYPEWRITER_MAX_CHARS + 1);
    const o = at("typewriter", { text: long });
    expect(usesTypewriter(o)).toBe(false);
    expect(overlayFrame(o, 10.2).visibleChars).toBeNull();
    expect(overlayFrame(o, 10.2).opacity).toBeCloseTo(0.5);
  });
});

describe("agreement with the export (packages/core/src/overlay-filters.ts)", () => {
  const fonts = { regular: "/f/r.otf", bold: "/f/b.otf" };
  const filters = (o: ReturnType<typeof overlay>) =>
    overlayFilters(o, 1000, 1000, fonts, "/tmp/x").filters.join("\n");

  it("uses the same typewriter limit", () => {
    expect(TYPEWRITER_MAX_CHARS).toBe(CORE_TYPEWRITER_MAX);
  });

  it("uses the same slide distances, pop range and edge length", () => {
    expect(filters(at("slide-up"))).toContain("+60*pow(1-");
    expect(filters(at("slide-left"))).toContain("-300*pow(1-");
    expect(filters(at("pop"))).toContain("*(0.5+0.5*");
    // Entrance eases over edge + 0.1 s and fades over the 0.4 s edge.
    expect(filters(at("slide-up"))).toContain("/0.5)");
    expect(filters(at("fade"))).toContain("/0.4,");
  });

  it("draws one drawtext per letter for the typewriter, at the same step", () => {
    const o = at("typewriter", { text: "Hello" });
    const n = overlayFilters(o, 1000, 1000, fonts, "/tmp/x").filters.length;
    expect(n).toBe(5);
    expect(filters(o)).toContain(`between(t,${(10 + typewriterStep(4, 5)).toFixed(2)}`);
  });

  it("places lines where the export does (as a fraction of the frame)", () => {
    const top = layoutOverlay(
      overlay("o", 0, 3, {
        style: {
          fontSize: 108,
          color: "#fff",
          bold: false,
          accent: "#3b82f6",
          position: "top",
        } as never,
      }),
    );
    expect(top[0]?.topCqh).toBe(10);
    expect(
      filters(overlay("o", 0, 3, { style: { ...overlay("o", 0, 3).style, position: "top" } })),
    ).toContain("y='100'");
    const lower = layoutOverlay(
      overlay("o", 0, 3, {
        subtitle: "Role",
        style: { ...overlay("o", 0, 3).style, fontSize: 54, position: "lower-third" },
      }),
    );
    expect(lower[0]).toMatchObject({ leftCqw: 8, topCqh: 72, hAlign: "left" });
    // Second plate sits below the first by 1.85 x the font size.
    expect(lower[1]?.topCqh).toBeCloseTo(72 + (54 / 1080) * 100 * 1.85, 6);
    expect(lower[1]?.sizeCqh).toBeCloseTo((54 / 1080) * 100 * 0.6, 6);
  });
});

describe("layoutOverlay", () => {
  const style = (extra: object) => ({
    fontSize: 108,
    color: "#ffffff",
    bold: true,
    accent: "#3b82f6",
    position: "center" as const,
    ...extra,
  });

  it("centres the main line and scales its size with the frame height", () => {
    const [main] = layoutOverlay(overlay("o", 0, 3, { style: style({}) }));
    expect(main?.sizeCqh).toBeCloseTo(10); // 108 / 1080 of the frame height
    expect(main?.hAlign).toBe("center");
    expect(main?.topCqh).toBeCloseTo(50 - (10 * LINE_HEIGHT) / 2, 6);
    expect(main?.originY).toBe("center");
  });

  it("puts bottom text so its bottom edge sits 8% above the frame bottom", () => {
    const [main] = layoutOverlay(overlay("o", 0, 3, { style: style({ position: "bottom" }) }));
    expect((main?.topCqh ?? 0) + 10 * LINE_HEIGHT).toBeCloseTo(92, 6);
    expect(main?.originY).toBe("bottom");
  });

  it("only draws a box when its opacity is above zero", () => {
    expect(
      layoutOverlay(
        overlay("o", 0, 3, { style: style({ box: { color: "#000000", opacity: 0 } }) }),
      )[0]?.box,
    ).toBeNull();
    const boxed = layoutOverlay(
      overlay("o", 0, 3, { style: style({ box: { color: "#000000", opacity: 0.5 } }) }),
    )[0];
    expect(boxed?.box).toEqual({ color: "#000000", opacity: 0.5 });
    expect(boxed?.padCqh).toBeCloseTo(3); // 30% of the font size
  });

  it("second line is smaller, regular weight, and 1.4 sizes below", () => {
    const parts = layoutOverlay(overlay("o", 0, 3, { subtitle: "Sub", style: style({}) }));
    expect(parts).toHaveLength(2);
    expect(parts[1]?.sizeCqh).toBeCloseTo(10 * 0.55);
    expect(parts[1]?.bold).toBe(false);
    expect((parts[1]?.topCqh ?? 0) - (parts[0]?.topCqh ?? 0)).toBeCloseTo(14, 6);
  });

  it("lower-third name plate is always a solid accent box", () => {
    const [main] = layoutOverlay(
      overlay("o", 0, 3, { style: style({ position: "lower-third", accent: "#ff0000" }) }),
    );
    expect(main?.box).toEqual({ color: "#ff0000", opacity: 1 });
  });

  it("typewriter is left aligned at 10% and ignores the subtitle (as in the export)", () => {
    const parts = layoutOverlay(
      overlay("o", 0, 3, {
        animation: "typewriter",
        text: "Typing",
        subtitle: "ignored",
        style: style({}),
      }),
    );
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ typed: true, hAlign: "left", leftCqw: 10 });
  });

  it("accounts for multiple lines when centring", () => {
    const one = layoutOverlay(overlay("o", 0, 3, { text: "a", style: style({}) }))[0];
    const two = layoutOverlay(overlay("o", 0, 3, { text: "a\nb", style: style({}) }))[0];
    expect((one?.topCqh ?? 0) - (two?.topCqh ?? 0)).toBeCloseTo((10 * LINE_HEIGHT) / 2, 6);
  });
});
