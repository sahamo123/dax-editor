// Entry point: mounts the React app and loads the global styles.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./app/styles/tokens.css";
import "./app/styles/base.css";
import "./app/styles/components.css";

async function start(): Promise<void> {
  const { App } = await import("./app/App");
  const root = document.getElementById("root");
  if (!root) throw new Error("index.html is missing the #root element");
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
void start().catch((error: unknown) => {
  console.error("Dax Editor startup failed", error);
  const root = document.getElementById("root");
  if (root)
    root.textContent = `Dax Editor could not start: ${error instanceof Error ? error.message : String(error)}`;
});
