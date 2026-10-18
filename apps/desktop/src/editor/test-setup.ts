// Test setup for the editor's jsdom tests: DOM matchers and the browser APIs jsdom lacks.

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// jsdom has no ResizeObserver or pointer capture; the editor feature-detects both, but tests stub them for clarity.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (typeof Element.prototype.setPointerCapture === "undefined") {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
