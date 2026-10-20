// Vitest settings for the bridges package: tests spawn real child processes and a real loopback MCP endpoint.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { testTimeout: 30_000, hookTimeout: 30_000, setupFiles: ["src/test/setup.ts"] },
});
