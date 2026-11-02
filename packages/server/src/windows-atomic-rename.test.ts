// Observe Windows replacement behavior using only app-created disposable files and a controlled sharing lock.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { writeFileAtomic } from "./stores.js";

it.skipIf(process.platform !== "win32")(
  "preserves both files when a Windows sharing lock blocks replacement",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "dax-rename-control-"));
    const target = join(dir, "project.json");
    const staged = join(dir, "staged.json");
    await writeFile(target, "synthetic-old");
    await writeFile(staged, "synthetic-new");
    // The child holds only this synthetic target open without delete-sharing and exits when stdin closes.
    const script =
      "$s=[IO.File]::Open($env:DAX_RENAME_TEST_TARGET,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);[Console]::Out.WriteLine('LOCKED');[Console]::In.ReadLine()|Out-Null;$s.Dispose()";
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      env: {
        SystemRoot: process.env.SystemRoot,
        Path: process.env.Path,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        DAX_RENAME_TEST_TARGET: target,
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    try {
      const ready = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Synthetic lock did not become ready")),
          10_000,
        );
        child.once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        child.once("exit", () => {
          clearTimeout(timeout);
          reject(new Error("Synthetic lock exited before becoming ready"));
        });
        let output = "";
        child.stdout.on("data", (data: Buffer) => {
          output += data.toString("utf8");
          if (!output.includes("\n")) return;
          clearTimeout(timeout);
          resolve(output);
        });
      });
      expect(ready).toContain("LOCKED");
      await expect(rename(staged, target)).rejects.toMatchObject({ code: "EPERM" });
      expect(await readFile(target, "utf8")).toBe("synthetic-old");
      expect(await readFile(staged, "utf8")).toBe("synthetic-new");
      await expect(writeFileAtomic(target, "synthetic-server-write")).rejects.toMatchObject({
        code: "EPERM",
      });
      expect(await readFile(target, "utf8")).toBe("synthetic-old");
      const retained = (await readdir(dir)).filter((name) =>
        /^project\.json\.[a-f0-9]{8}\.tmp$/.test(name),
      );
      expect(retained).toHaveLength(1);
      expect(await readFile(join(dir, retained[0] ?? ""), "utf8")).toBe("synthetic-server-write");
      const exited = once(child, "exit");
      child.stdin.end("\n");
      expect((await exited)[0]).toBe(0);
      await rename(staged, target);
      expect(await readFile(target, "utf8")).toBe("synthetic-new");
      await rename(join(dir, retained[0] ?? ""), target);
      expect(await readFile(target, "utf8")).toBe("synthetic-server-write");
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill();
        await exited;
      }
      await rm(staged, { force: true });
      await rm(target, { force: true });
      for (const name of await readdir(dir)) {
        if (/^project\.json\.[a-f0-9]{8}\.tmp$/.test(name)) await rm(join(dir, name));
      }
      await rmdir(dir);
    }
  },
  20_000,
);
