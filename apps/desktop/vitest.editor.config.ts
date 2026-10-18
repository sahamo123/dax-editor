// Vitest configuration for the editor module only (jsdom + Testing Library). The app shell has its own config.

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/editor/**/*.test.{ts,tsx}"],
    exclude: ["src/editor/dev/e2e/**", "**/node_modules/**"],
    setupFiles: ["src/editor/test-setup.ts"],
    css: false,
  },
});
