// Browser APIs jsdom lacks that the editor (and its tests) rely on. Imported by test-utils and the editor's own
// Vitest setup, so the tests also pass under the app shell's Vitest configuration.

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

// Older jsdom has no PointerEvent; the editor reads pointerId and clientX/Y, so a MouseEvent subclass will do.
if (typeof globalThis.PointerEvent === "undefined") {
  class PointerEventShim extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  globalThis.PointerEvent = PointerEventShim as unknown as typeof PointerEvent;
}

// jsdom does not implement media playback; the components only need these to exist.
HTMLMediaElement.prototype.play = () => Promise.resolve();
HTMLMediaElement.prototype.pause = () => {};
HTMLMediaElement.prototype.load = () => {};

export {};
