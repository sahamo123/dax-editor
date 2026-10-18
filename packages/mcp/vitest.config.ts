// Vitest settings for the mcp package: real HTTP and FFmpeg tests need more than the 5 s default.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { testTimeout: 60_000, hookTimeout: 60_000 },
});
