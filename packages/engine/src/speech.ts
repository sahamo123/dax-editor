// The default speech-to-text engine for the launcher: @dax/stt's whisper.cpp transcriber. It never downloads anything on
// its own; when the runtime or the model is missing, a transcription fails with "transcription unavailable: <reason>"
// instead of crashing the engine.

import type { Transcriber } from "@dax/core";
import {
  type CreateTranscriberOptions,
  createTranscriber,
  SpeechModelManager,
  SttError,
} from "@dax/stt";

/**
 * A short phrase for the user saying why speech recognition cannot run, or `undefined` when the error is a real failure
 * (a cancel, unreadable audio, a timeout) that must be reported as it is.
 * @param modelId Catalog id of the model the engine was set up to use, named in the message.
 */
export function unavailableReason(err: unknown, modelId: string): string | undefined {
  if (!(err instanceof SttError)) return undefined;
  switch (err.code) {
    case "binary-missing":
      return "the speech recognition runtime (whisper-cli) is missing or cannot be run";
    case "model-missing":
      return `the speech model "${modelId}" is not downloaded`;
    case "unsupported-platform":
      return "there is no speech recognition runtime for this computer";
    default:
      return undefined;
  }
}

/**
 * Wrap a transcriber so that a missing runtime or model comes back as an `Error` whose message starts with
 * "transcription unavailable:". Every other failure passes through unchanged, so the caller can tell setup problems from
 * real ones. The original error is kept as `cause`.
 * @param inner The transcriber that does the work.
 * @param modelId Catalog id of the model `inner` uses, for the message.
 */
export function withUnavailableMessages(inner: Transcriber, modelId: string): Transcriber {
  return {
    async transcribe(path, opts) {
      try {
        return await inner.transcribe(path, opts);
      } catch (err) {
        const reason = unavailableReason(err, modelId);
        if (reason === undefined) throw err;
        throw new Error(`transcription unavailable: ${reason}`, { cause: err });
      }
    },
  };
}

/**
 * Build the speech-to-text engine the launcher hands to the server. Cheap: nothing is found, installed or run until the
 * first transcription. Automatic download is off by default, so a machine without the runtime or model gets the
 * "unavailable" message rather than a silent download; the caller may turn it on through `options`.
 * @param dataDir The engine's data folder; models and the runtime live under `<dataDir>/speech/`.
 * @param options Any `@dax/stt` option, such as a model id, a `binaryPath` or `autoInstall`.
 */
export function createSpeechTranscriber(
  dataDir: string,
  options: Omit<CreateTranscriberOptions, "dataDir"> = {},
): Transcriber {
  // The model is chosen from the speech catalog for this machine, the same rule createTranscriber uses by default.
  const modelId = options.modelId ?? new SpeechModelManager({ dataDir }).recommend();
  const engine = createTranscriber({ autoInstall: false, ...options, dataDir, modelId });
  return withUnavailableMessages(engine, modelId);
}
