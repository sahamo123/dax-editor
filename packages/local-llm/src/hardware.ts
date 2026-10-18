/**
 * Best-effort detection of the machine's CPU, RAM and GPU, used to pick a model and a llama.cpp
 * build. Never throws: anything it cannot determine is reported as unknown. No network.
 */
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** One graphics adapter found on the machine. */
export interface GpuInfo {
  /** Vendor family. `apple` means the integrated Apple Silicon GPU (shares system RAM). */
  kind: "apple" | "nvidia" | "amd" | "intel" | "other";
  /** Marketing name when known. */
  name?: string;
  /** Dedicated video memory in bytes, when known. Absent for shared-memory GPUs. */
  vramBytes?: number;
  /** True for a separate card with its own memory (the kind that speeds up inference). */
  discrete: boolean;
}

/** What {@link detectHardware} found out about the machine. All sizes are bytes. */
export interface HardwareInfo {
  /** Node's `process.platform` value (`darwin`, `win32`, `linux`, ...). */
  platform: NodeJS.Platform;
  /** Node's `process.arch` value (`x64`, `arm64`, ...). */
  arch: string;
  /** CPU model string, empty when unknown. */
  cpuModel: string;
  /** Number of logical CPU threads available to this process. */
  cpuThreads: number;
  /** Total physical RAM in bytes. */
  totalMemBytes: number;
  /** RAM that is free right now in bytes (informational; the OS caches aggressively). */
  freeMemBytes: number;
  /** True on Apple Silicon, where the GPU uses the same memory pool as the CPU. */
  appleSilicon: boolean;
  /** Graphics adapters found; empty when none or when probing failed. */
  gpus: GpuInfo[];
}

/** Options for {@link detectHardware}. */
export interface DetectHardwareOptions {
  /** Look for GPUs by running small system tools (`nvidia-smi`, PowerShell). Default `true`. */
  probeGpu?: boolean;
  /** Milliseconds to wait for each probe before giving up. Default 4000. */
  probeTimeoutMs?: number;
}

/** Parse `nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits` output (MiB). */
export function parseNvidiaSmi(stdout: string): GpuInfo[] {
  const gpus: GpuInfo[] = [];
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    const comma = line.lastIndexOf(",");
    if (comma < 0) continue;
    const name = line.slice(0, comma).trim();
    const mib = Number(line.slice(comma + 1).trim());
    gpus.push({
      kind: "nvidia",
      name,
      discrete: true,
      ...(Number.isFinite(mib) && mib > 0 ? { vramBytes: mib * 1024 * 1024 } : {}),
    });
  }
  return gpus;
}

/** Map a PCI vendor id (as in `/sys/class/drm/card0/device/vendor`) to a {@link GpuInfo} kind. */
export function gpuKindFromPciVendor(vendorId: string): GpuInfo["kind"] {
  switch (vendorId.trim().toLowerCase()) {
    case "0x10de":
      return "nvidia";
    case "0x1002":
      return "amd";
    case "0x8086":
      return "intel";
    default:
      return "other";
  }
}

/** Parse the JSON produced by `Get-CimInstance Win32_VideoController | ConvertTo-Json`. */
export function parseWindowsVideoControllers(stdout: string): GpuInfo[] {
  let data: unknown;
  try {
    data = JSON.parse(stdout);
  } catch {
    return [];
  }
  const list = Array.isArray(data) ? data : [data];
  const gpus: GpuInfo[] = [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const name = (item as { Name?: unknown }).Name;
    if (typeof name !== "string") continue;
    const lower = name.toLowerCase();
    const kind: GpuInfo["kind"] = lower.includes("nvidia")
      ? "nvidia"
      : lower.includes("amd") || lower.includes("radeon")
        ? "amd"
        : lower.includes("intel")
          ? "intel"
          : "other";
    // Intel/AMD integrated parts report names such as "Intel(R) UHD Graphics" or "AMD Radeon(TM)
    // Graphics"; treat NVIDIA and "RX"/"Arc" parts as discrete. This is a heuristic only.
    const discrete = kind === "nvidia" || /\brx\b|\barc\b|\bpro\b/i.test(name);
    // AdapterRAM is a 32-bit field and saturates at 4 GiB, so it is not trusted as VRAM.
    gpus.push({ kind, name, discrete });
  }
  return gpus;
}

async function probeLinuxDrm(): Promise<GpuInfo[]> {
  const gpus: GpuInfo[] = [];
  const root = "/sys/class/drm";
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return gpus;
  }
  for (const entry of entries) {
    // Only the "cardN" nodes; connectors look like "card0-HDMI-A-1".
    if (!/^card\d+$/.test(entry)) continue;
    try {
      const vendor = await readFile(join(root, entry, "device", "vendor"), "utf8");
      const kind = gpuKindFromPciVendor(vendor);
      let vramBytes: number | undefined;
      try {
        const vram = await readFile(join(root, entry, "device", "mem_info_vram_total"), "utf8");
        const n = Number(vram.trim());
        if (Number.isFinite(n) && n > 0) vramBytes = n;
      } catch {
        // Only amdgpu exposes this file.
      }
      gpus.push({
        kind,
        // A card that reports dedicated VRAM, or an NVIDIA card, is discrete.
        discrete: kind === "nvidia" || (vramBytes !== undefined && vramBytes >= 1024 ** 3),
        ...(vramBytes !== undefined ? { vramBytes } : {}),
      });
    } catch {
      // Not a PCI device we can read; skip it.
    }
  }
  return gpus;
}

async function run(file: string, args: string[], timeout: number): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(file, args, { timeout, windowsHide: true });
    return stdout;
  } catch {
    return undefined;
  }
}

async function probeGpus(timeout: number): Promise<GpuInfo[]> {
  if (process.platform === "darwin") {
    return process.arch === "arm64"
      ? [{ kind: "apple", name: "Apple Silicon GPU", discrete: false }]
      : [];
  }
  if (process.platform === "win32") {
    const out = await run(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_VideoController | Select-Object Name | ConvertTo-Json",
      ],
      timeout,
    );
    return out ? parseWindowsVideoControllers(out) : [];
  }
  const smi = await run(
    "nvidia-smi",
    ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
    timeout,
  );
  const nvidia = smi ? parseNvidiaSmi(smi) : [];
  const drm = await probeLinuxDrm();
  // nvidia-smi knows the VRAM exactly, so drop the sysfs entries for NVIDIA to avoid duplicates.
  return [...nvidia, ...drm.filter((g) => !(g.kind === "nvidia" && nvidia.length > 0))];
}

/**
 * Inspect the machine. RAM and CPU come from Node; GPUs from small system tools run with a
 * timeout. Safe to call at any time; on failure the GPU list is simply empty.
 */
export async function detectHardware(options: DetectHardwareOptions = {}): Promise<HardwareInfo> {
  const cpus = os.cpus();
  const gpus = options.probeGpu === false ? [] : await probeGpus(options.probeTimeoutMs ?? 4000);
  return {
    platform: process.platform,
    arch: process.arch,
    cpuModel: cpus[0]?.model ?? "",
    cpuThreads:
      typeof os.availableParallelism === "function" ? os.availableParallelism() : cpus.length,
    totalMemBytes: os.totalmem(),
    freeMemBytes: os.freemem(),
    appleSilicon: process.platform === "darwin" && process.arch === "arm64",
    gpus,
  };
}
