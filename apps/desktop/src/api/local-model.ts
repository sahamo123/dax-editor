// What the UI can ask of the embedded local model. The server has one endpoint per action
// (`/api/local-model/install|start|stop|cancel|uninstall`); this union lets UI code name the action
// without caring which endpoint it maps to. The status shape itself (`LocalModelStatus`) is in `@dax/protocol`.

/** One thing the user can do to the local model. Install and start report progress as `job` events. */
export type LocalModelAction =
  | { action: "install"; modelId?: string | undefined }
  | { action: "start" }
  | { action: "stop" }
  | { action: "uninstall" }
  /** Abort a running download or start. */
  | { action: "cancel" };
