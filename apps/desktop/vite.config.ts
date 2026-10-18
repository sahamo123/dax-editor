// Vite and Vitest configuration for the desktop UI. The same file drives the dev server, the production
// build that Tauri bundles, and the jsdom component tests.

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // Tauri loads the built files from disk, so asset URLs must be relative.
  base: "./",
  server: { port: 5173, strictPort: true },
  build: { outDir: "dist", target: "es2022", sourcemap: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
