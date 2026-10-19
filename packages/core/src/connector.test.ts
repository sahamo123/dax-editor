import { describe, expect, it } from "vitest";
import { isPathInside } from "./connector.js";

describe("isPathInside", () => {
  it("accepts the root itself and paths beneath it", () => {
    expect(isPathInside("/media/a", "/media/a")).toBe(true);
    expect(isPathInside("/media/a", "/media/a/clip.mp4")).toBe(true);
  });

  it("rejects paths that climb out of the root", () => {
    expect(isPathInside("/media/a", "/media/b")).toBe(false);
    expect(isPathInside("/media/a", "/media/a/../b")).toBe(false);
    expect(isPathInside("/media/a", "/media")).toBe(false);
  });

  it("does not mistake names that start with two dots for a parent reference", () => {
    expect(isPathInside("/media/a", "/media/a/..cfg")).toBe(true);
    expect(isPathInside("/media/a", "/media/a/..notes/clip.mp4")).toBe(true);
  });
});
