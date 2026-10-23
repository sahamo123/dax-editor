// Real loopback MCP requests exercise the same session/history as the desktop HTTP API.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { StateResponse } from "@dax/protocol";
import { describe, expect, it } from "vitest";
import { startHarness } from "./test/harness.js";

interface Endpoint {
  url: string;
  token: string;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
async function connect(endpoint: Endpoint) {
  let sid: string | undefined;
  let id = 0;
  const rpc = async (method: string, params: unknown): Promise<Record<string, unknown>> => {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${endpoint.token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(sid ? { "Mcp-Session-Id": sid, "MCP-Protocol-Version": "2025-11-25" } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    expect(response.status).toBe(200);
    sid = response.headers.get("mcp-session-id") ?? sid;
    const text = await response.text();
    const data = response.headers.get("content-type")?.includes("text/event-stream")
      ? text
          .split(/\r?\n/)
          .find((line) => line.startsWith("data:"))
          ?.slice(5)
      : text;
    const body: unknown = JSON.parse(data ?? "null");
    if (!record(body)) throw new Error("Invalid MCP response");
    return record(body.result) ? body.result : body;
  };
  await rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "dax-integration-test", version: "1" },
  });
  return {
    rpc,
    tool: (name: string, args: Record<string, unknown> = {}) =>
      rpc("tools/call", { name, arguments: args }),
  };
}

describe("live desktop MCP", () => {
  it("cancels an explicit active job through the registry and refuses Planning cancellation", async () => {
    const h = await startHarness({
      liveMcp: { shimPath: "test-proxy.js" },
      motion: {
        async status() {
          return { available: true, detail: "test renderer" };
        },
        async render(_request, { signal }) {
          return new Promise((_resolve, reject) => {
            if (signal?.aborted) reject(new Error("Cancelled"));
            else
              signal?.addEventListener("abort", () => reject(new Error("Cancelled")), {
                once: true,
              });
          });
        },
      },
    });
    try {
      const config = JSON.parse(await readFile(join(h.dataDir, "live-mcp.json"), "utf8")) as {
        edit: Endpoint;
        plan: Endpoint;
      };
      const edit = await connect(config.edit),
        plan = await connect(config.plan);
      const before = (await h.req("/api/state")).json<StateResponse>();
      await edit.tool("get_project");
      const queued = await edit.tool("render_motion_template", {
        template: "title-card",
        text: "Cancel me",
      });
      expect(queued.isError).not.toBe(true);
      const state = (await h.req("/api/state")).json<StateResponse>();
      const task = state.tasks?.find(
        (item) => item.kind === "blender" && item.status === "running",
      );
      expect(task?.projectId).toBe(state.projectId);
      expect(JSON.stringify(await edit.tool("get_project"))).toContain('"status":"running"');
      expect(task?.id).toBeDefined();
      expect(JSON.stringify(await plan.rpc("tools/list", {}))).not.toContain(
        '"name":"cancel_task"',
      );
      const refused = await plan.tool("cancel_task", { taskId: task?.id });
      expect(refused.isError === true || record(refused.error)).toBe(true);
      expect(JSON.stringify(await edit.tool("cancel_task", { taskId: task?.id }))).toContain(
        '"cancelled":true',
      );
      await expect
        .poll(
          async () =>
            (await h.req("/api/state"))
              .json<StateResponse>()
              .tasks?.find((item) => item.id === task?.id)?.status,
        )
        .toBe("cancelled");
      const final = (await h.req("/api/state")).json<StateResponse>();
      expect(final.project).toEqual(before.project);
      expect(final.history).toEqual(before.history);
      expect(JSON.stringify(await edit.tool("cancel_task", { taskId: task?.id }))).toContain(
        '"cancelled":false',
      );
    } finally {
      await h.cleanup();
    }
  });
  it("shares edits/history, rejects stale work, follows project switches and keeps Planning read-only", async () => {
    const h = await startHarness({ liveMcp: { shimPath: "test-proxy.js" } });
    try {
      const config = JSON.parse(await readFile(join(h.dataDir, "live-mcp.json"), "utf8")) as {
        edit: Endpoint;
        plan: Endpoint;
      };
      expect((await fetch(config.edit.url)).status).toBe(401);
      const edit = await connect(config.edit);
      await edit.tool("get_project");
      const result = await edit.tool("apply_edit_batch", {
        operations: [
          { name: "set_format", args: { width: 1080, height: 1080 } },
          { name: "set_format", args: { fit: "cover" } },
        ],
      });
      expect(result.isError).not.toBe(true);
      const state = (await h.req("/api/state")).json<StateResponse>();
      expect(state.project.timeline).toMatchObject({ width: 1080, height: 1080, fit: "cover" });
      expect(state.history).toHaveLength(2);
      expect(state.tasks).toEqual(
        expect.arrayContaining([expect.objectContaining({ origin: "mcp", status: "completed" })]),
      );
      await h.command("set_format", { width: 1280, height: 720 });
      expect((await edit.tool("set_format", { width: 720, height: 1280 })).isError).toBe(true);
      const planning = await connect(config.plan);
      const tools = await planning.rpc("tools/list", {});
      expect(JSON.stringify(tools)).not.toContain('"name":"set_format"');
      const refused = await planning.tool("set_format", { width: 720, height: 1280 });
      expect(refused.isError === true || record(refused.error)).toBe(true);
      expect((await h.req("/api/state")).json<StateResponse>().project.timeline.width).toBe(1280);
      await h.post("/api/project/new", { name: "Other project" });
      const inspected = await edit.tool("get_project");
      expect(JSON.stringify(inspected)).toContain("Other project");
      expect((await edit.tool("set_format", { width: 1080, height: 1920 })).isError).not.toBe(true);
      expect((await h.req("/api/state")).json<StateResponse>().project.timeline.height).toBe(1920);
    } finally {
      await h.cleanup();
    }
  }, 30_000);
});
