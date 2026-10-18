import { describe, expect, it } from "vitest";
import {
  API,
  ApiKeyRequestSchema,
  ChatRequestSchema,
  CommandRequestSchema,
  ImportRequestSchema,
  mediaUrl,
  PROVIDER_KINDS,
  ProjectNewRequestSchema,
  SettingsSchema,
} from "./index.js";

describe("protocol schemas", () => {
  it("defaults command args to an empty object", () => {
    expect(CommandRequestSchema.parse({ name: "split" }).args).toEqual({});
    expect(() => CommandRequestSchema.parse({ args: {} })).toThrow();
  });

  it("limits imports and chat length", () => {
    expect(() => ImportRequestSchema.parse({ paths: [] })).toThrow();
    expect(ImportRequestSchema.parse({ paths: ["/a.mp4"] }).paths).toHaveLength(1);
    expect(() => ChatRequestSchema.parse({ message: "" })).toThrow();
    expect(() => ChatRequestSchema.parse({ message: "x".repeat(8001) })).toThrow();
  });

  it("defaults a new project's name", () => {
    expect(ProjectNewRequestSchema.parse({}).name).toBe("Untitled");
  });

  it("accepts only known providers", () => {
    expect(PROVIDER_KINDS).toContain("local");
    expect(() => ApiKeyRequestSchema.parse({ kind: "other", apiKey: "k" })).toThrow();
    expect(
      SettingsSchema.parse({
        activeProvider: "local",
        providers: { "openai-compatible": { baseUrl: "http://127.0.0.1:11434/v1" } },
      }).activeProvider,
    ).toBe("local");
    expect(() =>
      SettingsSchema.parse({
        activeProvider: "local",
        providers: { local: { baseUrl: "not a url" } },
      }),
    ).toThrow();
  });

  it("builds media URLs with the token and escaped ids", () => {
    const u = new URL(
      mediaUrl("http://127.0.0.1:4317/", "tok", "asset 1", "thumb.jpg", { t: 2.5 }),
    );
    expect(u.pathname).toBe(`${API.media}/asset%201/thumb.jpg`);
    expect(u.searchParams.get("token")).toBe("tok");
    expect(u.searchParams.get("t")).toBe("2.5");
  });
});
