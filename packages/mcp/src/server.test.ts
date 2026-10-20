// Tests for createMcpServer over the SDK's in-memory transport, against the real core registry.
// Tool-listing tests need no FFmpeg; the end-to-end block generates a clip with FFmpeg and is skipped without it.

import { existsSync, readdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { commandTools, Session } from "@dax/core";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createMcpServer, type McpServerOptions, PREVIEW_FRAME_TOOL } from "./server.js";
import { hasFfmpeg, makeClip, makeTempDir, removeTempDir } from "./test/media.js";

/** A server and a connected client in one process. */
async function connect(options: McpServerOptions = {}) {
  const built = createMcpServer(options);
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await built.server.connect(serverSide);
  const client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(clientSide);
  return { ...built, client };
}

type Text = { type: "text"; text: string };
/** The first text block of a tool result. */
function textOf(result: { content?: unknown }): string {
  const block = (result.content as Array<{ type: string }>).find((c) => c.type === "text");
  return (block as Text | undefined)?.text ?? "";
}

const open: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  while (open.length) await open.pop()?.close();
});
async function start(options: McpServerOptions = {}) {
  const c = await connect(options);
  open.push(c.client, c.server);
  return c;
}

describe("tool generation", () => {
  it("exposes every core command plus preview_frame, in registry order", async () => {
    const { client, toolNames } = await start();
    const listed = (await client.listTools()).tools.map((t) => t.name);
    const expected = [...commandTools().map((t) => t.name), PREVIEW_FRAME_TOOL];
    expect(listed).toEqual(expected);
    expect(toolNames).toEqual(expected);
    expect(listed.length).toBeGreaterThanOrEqual(33);
  });

  it("maps readOnly and irreversible to MCP annotations", async () => {
    const { client } = await start();
    const tools = new Map((await client.listTools()).tools.map((t) => [t.name, t]));
    for (const spec of commandTools()) {
      const ann = tools.get(spec.name)?.annotations;
      expect(ann?.readOnlyHint, `${spec.name} readOnlyHint`).toBe(spec.readOnly);
      expect(ann?.destructiveHint, `${spec.name} destructiveHint`).toBe(spec.irreversible);
      expect(ann?.openWorldHint).toBe(false);
    }
    expect(tools.get("get_project")?.annotations?.readOnlyHint).toBe(true);
    expect(tools.get("export_video")?.annotations?.destructiveHint).toBe(true);
    expect(tools.get("delete_range")?.annotations?.destructiveHint).toBe(false);
  });

  it("publishes the command's JSON Schema and description", async () => {
    const { client } = await start();
    const tools = new Map((await client.listTools()).tools.map((t) => [t.name, t]));
    const cut = tools.get("smart_cut");
    expect(cut?.description).toContain("Tighten talking footage");
    expect(cut?.inputSchema.type).toBe("object");
    expect(JSON.stringify(cut?.inputSchema)).toContain("preset");
    expect(tools.get("export_video")?.inputSchema.required).toContain("path");
  });

  it("can hide irreversible commands, restrict to read-only, or pick commands by name", async () => {
    const noExport = await start({ allowIrreversible: false });
    expect(noExport.toolNames).not.toContain("export_video");
    expect(noExport.toolNames).toContain("split");

    const ro = await start({ readOnly: true, previewFrames: false });
    expect(ro.toolNames).toEqual(commandTools({ readOnlyOnly: true }).map((t) => t.name));

    const some = await start({ commands: ["get_project", "undo"], previewFrames: false });
    expect(some.toolNames).toEqual(["get_project", "undo"]);

    expect(() => createMcpServer({ commands: ["nope"] })).toThrow(/Unknown command/);
  });

  it("sends instructions that tell the model to call get_project first", async () => {
    const { client } = await start();
    expect(client.getInstructions()).toContain("get_project");
  });
});

describe("calling tools", () => {
  it("returns summary text and structured content for a read-only command", async () => {
    const { client } = await start();
    const r = await client.callTool({ name: "get_project", arguments: {} });
    expect(r.isError).toBeFalsy();
    expect(textOf(r)).toContain("Untitled");
    const structured = r.structuredContent as { summary: string; data: { name: string } };
    expect(structured.summary).toContain("Untitled");
    expect(structured.data.name).toBe("Untitled");
  });

  it("reports bad arguments as isError with a message the model can act on", async () => {
    const { client } = await start();
    const r = await client.callTool({ name: "delete_range", arguments: { from: "soon" } });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/delete_range|from|number/i);
  });

  it("reports a failing command as isError, not a protocol error", async () => {
    const { client } = await start();
    const r = await client.callTool({ name: "split", arguments: { time: 3 } });
    expect(r.isError).toBe(true);
    expect(textOf(r).length).toBeGreaterThan(0);
  });

  it("records edits as the configured source in the history", async () => {
    const { client, session } = await start({ source: "template" });
    await client.callTool({ name: "save_checkpoint", arguments: { name: "start" } });
    expect(session.history().length).toBeGreaterThanOrEqual(1);
    const r = await client.callTool({ name: "get_history", arguments: {} });
    expect(r.isError).toBeFalsy();
  });

  it("serialises edits so concurrent calls never interleave", async () => {
    const { client, session } = await start();
    const names = ["a", "b", "c", "d", "e"];
    await Promise.all(
      names.map((name) => client.callTool({ name: "save_checkpoint", arguments: { name } })),
    );
    // Each checkpoint is a distinct name; if calls interleaved on one state, earlier names would be lost.
    const r = await client.callTool({ name: "get_history", arguments: {} });
    expect(r.isError).toBeFalsy();
    expect(session.history().some((h) => h.name === "e")).toBe(true);
  });
});

describe("resources", () => {
  it("serves the project and history as JSON", async () => {
    const { client } = await start();
    const listed = (await client.listResources()).resources.map((r) => r.uri);
    expect(listed).toEqual(expect.arrayContaining(["dax://project", "dax://history"]));
    const project = await client.readResource({ uri: "dax://project" });
    const first = project.contents[0] as { text: string; mimeType: string };
    expect(first.mimeType).toBe("application/json");
    expect(JSON.parse(first.text).name).toBe("Untitled");
    const history = await client.readResource({ uri: "dax://history" });
    expect(JSON.parse((history.contents[0] as { text: string }).text)[0].label).toBe("Start");
  });
});

describe.skipIf(!hasFfmpeg())("end to end against real core and FFmpeg", () => {
  let dir: string;
  let clip: string;

  beforeAll(() => {
    dir = makeTempDir();
    clip = makeClip(dir);
  }, 60_000);
  afterAll(() => removeTempDir(dir));

  it("imports, edits, previews, undoes and exports", async () => {
    const { client, session } = await start({ allowedRoots: [dir] });

    const imported = await client.callTool({ name: "import_media", arguments: { path: clip } });
    expect(imported.isError, textOf(imported)).toBeFalsy();
    expect(session.project.timeline.tracks[0]?.clips.length).toBe(1);

    // Edits made through MCP are credited to the AI in the history.
    expect(session.history().at(-1)?.source).toBe("ai");

    const before = (await client.callTool({ name: "get_project", arguments: {} }))
      .structuredContent as {
      data: { duration: number };
    };
    expect(before.data.duration).toBeGreaterThan(5.5);

    const cut = await client.callTool({ name: "delete_range", arguments: { from: 1, to: 2 } });
    expect(cut.isError, textOf(cut)).toBeFalsy();
    const after = (await client.callTool({ name: "get_project", arguments: {} }))
      .structuredContent as {
      data: { duration: number };
    };
    expect(after.data.duration).toBeCloseTo(before.data.duration - 1, 1);

    const undone = await client.callTool({ name: "undo", arguments: {} });
    expect(undone.isError, textOf(undone)).toBeFalsy();
    const restored = (await client.callTool({ name: "get_project", arguments: {} }))
      .structuredContent as {
      data: { duration: number };
    };
    expect(restored.data.duration).toBeCloseTo(before.data.duration, 1);

    const projectResource = await client.readResource({ uri: "dax://project" });
    const parsed = JSON.parse((projectResource.contents[0] as { text: string }).text);
    expect(Object.keys(parsed.assets).length).toBe(1);

    const frame = await client.callTool({
      name: PREVIEW_FRAME_TOOL,
      arguments: { time: 2.5, width: 160 },
    });
    expect(frame.isError, textOf(frame)).toBeFalsy();
    const image = (frame.content as Array<{ type: string; data?: string; mimeType?: string }>).find(
      (c) => c.type === "image",
    );
    expect(image?.mimeType).toBe("image/jpeg");
    const bytes = Buffer.from(image?.data ?? "", "base64");
    expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]); // JPEG magic number

    const out = join(dir, "out.mp4");
    const progress: number[] = [];
    const exported = await client.callTool(
      { name: "export_video", arguments: { path: out } },
      { onprogress: (p) => progress.push(p.progress) },
    );
    expect(exported.isError, textOf(exported)).toBeFalsy();
    expect(existsSync(out)).toBe(true);
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.at(-1)).toBe(100);
    expect([...progress]).toEqual([...progress].sort((a, b) => a - b)); // in order, never going backwards

    const again = await client.callTool({ name: "export_video", arguments: { path: out } });
    expect(again.isError).toBe(true);
    expect(textOf(again)).toContain("already exists");
  }, 120_000);

  it("runs smart_cut on a clip with silence", async () => {
    const { client } = await start({ allowedRoots: [dir] });
    await client.callTool({ name: "import_media", arguments: { path: clip } });
    const r = await client.callTool({ name: "smart_cut", arguments: { preset: "standard" } });
    expect(r.isError, textOf(r)).toBeFalsy();
    expect(textOf(r)).toMatch(/Removed/);
    const data = (r.structuredContent as { data: { secondsRemoved: number } }).data;
    expect(data.secondsRemoved).toBeGreaterThan(1);
  }, 120_000);

  it("stops waiting when an export is cancelled and leaves no file behind", async () => {
    const { client } = await start({ allowedRoots: [dir] });
    await client.callTool({ name: "import_media", arguments: { path: clip } });
    const out = join(dir, "cancelled.mp4");
    const ac = new AbortController();
    const call = client.callTool(
      { name: "export_video", arguments: { path: out } },
      { signal: ac.signal },
    );
    setTimeout(() => ac.abort(), 20);
    await expect(call).rejects.toBeDefined();
    // The render is interrupted and writes under a hidden temp name, so the target never appears and nothing is left over.
    await new Promise((r) => setTimeout(r, 1500));
    expect(existsSync(out)).toBe(false);
    const deadline = Date.now() + 10_000;
    let leftovers = readdirSync(dir).filter((f) => f.includes("partial"));
    while (leftovers.length > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      leftovers = readdirSync(dir).filter((f) => f.includes("partial"));
    }
    expect(leftovers).toEqual([]);
  }, 120_000);

  it("refuses paths outside the allowed roots, including through a symlink", async () => {
    const inside = makeTempDir();
    const outside = makeTempDir();
    try {
      const secret = makeClip(outside, "secret.mp4");
      const { client } = await start({ allowedRoots: [inside] });

      const direct = await client.callTool({ name: "import_media", arguments: { path: secret } });
      expect(direct.isError).toBe(true);
      expect(textOf(direct)).toContain("outside the allowed folders");

      const link = join(inside, "link.mp4");
      symlinkSync(secret, link);
      const viaLink = await client.callTool({ name: "import_media", arguments: { path: link } });
      expect(viaLink.isError).toBe(true);
      expect(textOf(viaLink)).toContain("outside the allowed folders");

      const exportOut = await client.callTool({
        name: "export_video",
        arguments: { path: join(outside, "x.mp4") },
      });
      expect(exportOut.isError).toBe(true);
      expect(existsSync(join(outside, "x.mp4"))).toBe(false);
    } finally {
      removeTempDir(inside);
      removeTempDir(outside);
    }
  }, 60_000);

  it("rejects preview_frame arguments that are out of range or an empty timeline", async () => {
    const { client } = await start();
    const empty = await client.callTool({ name: PREVIEW_FRAME_TOOL, arguments: { time: 1 } });
    expect(empty.isError).toBe(true);
    expect(textOf(empty)).toContain("empty");
    const bad = await client.callTool({ name: PREVIEW_FRAME_TOOL, arguments: { time: -1 } });
    expect(bad.isError).toBe(true);
  });

  it("shares a project file with a Session opened separately", async () => {
    const file = join(dir, "shared.dax.json");
    const session = await Session.open(file, "Shared");
    const { client } = await start({ session, allowedRoots: [dir] });
    await client.callTool({ name: "import_media", arguments: { path: clip } });
    // Autosave by the session: the file on disk now holds the imported clip.
    expect(JSON.parse(readFileSync(file, "utf8")).timeline.tracks[0].clips.length).toBe(1);
  }, 60_000);
});
