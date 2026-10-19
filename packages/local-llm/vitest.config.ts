import { defineConfig } from "vitest/config";

// Process and download tests wait on real timers and child processes; give them room.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 90_000,
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test-helpers/setup.ts"],
  },
});
