// Vite configuration for the editor's dev harness (src/editor/dev). Separate from the app shell's own config.

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/editor/dev",
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5180, strictPort: true },
});
