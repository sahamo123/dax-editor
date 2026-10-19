// Public surface of @dax/engine: launch the whole engine in-process, or build its pieces separately.

export { defaultSkillsDir, type LaunchOptions, launch } from "./launch.js";
export {
  createLocalModelController,
  type EmbeddedModelController,
  type EmbeddedModelOptions,
  type LocalConnection,
  type ModelManager,
} from "./local-model.js";
export { createProviderRegistry, type RegistryOptions } from "./providers.js";
export {
  createRunnerFactory,
  DEFAULT_MODELS,
  type LocalEndpoint,
  localProviderSettings,
  type RunnerFactoryOptions,
} from "./runner.js";
