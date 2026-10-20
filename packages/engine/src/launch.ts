// Starts the server with everything wired: agent, skills, providers, and (when supplied) local model and speech-to-text.

import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type CliBridges, createCliBridges } from "@dax/bridges";
import type { Transcriber } from "@dax/core";
import { LocalModelManager, type LocalModelManagerOptions } from "@dax/local-llm";
import {
  type LocalModelController,
  type RunningServer,
  type ServerOptions,
  startServer,
} from "@dax/server";
import type { CreateTranscriberOptions } from "@dax/stt";
import { createLocalModelController, localConnection } from "./local-model.js";
import { seedOfflineBundle } from "./offline-bundle.js";
import { createProviderRegistry } from "./providers.js";
import { createRunnerFactory, type RunnerFactoryOptions } from "./runner.js";
import { createSpeechTranscriber } from "./speech.js";

/** Options for {@link launch}. */
export interface LaunchOptions
  extends Omit<
    ServerOptions,
    "agentRunner" | "providers" | "localModel" | "transcriber" | "maxBodyBytes"
  > {
  /** Skills folder. Default: `$DAX_SKILLS_DIR`, else the nearest `skills/` above this package. */
  skillsDir?: string;
  /**
   * Speech-to-text engine used by the `transcribe` command. Default: whisper.cpp through `@dax/stt` (see
   * {@link speechOptions}). Pass an instance to inject one (tests use fakes); pass `false` to have no speech-to-text.
   */
  transcriber?: Transcriber | false;
  /**
   * Options for the default speech engine (for example a `binaryPath`, a model id, or `autoInstall` to allow the first
   * use to download the runtime and model). The data folder is always the server's. Ignored when `transcriber` is given.
   */
  speechOptions?: Omit<CreateTranscriberOptions, "dataDir">;
  /**
   * Embedded model controller; its endpoint is used by the `local` provider. Default: a controller over a
   * `LocalModelManager` in the data folder (nothing is downloaded or started until the user asks). Pass an instance to
   * inject one (tests use fakes); pass `false` to report the built-in model as unsupported in this build.
   */
  localModelController?: LocalModelController | false;
  /**
   * Options for the default `LocalModelManager` (test seams such as hardware detection or `fetch`). The data folder is
   * always the server's. Ignored when a controller is injected or the built-in model is turned off.
   */
  localModelOptions?: Omit<LocalModelManagerOptions, "dataDir">;
  /** Hooks for extra providers such as signed-in CLIs. Ignored when `cliBridges` is supplied or disabled. */
  extraProviders?: RunnerFactoryOptions["extraProviders"];
  /**
   * The signed-in command-line agent bridges (`@dax/bridges`). Default: enabled, built with the engine's data folder.
   * Pass an instance to inject one (tests use fakes); pass `false` to turn the bridges off entirely. The launcher
   * closes the bridges when the server closes.
   */
  cliBridges?: CliBridges | false;
  /** Offline installer resources. Omit to discover them beside the engine; false disables seeding and auto-start. */
  offlineBundleDir?: string | false;
}

/** Find the shipped `skills/` folder: the environment override first, then walking up from this file. */
export function defaultSkillsDir(
  env: NodeJS.ProcessEnv = process.env,
  from = fileURLToPath(import.meta.url),
): string | undefined {
  // An explicit setting always wins; the search below is only the fallback for a source checkout or an install.
  if (env.DAX_SKILLS_DIR) return resolve(env.DAX_SKILLS_DIR);
  let dir = dirname(from);
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "skills");
    // A README alone is not enough: an ancestor folder may have one. A skills folder holds `<name>/SKILL.md` entries.
    if (existsSync(join(candidate, "README.md")) && hasSkillFolder(candidate)) return candidate;
    dir = dirname(dir);
  }
  return undefined;
}

/** True if `dir` has at least one child folder that holds a `SKILL.md`. */
function hasSkillFolder(dir: string): boolean {
  try {
    return readdirSync(dir, { withFileTypes: true }).some(
      (e) => e.isDirectory() && existsSync(join(dir, e.name, "SKILL.md")),
    );
  } catch {
    return false;
  }
}

/** Start the full engine. */
export async function launch(options: LaunchOptions): Promise<RunningServer> {
  const {
    skillsDir,
    transcriber: transcriberOption,
    speechOptions,
    localModelController,
    localModelOptions,
    extraProviders,
    cliBridges,
    offlineBundleDir,
    ...server
  } = options;
  let bundled = false;
  if (
    localModelController === undefined &&
    offlineBundleDir !== false &&
    process.platform === "win32" &&
    process.arch === "x64"
  ) {
    try {
      bundled = await seedOfflineBundle(
        server.dataDir,
        offlineBundleDir ? { bundleDir: offlineBundleDir } : {},
      );
    } catch (error) {
      // A damaged offline seed must not stop the manual editor from opening.
      process.stderr.write(
        `Offline AI setup failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }
  // Speech-to-text is on by default. It sets itself up only on first use and reports what is missing instead of failing.
  const transcriber: Transcriber | undefined =
    transcriberOption === false
      ? undefined
      : (transcriberOption ?? createSpeechTranscriber(server.dataDir, speechOptions));
  // The built-in model is on by default; `false` leaves the server's own "not supported in this build" controller in place.
  const local: LocalModelController | undefined =
    localModelController === false
      ? undefined
      : (localModelController ??
        createLocalModelController({
          manager: new LocalModelManager({
            dataDir: server.dataDir,
            ...(bundled ? { runtime: { target: { backend: "cpu" } } } : {}),
            ...localModelOptions,
          }),
        }));
  const savedSettings: unknown = bundled
    ? await readFile(join(server.dataDir, "settings.json"), "utf8")
        .then(JSON.parse)
        .catch(() => undefined)
    : undefined;
  const wantsLocal =
    !(
      typeof savedSettings === "object" &&
      savedSettings !== null &&
      "activeProvider" in savedSettings
    ) || savedSettings.activeProvider === "local";
  if (bundled && local && wantsLocal) {
    try {
      await local.start({ signal: AbortSignal.timeout(90_000), onProgress: () => undefined });
    } catch (error) {
      process.stderr.write(
        `Offline AI start failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }
  const dir = skillsDir ?? defaultSkillsDir();
  // Bridges are on by default. They spawn nothing until the Settings screen or a chat run asks.
  const bridges: CliBridges | undefined =
    cliBridges === false
      ? undefined
      : (cliBridges ?? createCliBridges({ dataDir: options.dataDir, transcriber }));
  const runner = createRunnerFactory({
    ...(dir ? { skillsDir: dir } : {}),
    ...(transcriber ? { transcriber } : {}),
    ...(bridges
      ? { extraProviders: bridges.extraProviders }
      : extraProviders
        ? { extraProviders }
        : {}),
    // The `local` provider reads the running model's address and key on every run, so a restart is picked up at once.
    ...(local ? { localEndpoint: () => localConnection(local) } : {}),
  });
  const started = await startServer({
    ...server,
    agentRunner: runner,
    providers: createProviderRegistry({
      ...(local ? { localReady: async () => (await local.status()).running } : {}),
      ...(bridges ? { cliStatuses: bridges.statuses } : {}),
    }),
    ...(local ? { localModel: local } : {}),
    ...(transcriber ? { transcriber } : {}),
  });
  if (!bridges) return started;
  // Stop the CLI processes and remove their temporary files before the server reports itself closed.
  return {
    info: started.info,
    async close() {
      await started.close();
      await bridges.close();
    },
  };
}
