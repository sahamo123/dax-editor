// Integration coverage for the actual short-process timeout and termination path.

import { expect, it } from "vitest";
import { buildChildEnv } from "./env.js";
import { runProbe } from "./proc.js";

it("terminates a started process that does not answer within its deadline", async () => {
  const result = await runProbe(
    process.execPath,
    ["-e", 'console.log("probe started"); setInterval(() => {}, 1000)'],
    { env: buildChildEnv(process.env), timeoutMs: 6000 },
  );
  expect(result.stdout).toContain("probe started");
  expect(result.timedOut).toBe(true);
  expect(result.exitCode).not.toBe(0);
  expect(result.spawnError).toBeUndefined();
});
