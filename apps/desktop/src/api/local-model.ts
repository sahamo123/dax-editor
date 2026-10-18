// Shapes for `/api/local-model`. @dax/protocol defines the path but not the bodies yet (the lead wires the
// server side), so the UI defines the minimum it needs here. Move these into the protocol when it grows them.

/** A downloadable model the server recommends for this computer. */
interface LocalModelChoice {
  id: string;
  /** Human name such as "Qwen 2.5 3B (small, fast)". */
  label: string;
  /** Download size in bytes. */
  sizeBytes: number;
  /** One sentence on what it is good for. */
  description?: string;
}

/** What `GET /api/local-model` returns. */
export interface LocalModelStatus {
  /** The model that fits this computer best; `undefined` if the server has no catalogue. */
  recommended?: LocalModelChoice;
  /** True once the model file is on disk. */
  installed: boolean;
  /** True while the model server process is up and answering. */
  running: boolean;
  /** Short status line from the server, e.g. "Not downloaded". */
  detail?: string;
}

/** What `POST /api/local-model` accepts. Download and start report progress as `job` events. */
export type LocalModelAction =
  | { action: "install"; modelId?: string }
  | { action: "start" }
  | { action: "stop" }
  | { action: "uninstall" };
