import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL_ID,
  getModel,
  MODEL_CATALOG,
  ramTierFor,
  recommendModel,
} from "./catalog.js";
import { UnsupportedError } from "./errors.js";
import type { HardwareInfo } from "./hardware.js";

const GiB = 1024 ** 3;
const machine = (
  gib: number,
  extra: Partial<Pick<HardwareInfo, "appleSilicon" | "gpus">> = {},
): Pick<HardwareInfo, "totalMemBytes" | "appleSilicon" | "gpus"> => ({
  totalMemBytes: gib * GiB,
  appleSilicon: false,
  gpus: [],
  ...extra,
});

describe("MODEL_CATALOG sanity", () => {
  it("has unique ids and unique download URLs", () => {
    const ids = MODEL_CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    const urls = MODEL_CATALOG.map((m) => m.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it.each(MODEL_CATALOG.map((m) => [m.id, m] as const))(
    "%s has complete, consistent data",
    (_id, m) => {
      expect(m.id).toMatch(/^[a-z0-9._-]+$/);
      expect(m.url.startsWith("https://huggingface.co/")).toBe(true);
      // The URL is pinned to a full commit hash and names the exact file.
      expect(m.source.revision).toMatch(/^[0-9a-f]{40}$/);
      expect(m.url).toBe(
        `https://huggingface.co/${m.source.repo}/resolve/${m.source.revision}/${m.source.file}`,
      );
      expect(m.source.file.endsWith(".gguf")).toBe(true);
      expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(Number.isInteger(m.sizeBytes)).toBe(true);
      expect(m.sizeBytes).toBeGreaterThan(100 * 1024 ** 2);
      expect(m.contextTokens).toBeGreaterThanOrEqual(8192);
      expect(m.contextTokens).toBeLessThanOrEqual(m.maxContextTokens);
      expect(m.minRamBytes).toBeGreaterThan(m.sizeBytes);
      expect(m.toolCalling.notes.length).toBeGreaterThan(20);
      expect(m.summary.length).toBeGreaterThan(5);
    },
  );

  it("only lists models with a licence that allows commercial use and redistribution", () => {
    for (const m of MODEL_CATALOG) {
      expect(m.license.spdx).toBe("Apache-2.0");
      expect(m.license.commercialUseAndRedistribution).toBe(true);
      expect(m.license.url.startsWith("https://")).toBe(true);
      expect(m.license.quote.toLowerCase()).toContain("apache");
    }
  });

  it("has a default that is Gemma-class and listed", () => {
    expect(getModel(DEFAULT_MODEL_ID).family).toBe("gemma");
    expect(getModel(DEFAULT_MODEL_ID).recommendedFor).toBe("small");
  });

  it("gives every fallback an existing, different-family or different-size model", () => {
    for (const m of MODEL_CATALOG) {
      if (!m.fallbackId) continue;
      const fallback = getModel(m.fallbackId);
      expect(fallback.id).not.toBe(m.id);
    }
    expect(getModel(DEFAULT_MODEL_ID).fallbackId).toBeDefined();
    expect(getModel(getModel(DEFAULT_MODEL_ID).fallbackId as string).family).not.toBe("gemma");
  });

  it("has exactly one automatic recommendation per tier", () => {
    for (const tier of ["tiny", "small", "medium", "large"] as const) {
      expect(MODEL_CATALOG.filter((m) => m.recommendedFor === tier)).toHaveLength(1);
    }
  });

  it("is sorted by file size, smallest first among recommended models", () => {
    const recommended = MODEL_CATALOG.filter((m) => m.recommendedFor);
    const sizes = recommended.map((m) => m.sizeBytes);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
  });
});

describe("getModel", () => {
  it("throws a helpful error for unknown ids", () => {
    expect(() => getModel("nope")).toThrow(UnsupportedError);
    expect(() => getModel("nope")).toThrow(/Known ids/);
  });
});

describe("ramTierFor", () => {
  it.each([
    [2, "tiny"],
    [5.9, "tiny"],
    [7.6, "small"], // an "8 GB" laptop
    [11.9, "small"],
    [15.5, "medium"], // a "16 GB" laptop
    [23.4, "medium"], // a "24 GB" laptop
    [31, "large"],
    [64, "large"],
  ] as const)("%f GiB -> %s", (gib, tier) => {
    expect(ramTierFor(gib * GiB)).toBe(tier);
  });
});

describe("recommendModel", () => {
  it("recommends the small Qwen model below 6 GiB", () => {
    const r = recommendModel(machine(4));
    expect(r.model.id).toBe("qwen3.5-2b-q4km");
    expect(r.tier).toBe("tiny");
    expect(r.fits).toBe(true);
  });

  it("recommends the Gemma E2B default on 8 GB machines", () => {
    const r = recommendModel(machine(7.6));
    expect(r.model.id).toBe(DEFAULT_MODEL_ID);
    expect(r.fallback?.family).toBe("qwen");
  });

  it("recommends Gemma E4B on 16 GB machines", () => {
    expect(recommendModel(machine(15.5)).model.id).toBe("gemma-4-e4b-qat-q4_0");
  });

  it("keeps big-RAM CPU-only machines on E4B (a dense 12B is too slow on CPU)", () => {
    expect(recommendModel(machine(64)).model.id).toBe("gemma-4-e4b-qat-q4_0");
  });

  it("recommends the 12B on Apple Silicon or a strong discrete GPU with lots of RAM", () => {
    expect(recommendModel(machine(32, { appleSilicon: true })).model.id).toBe(
      "gemma-4-12b-qat-q4_0",
    );
    const gpu = { kind: "nvidia", discrete: true, vramBytes: 12 * GiB } as const;
    expect(recommendModel(machine(32, { gpus: [gpu] })).model.id).toBe("gemma-4-12b-qat-q4_0");
    const weak = { kind: "nvidia", discrete: true, vramBytes: 4 * GiB } as const;
    expect(recommendModel(machine(32, { gpus: [weak] })).model.id).toBe("gemma-4-e4b-qat-q4_0");
  });

  it("never recommends the huge MoE automatically", () => {
    for (const gib of [8, 16, 32, 128]) {
      expect(recommendModel(machine(gib, { appleSilicon: true })).model.id).not.toBe(
        "gemma-4-26b-a4b-qat-q4_0",
      );
    }
  });

  it("steps down when RAM is below a model's advised minimum and warns when nothing fits", () => {
    const r = recommendModel(machine(2));
    expect(r.model.id).toBe("qwen3.5-2b-q4km");
    expect(r.fits).toBe(false);
    expect(r.reason).toMatch(/only 2\.0 GB/);
  });

  it("works with a custom catalog", () => {
    const only = MODEL_CATALOG.filter((m) => m.id === "qwen3.5-2b-q4km");
    expect(recommendModel(machine(64), only).model.id).toBe("qwen3.5-2b-q4km");
  });
});
