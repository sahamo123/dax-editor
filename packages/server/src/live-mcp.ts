// Authenticated MCP front doors share the active desktop session and engine command/task guards.
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getCommand } from "@dax/core";
import { startHttpServer } from "@dax/mcp";
import type { StateResponse } from "@dax/protocol";
import type { Engine } from "./engine.js";

/** Start edit/read-only MCP listeners in the engine process; credentials live only in private app data. */
export async function startLiveMcp(
  engine: Engine,
  dataDir: string,
  shimPath: string,
): Promise<{ close(): Promise<void> }> {
  const start = (readOnly: boolean) =>
    startHttpServer({
      getSession: () => engine.projects.session,
      allowedRoots: [...engine.allowedRoots],
      readOnly,
      previewFrames: false,
      createExecutor: () => {
        let observed: { projectId: string; expectedRevision: number } | undefined;
        return async (_context, name, raw) => {
          const args =
            typeof raw === "object" && raw !== null && !Array.isArray(raw)
              ? (raw as Record<string, unknown>)
              : {};
          const session = engine.projects.session;
          const mutates = getCommand(name)?.readOnly !== true;
          if (readOnly && mutates) return { ok: false, error: "Planning connection is read-only." };
          if (
            mutates &&
            (!observed ||
              observed.projectId !== session.projectId ||
              observed.expectedRevision !== session.revision)
          )
            return {
              ok: false,
              error:
                "The project changed or has not been inspected. Call get_project before editing.",
            };
          if (name === "transcribe") {
            if (typeof args.assetId !== "string")
              return { ok: false, error: "Choose an assetId from get_project." };
            try {
              return {
                ok: true,
                summary: "Transcription queued. Poll get_project tasks until completed.",
                data: { jobId: engine.startTranscription(args.assetId) },
              };
            } catch (error) {
              return {
                ok: false,
                error: error instanceof Error ? error.message : "Could not start transcription.",
              };
            }
          }
          const result = await engine.runCommand(name, args, {
            ...(mutates ? observed : {}),
            origin: "mcp",
          });
          if (session !== engine.projects.session)
            return { ok: false, error: "The project switched. Inspect the open project again." };
          if (result.ok && (mutates || name === "get_project"))
            observed = { projectId: session.projectId, expectedRevision: session.revision };
          if (result.ok && name === "get_project") {
            const state = await engine.buildState();
            const data = typeof result.data === "object" && result.data !== null ? result.data : {};
            return {
              ...result,
              data: {
                ...data,
                projectId: state.projectId,
                revision: state.revision,
                tasks: state.tasks,
                jobs: state.jobs,
              },
            };
          }
          return result;
        };
      },
    });
  const edit = await start(false);
  let plan: Awaited<ReturnType<typeof start>>;
  try {
    plan = await start(true);
  } catch (error) {
    await edit.close();
    throw error;
  }
  const file = join(dataDir, "live-mcp.json");
  try {
    await writeFile(
      file,
      JSON.stringify({
        edit: { url: edit.url, token: edit.token },
        plan: { url: plan.url, token: plan.token },
      }),
      { mode: 0o600 },
    );
  } catch (error) {
    await Promise.all([edit.close(), plan.close()]);
    throw error;
  }
  const args = [shimPath, "--data-dir", dataDir];
  engine.setMcpInfo(
    (): NonNullable<StateResponse["mcp"]> => ({
      enabled: true,
      clients: edit.clients + plan.clients,
      command: process.execPath,
      args,
      planArgs: [...args, "--plan"],
    }),
  );
  return {
    async close() {
      await Promise.all([edit.close(), plan.close()]);
      await rm(file, { force: true });
    },
  };
}
