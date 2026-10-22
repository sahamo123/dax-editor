// The HTTP API: maps each @dax/protocol path onto an Engine method. Authentication, Host and Origin checks already happened in server.ts.
// Rule of thumb: problems with the request itself are HTTP errors ({ error }); a command that ran and failed is 200 { ok: false }.

import {
  API,
  ApiKeyRequestSchema,
  ChatRequestSchema,
  CommandRequestSchema,
  ImportRequestSchema,
  LocalModelInstallRequestSchema,
  MAX_UPLOAD_BYTES,
  type MediaKind,
  PROVIDER_KINDS,
  ProjectNewRequestSchema,
  ProjectPathRequestSchema,
  SettingsSchema,
  UploadNameSchema,
} from "@dax/protocol";
import { z } from "zod";
import type { Engine } from "./engine.js";
import { HttpError, parseWith, type RouteContext, Router } from "./http-util.js";
import { MediaError } from "./media-pipeline.js";
import { isSafeId, PathNotAllowedError } from "./paths.js";
import { sendFile } from "./range.js";
import { SERVER_VERSION } from "./version.js";

const MEDIA_KINDS: readonly MediaKind[] = [
  "proxy.mp4",
  "thumb.jpg",
  "waveform.json",
  "filmstrip.jpg",
];
const ApiKeyQuerySchema = z.object({ kind: z.enum(PROVIDER_KINDS) });

/** Turn an unexpected error from project operations into the right HTTP status: 403 for forbidden paths, 400 otherwise. */
function projectError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof PathNotAllowedError) return new HttpError(403, err.message);
  return new HttpError(400, err instanceof Error ? err.message : String(err));
}

/** Build the route table for an engine. */
export function buildRouter(engine: Engine): Router {
  const r = new Router();

  r.add("GET", API.health, ({ json }) => json(200, { ok: true, version: SERVER_VERSION }));
  r.add("GET", API.state, async ({ json }) => json(200, await engine.buildState()));

  r.add("POST", API.command, async ({ body, json }) => {
    const req = parseWith(CommandRequestSchema, await body());
    json(200, await engine.runCommand(req.name, req.args, req));
  });

  r.add("POST", API.importMedia, async ({ body, json }) => {
    const req = parseWith(ImportRequestSchema, await body());
    json(200, await engine.importFiles(req.paths));
  });

  r.add("POST", API.uploadMedia, async ({ req, url, json }) => {
    const name = parseWith(UploadNameSchema, url.searchParams.get("name"));
    if (req.headers["content-type"] !== "application/octet-stream")
      throw new HttpError(415, "Content-Type must be application/octet-stream");
    if (Number(req.headers["content-length"] ?? 0) > MAX_UPLOAD_BYTES)
      throw new HttpError(413, "Video exceeds the 1 GiB upload limit.", true);
    json(200, await engine.importUpload(name, req, url.searchParams.get("stage") === "true"));
  });

  // ----- projects -----
  r.add("POST", API.projectNew, async ({ body, json }) => {
    const req = parseWith(ProjectNewRequestSchema, await body());
    engine.assertIdle();
    await engine.projects.createNew(req).catch((e) => {
      throw projectError(e);
    });
    json(200, await engine.buildState());
  });

  r.add("POST", API.projectOpen, async ({ body, json }) => {
    const req = parseWith(ProjectPathRequestSchema, await body());
    if (req.path === undefined) throw new HttpError(400, "Invalid request: path: Required");
    engine.assertIdle();
    await engine.projects.open(req.path).catch((e) => {
      throw projectError(e);
    });
    json(200, await engine.buildState());
  });

  r.add("POST", API.projectSave, async ({ body, json }) => {
    const req = parseWith(ProjectPathRequestSchema, await body());
    await engine.projects.save(req.path).catch((e) => {
      throw projectError(e);
    });
    json(200, await engine.buildState());
  });

  // ----- chat -----
  r.add("POST", API.chat, async ({ body, json }) => {
    const req = parseWith(ChatRequestSchema, await body());
    json(202, { runId: engine.startChat(req.message, req) });
  });
  r.add("POST", API.chatCancel, ({ json }) => json(200, { cancelled: engine.cancelChat() }));
  r.add("POST", API.taskCancel, ({ params, json }) =>
    json(200, { cancelled: engine.cancelTask(params.taskId ?? "") }),
  );

  // ----- settings and providers -----
  r.add("GET", API.settings, ({ json }) => json(200, engine.settings.get()));
  const putSettings = async ({ body, json }: RouteContext) => {
    json(200, await engine.updateSettings(parseWith(SettingsSchema, await body())));
  };
  r.add("PUT", API.settings, putSettings);
  r.add("POST", API.settings, putSettings);

  r.add("POST", API.apiKey, async ({ body, json }) => {
    const req = parseWith(ApiKeyRequestSchema, await body());
    await engine.setApiKey(req.kind, req.apiKey);
    json(200, await engine.providerStatuses(true));
  });
  r.add("DELETE", API.apiKey, async ({ url, json }) => {
    const q = parseWith(ApiKeyQuerySchema, Object.fromEntries(url.searchParams));
    await engine.removeApiKey(q.kind);
    json(200, await engine.providerStatuses(true));
  });
  // Always a fresh check: the UI's "Check again" button (after signing in to a CLI, say) must not get a cached answer.
  r.add("GET", API.providers, async ({ json }) => json(200, await engine.providerStatuses(true)));

  // ----- local model (delegated to the injected controller) -----
  r.add("GET", API.localModel, async ({ json }) => json(200, await engine.localModelStatus()));
  r.add("POST", API.localModelInstall, async ({ body, json }) => {
    const req = parseWith(LocalModelInstallRequestSchema, await body());
    json(202, { jobId: engine.installLocalModel(req.modelId) });
  });
  r.add("POST", API.localModelStart, ({ json }) => json(202, { jobId: engine.startLocalModel() }));
  r.add("POST", API.localModelStop, async ({ json }) => {
    await engine.stopLocalModel();
    json(200, { ok: true });
  });
  r.add("POST", API.localModelUninstall, async ({ json }) => {
    await engine.uninstallLocalModel();
    json(200, { ok: true });
  });
  r.add("POST", API.localModelCancel, ({ json }) =>
    json(200, { cancelled: engine.cancelLocalTask() }),
  );

  // ----- media -----
  r.add("GET", `${API.media}/:assetId/:file`, async ({ req, res, url, params, headers }) => {
    const { assetId = "", file = "" } = params;
    const kind = MEDIA_KINDS.find((k) => k === file);
    const assets = engine.projects.session.project.assets;
    // Only own properties of the open project's assets count: "__proto__" must not resolve.
    const asset = isSafeId(assetId) && Object.hasOwn(assets, assetId) ? assets[assetId] : undefined;
    if (!kind || !asset) throw new HttpError(404, "Unknown media");
    try {
      const f = await engine.media.fileFor(asset, kind, url.searchParams);
      await sendFile(req, res, f.path, {
        contentType: f.contentType,
        cacheControl: f.cacheControl,
        headers: { ...headers, ...f.headers },
      });
    } catch (err) {
      if (err instanceof MediaError) throw new HttpError(err.status, err.message);
      throw err;
    }
  });

  return r;
}
