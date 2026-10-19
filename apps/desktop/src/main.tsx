// Entry point: mounts the React app and loads the global styles.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./app/styles/tokens.css";
import "./app/styles/base.css";
import "./app/styles/components.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing the #root element");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
