// Windows rename retries preserve atomic semantics and never hide permanent or unrelated failures.
import { describe, expect, it, vi } from "vitest";
import { renameExtractedDirectory } from "./windows-rename.js";

const denied = () => Object.assign(new Error("sharing violation"), { code: "EPERM" });
describe("atomic directory install on Windows", () => {
  it("retries a temporary sharing violation with the same paths", async () => {
    const move = vi.fn().mockRejectedValueOnce(denied()).mockResolvedValue(undefined);
    const wait = vi.fn(async () => undefined);
    await renameExtractedDirectory("staging", "runtime", { platform: "win32", move, wait });
    expect(move.mock.calls).toEqual([
      ["staging", "runtime"],
      ["staging", "runtime"],
    ]);
    expect(wait).toHaveBeenCalledWith(50);
  });
  it("propagates a persistent failure after a bounded delay", async () => {
    const error = denied();
    const move = vi.fn().mockRejectedValue(error);
    const wait = vi.fn(async () => undefined);
    await expect(
      renameExtractedDirectory("staging", "runtime", { platform: "win32", move, wait }),
    ).rejects.toBe(error);
    expect(move).toHaveBeenCalledTimes(5);
    expect(wait.mock.calls).toEqual([[50], [100], [200], [400]]);
  });
  it("does not retry unrelated failures or change non-Windows behavior", async () => {
    for (const [platform, code] of [
      ["linux", "EPERM"],
      ["win32", "ENOENT"],
    ] as const) {
      const error = Object.assign(new Error(code), { code });
      const move = vi.fn().mockRejectedValue(error);
      const wait = vi.fn(async () => undefined);
      await expect(
        renameExtractedDirectory("staging", "runtime", { platform, move, wait }),
      ).rejects.toBe(error);
      expect(move).toHaveBeenCalledTimes(1);
      expect(wait).not.toHaveBeenCalled();
    }
  });
});
