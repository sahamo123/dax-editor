// Reports which AI providers can be used right now, for the Settings screen.

import type { ProviderKind, ProviderStatus } from "@dax/protocol";
import { PROVIDER_KINDS } from "@dax/protocol";
import type { ProviderRegistry, RunnerEnv } from "@dax/server";

/** What the launcher knows about the optional pieces. */
export interface RegistryOptions {
  /** True when the embedded model is installed and running. */
  localReady?: () => Promise<boolean>;
}

/** Providers that need only an API key (plus a base URL for the generic one). */
const KEYED: readonly ProviderKind[] = ["anthropic", "openai-compatible"];

/** The registry used by the real app. CLI-based providers report as not yet available until their bridge is installed. */
export function createProviderRegistry(options: RegistryOptions = {}): ProviderRegistry {
  return {
    async list(env: RunnerEnv): Promise<ProviderStatus[]> {
      const out: ProviderStatus[] = [];
      for (const kind of PROVIDER_KINDS) {
        if (KEYED.includes(kind)) {
          const hasApiKey = (await env.getApiKey(kind)) !== undefined;
          const needsUrl = kind === "openai-compatible" && !env.settings.providers[kind]?.baseUrl;
          const available = kind === "openai-compatible" ? !needsUrl : hasApiKey;
          out.push({
            kind,
            available,
            hasApiKey,
            detail: available ? "Ready" : needsUrl ? "Set the server address" : "Add an API key",
          });
        } else if (kind === "local") {
          const ready = (await options.localReady?.()) ?? false;
          out.push({
            kind,
            available: ready,
            detail: ready ? "Ready" : "Download and start the built-in model",
          });
        } else {
          out.push({
            kind,
            available: false,
            detail: "Sign-in bridge not installed in this build",
            signedIn: false,
          });
        }
      }
      return out;
    },
  };
}
