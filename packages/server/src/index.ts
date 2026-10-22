// Public surface of @dax/server: start a server in-process, and the interfaces a launcher implements to plug in the AI agent,
// provider status and the local model. The executable entry point is cli.ts.

export { type ParsedArgs, parseServerArgs, USAGE } from "./args.js";
export type {
  AgentRunContext,
  AgentRunner,
  AgentRunnerFactory,
  LocalModelController,
  LocalModelTask,
  ProviderRegistry,
  RunnerEnv,
  SpeechController,
} from "./interfaces.js";
export { createLogger, type Logger, type LogLevel, type LogSink } from "./logger.js";
export { filmstripFrames, waveformRate } from "./media-pipeline.js";
export {
  DEFAULT_MAX_BODY_BYTES,
  type RunningServer,
  type ServerOptions,
  startServer,
} from "./server.js";
export {
  NullLocalModelController,
  NullProviderRegistry,
  type Script,
  ScriptedRunner,
  type ScriptStep,
} from "./stubs.js";
export { SERVER_VERSION } from "./version.js";
