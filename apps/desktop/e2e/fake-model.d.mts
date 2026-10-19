// Types for fake-model.mjs.

/** A request the fake model received. */
export interface FakeModelRequest {
  /** The `Authorization` header the engine sent (so tests can check the stored key reached the model). */
  authorization: string | undefined;
  /** The parsed JSON body. */
  body: { messages?: Array<{ role: string }>; [key: string]: unknown };
}

/** A running fake OpenAI-compatible server. */
export interface FakeModel {
  /** Value for the app's "Base URL" setting, ending in `/v1`. */
  baseUrl: string;
  requests: FakeModelRequest[];
  close(): Promise<void>;
}

/** Start the fake model on a free port of 127.0.0.1. */
export function startFakeModel(): Promise<FakeModel>;
