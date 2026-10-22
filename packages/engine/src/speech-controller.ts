// Explicit speech provisioning uses pinned whisper components; recognition stays offline.
import type { Transcriber } from "@dax/core";
import type { SpeechController } from "@dax/server";
import {
  type CreateTranscriberOptions,
  createTranscriber,
  ensureBinary,
  findWhisperBinary,
  SpeechModelManager,
} from "@dax/stt";
import { withUnavailableMessages } from "./speech.js";

/** Stable transcription and setup interfaces over one app-managed speech model. No automatic downloads. */
export function createSpeechFeature(
  dataDir: string,
  options: Omit<CreateTranscriberOptions, "dataDir"> = {},
): { transcriber: Transcriber; controller: SpeechController } {
  const modelId = options.modelId ?? "base.en-q5_1";
  const models = new SpeechModelManager({
    dataDir,
    ...(options.modelBaseUrl ? { baseUrl: options.modelBaseUrl } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.extraModels ? { extraModels: options.extraModels } : {}),
  });
  const info = models.info(modelId);
  const build = () =>
    withUnavailableMessages(
      createTranscriber({
        ...options,
        dataDir,
        modelId,
        autoInstall: false,
        threads: options.threads ?? 2,
      }),
      modelId,
    );
  let inner = build();
  return {
    transcriber: { transcribe: (path, opts) => inner.transcribe(path, opts) },
    controller: {
      async status() {
        const runtime = await findWhisperBinary({
          dataDir,
          ...(options.binaryPath ? { binaryPath: options.binaryPath } : {}),
        }).catch(() => undefined);
        const installed = await models.isInstalled(modelId);
        return {
          ready: Boolean(runtime) && installed,
          runtimeInstalled: Boolean(runtime),
          modelInstalled: installed,
          modelId,
          sizeBytes: info.bytes,
          detail:
            runtime && installed
              ? "Offline speech is installed"
              : "Install offline speech to generate transcripts and captions",
        };
      },
      async install(task) {
        await ensureBinary({
          dataDir,
          autoInstall: true,
          ...(options.binaryPath ? { binaryPath: options.binaryPath } : {}),
          ...(options.runtimeAssets ? { assets: options.runtimeAssets } : {}),
          ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
          signal: task.signal,
          onProgress: (progress) => task.onProgress(progress.fraction * 0.25),
        });
        await models.install(modelId, {
          signal: task.signal,
          onProgress: (progress) => task.onProgress(0.25 + progress.fraction * 0.7),
        });
        if (!(await models.verify(modelId))) {
          await models.remove(modelId);
          throw new Error("Speech model verification failed. Install it again.");
        }
        inner = build();
        task.onProgress(1);
      },
      async remove() {
        await models.remove(modelId);
        inner = build();
      },
    },
  };
}
