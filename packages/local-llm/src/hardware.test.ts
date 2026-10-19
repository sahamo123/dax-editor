import os from "node:os";
import { describe, expect, it } from "vitest";
import {
  detectHardware,
  gpuKindFromPciVendor,
  parseNvidiaSmi,
  parseWindowsVideoControllers,
} from "./hardware.js";
import { LogRingBuffer } from "./ring-buffer.js";

describe("detectHardware", () => {
  it("reports RAM, CPU and platform without probing GPUs", async () => {
    const hw = await detectHardware({ probeGpu: false });
    expect(hw.totalMemBytes).toBe(os.totalmem());
    expect(hw.cpuThreads).toBeGreaterThan(0);
    expect(hw.platform).toBe(process.platform);
    expect(hw.arch).toBe(process.arch);
    expect(hw.gpus).toEqual([]);
    expect(hw.appleSilicon).toBe(process.platform === "darwin" && process.arch === "arm64");
  });

  it("never throws when probing GPUs, whatever the machine has", async () => {
    const hw = await detectHardware({ probeTimeoutMs: 1500 });
    expect(Array.isArray(hw.gpus)).toBe(true);
  });
});

describe("GPU parsers", () => {
  it("parses nvidia-smi csv output", () => {
    const gpus = parseNvidiaSmi("NVIDIA GeForce RTX 4070, 12282\nNVIDIA T4, 15360\n");
    expect(gpus).toEqual([
      {
        kind: "nvidia",
        name: "NVIDIA GeForce RTX 4070",
        discrete: true,
        vramBytes: 12282 * 1048576,
      },
      { kind: "nvidia", name: "NVIDIA T4", discrete: true, vramBytes: 15360 * 1048576 },
    ]);
  });

  it("ignores garbage lines", () => {
    expect(parseNvidiaSmi("\nNo devices were found\n")).toEqual([]);
  });

  it("maps PCI vendor ids", () => {
    expect(gpuKindFromPciVendor("0x10de\n")).toBe("nvidia");
    expect(gpuKindFromPciVendor("0x1002")).toBe("amd");
    expect(gpuKindFromPciVendor("0x8086")).toBe("intel");
    expect(gpuKindFromPciVendor("0x1af4")).toBe("other");
  });

  it("parses Windows video controller JSON (single object and array)", () => {
    const one = parseWindowsVideoControllers('{"Name":"Intel(R) UHD Graphics 620"}');
    expect(one).toEqual([{ kind: "intel", name: "Intel(R) UHD Graphics 620", discrete: false }]);
    const many = parseWindowsVideoControllers(
      '[{"Name":"NVIDIA GeForce GTX 1650"},{"Name":"AMD Radeon(TM) Graphics"}]',
    );
    expect(many.map((g) => [g.kind, g.discrete])).toEqual([
      ["nvidia", true],
      ["amd", false],
    ]);
    expect(parseWindowsVideoControllers("not json")).toEqual([]);
  });
});

describe("LogRingBuffer", () => {
  it("keeps only the newest lines", () => {
    const b = new LogRingBuffer(3);
    b.push("a\nb\nc\nd\ne\n");
    expect(b.tail()).toEqual(["c", "d", "e"]);
    expect(b.size).toBe(3);
    expect(b.tail(2)).toEqual(["d", "e"]);
  });

  it("joins lines split across chunks and handles CRLF", () => {
    const b = new LogRingBuffer(10);
    expect(b.push("hel")).toEqual([]);
    expect(b.push("lo\r\nwor")).toEqual(["hello"]);
    b.flush();
    expect(b.tail()).toEqual(["hello", "wor"]);
  });

  it("rejects an invalid capacity", () => {
    expect(() => new LogRingBuffer(0)).toThrow(/positive integer/);
  });
});
