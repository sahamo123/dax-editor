// Public surface of @dax/engine: launch the whole engine in-process, or build its pieces separately.

export { defaultSkillsDir, type LaunchOptions, launch } from "./launch.js";
export { createProviderRegistry, type RegistryOptions } from "./providers.js";
export {
  createRunnerFactory,
  DEFAULT_MODELS,
  type LocalEndpoint,
  type RunnerFactoryOptions,
} from "./runner.js";
