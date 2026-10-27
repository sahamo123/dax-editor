// Standalone callers cannot accidentally invoke live task controls; malformed identifiers never reach the host.
import { describe, expect, it, vi } from "vitest";
import { tryRunCommand } from "./commands.js";
import { Session } from "./session.js";
import { emptyProject } from "./timeline.js";

describe("live cancellation command", () => {
  it("validates preview capability and rejects client-selected output paths", async () => {
    const session = new Session(emptyProject("Review"));
    const unavailable = await tryRunCommand({ session }, "render_preview", {});
    expect(unavailable).toMatchObject({ ok: false, error: expect.stringContaining("live editor") });
    const renderPreview = vi.fn(async () => ({
      summary: "Review started",
      data: { previewId: "id" },
    }));
    expect(
      (await tryRunCommand({ session, renderPreview }, "render_preview", { path: "anything.mp4" }))
        .ok,
    ).toBe(false);
    expect(renderPreview).not.toHaveBeenCalled();
    expect((await tryRunCommand({ session, renderPreview }, "render_preview", {})).ok).toBe(true);
    expect(session.history()).toHaveLength(1);
  });
  it("explains unsupported standalone use and validates UUIDs before calling a host", async () => {
    const session = new Session(emptyProject("Tasks"));
    const taskId = "0663d854-98af-4a55-ac58-d5a11b4dcd91";
    const unavailable = await tryRunCommand({ session }, "cancel_task", { taskId });
    expect(unavailable.ok).toBe(false);
    if (!unavailable.ok) expect(unavailable.error).toContain("live editor");
    const cancelTask = vi.fn(() => false);
    expect(
      (await tryRunCommand({ session, cancelTask }, "cancel_task", { taskId: "../other" })).ok,
    ).toBe(false);
    expect(cancelTask).not.toHaveBeenCalled();
    const result = await tryRunCommand({ session, cancelTask }, "cancel_task", { taskId });
    expect(result).toMatchObject({ ok: true, data: { cancelled: false } });
    expect(session.history()).toHaveLength(1);
  });
});
