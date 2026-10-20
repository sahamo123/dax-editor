// Windows cannot execute shebang fixtures. Route only registered fake CLIs through the real Node executable.

import { vi } from "vitest";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const { fakeExecutables } = await import("./fake-processes.js");
  const spawn: typeof actual.spawn = ((...params: Parameters<typeof actual.spawn>) => {
    const [file, args, options] = params;
    if (process.platform === "win32" && fakeExecutables.has(file)) {
      return actual.spawn(process.execPath, [file, ...(args ?? [])], options);
    }
    return actual.spawn(...params);
  }) as typeof actual.spawn;
  return { ...actual, spawn };
});
