// Setup for the editor's own Vitest configuration (vitest.editor.config.ts): DOM matchers, cleanup, polyfills.

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "./test-polyfills";

afterEach(() => cleanup());
