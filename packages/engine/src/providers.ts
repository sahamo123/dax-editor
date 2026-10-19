// Reports which AI providers can be used right now, for the Settings screen.

import type { ProviderKind, ProviderStatus } from "@dax/protocol";
import { PROVIDER_KINDS } from "@dax/protocol";
import type { ProviderRegistry, RunnerEnv } from "@dax/server";

/** What the launcher knows about the optional pieces. */
export interface RegistryOptions {
  /** True when the embedded model is installed and running. */
  localReady?: () => Promise<boolean>;
  /**
   * Real status of the `cli-*` providers (not installed / not signed in / ready), from `@dax/bridges`. Omit it and
   * they report that no bridge is installed. A rejection is reported per provider as "could not check", never thrown.
   */
  cliStatuses?: () => Promise<ProviderStatus[]>;
}

/** Providers that need only an API key (plus a base URL for the generic one). */
const KEYED: readonly ProviderKind[] = ["anthropic", "openai-compatible"];

/** The registry used by the real app. CLI-based providers report what `cliStatuses` says, or "not installed in this build" without it. */
export function createProviderRegistry(options: RegistryOptions = {}): ProviderRegistry {
  return {
    async list(env: RunnerEnv): Promise<ProviderStatus[]> {
      const out: ProviderStatus[] = [];
      // One check for all CLI providers; the bridge answers quickly and caches, so this is cheap on repeat calls.
      let cli: ProviderStatus[] | undefined;
      let cliFailed = false;
      if (options.cliStatuses) {
        try {
          cli = await options.cliStatuses();
        } catch {
          cliFailed = true;
        }
      }
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
          const found = cli?.find((s) => s.kind === kind);
          if (found) {
            out.push(found);
          } else {
            out.push({
              kind,
              available: false,
              detail: cliFailed
                ? "Could not check this provider"
                : "Sign-in bridge not installed in this build",
              signedIn: false,
            });
          }
        }
      }
      return out;
    },
  };
}
