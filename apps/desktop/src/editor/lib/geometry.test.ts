import { describe, expect, it } from "vitest";
import {
  clampZoom,
  DEFAULT_ZOOM,
  fitZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  pxToTime,
  rulerLabel,
  rulerTicks,
  tickSpec,
  timeToPx,
  zoomAround,
} from "./geometry";

describe("zoom maths", () => {
  it("converts between time and pixels", () => {
    expect(timeToPx(2.5, 80)).toBe(200);
    expect(pxToTime(200, 80)).toBe(2.5);
  });

  it("clamps zoom into the supported range and survives garbage", () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM);
    expect(clampZoom(1e9)).toBe(MAX_ZOOM);
    expect(clampZoom(120)).toBe(120);
    expect(clampZoom(Number.NaN)).toBe(DEFAULT_ZOOM);
  });

  it("zooms around an anchor so the time under the pointer stays put", () => {
    const before = { zoom: 100, scrollLeft: 300, anchorViewportX: 250 };
    const anchorTime = (before.scrollLeft + before.anchorViewportX) / before.zoom; // 5.5 s
    const r = zoomAround({ ...before, factor: 2 });
    expect(r.zoom).toBe(200);
    // The same time is still at the same viewport x after zooming.
    expect((r.scrollLeft + before.anchorViewportX) / r.zoom).toBeCloseTo(anchorTime, 6);
  });

  it("never scrolls to a negative offset when zooming out", () => {
    const r = zoomAround({ zoom: 100, factor: 0.5, scrollLeft: 0, anchorViewportX: 400 });
    expect(r.scrollLeft).toBe(0);
  });

  it("stops at the zoom limits", () => {
    expect(zoomAround({ zoom: MAX_ZOOM, factor: 3, scrollLeft: 10, anchorViewportX: 5 }).zoom).toBe(
      MAX_ZOOM,
    );
  });

  it("fits a duration into a width with padding", () => {
    expect(fitZoom(10, 840, 40)).toBe(80);
    expect(fitZoom(0, 840)).toBe(DEFAULT_ZOOM);
    expect(fitZoom(10, 20)).toBe(DEFAULT_ZOOM);
  });
});

describe("ruler ticks", () => {
  it("keeps labelled ticks at least ~84 px apart at every zoom", () => {
    for (const zoom of [2, 5, 20, 80, 300, 1200, 2400]) {
      const spec = tickSpec(zoom, 30);
      expect(spec.major * zoom).toBeGreaterThanOrEqual(84 - 1e-6);
      expect(spec.minor).toBeLessThanOrEqual(spec.major);
    }
  });

  it("uses whole seconds at the default zoom and frames when zoomed far in", () => {
    expect(tickSpec(100, 30).major).toBe(1);
    expect(tickSpec(80, 30).major).toBe(2);
    const fine = tickSpec(2400, 30);
    expect(fine.major).toBeLessThan(0.5);
    expect(fine.minor).toBeCloseTo(1 / 30, 6);
  });

  it("generates minor and major ticks for a window", () => {
    const ticks = rulerTicks(0, 3, { major: 1, minor: 0.5 });
    const major = ticks.filter((t) => t.major).map((t) => t.time);
    expect(major).toEqual(expect.arrayContaining([0, 1, 2, 3]));
    expect(ticks.some((t) => !t.major && Math.abs(t.time - 0.5) < 1e-9)).toBe(true);
    expect(ticks.every((t) => t.time >= 0)).toBe(true);
  });

  it("does not run away on absurd windows", () => {
    expect(rulerTicks(0, 1e9, { major: 1, minor: 0.001 })).toEqual([]);
  });

  it("labels ticks as m:ss, with tenths or frames when finer", () => {
    expect(rulerLabel(65, { major: 5, minor: 1 }, 30)).toBe("1:05");
    expect(rulerLabel(2.5, { major: 0.5, minor: 0.1 }, 30)).toBe("0:02.5");
    expect(rulerLabel(2 + 5 / 30, { major: 5 / 30, minor: 1 / 30 }, 30)).toBe("0:02:05");
  });
});
