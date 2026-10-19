// Public surface of @dax/bridges: chat backends that drive the user's own signed-in command-line agents.

export {
  type CliBridges,
  type CliBridgesOptions,
  createCliBridges,
  type ExtraProviders,
} from "./bridges.js";
export type { LocateOptions } from "./locate.js";
export type { BridgeState, BridgeStatus, CliProviderKind } from "./status.js";
export { toProviderStatus } from "./status.js";
