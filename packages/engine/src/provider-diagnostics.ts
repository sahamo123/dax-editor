// Explicit non-editing provider checks; no editor tools or project media leave this process.
import type { ProviderDiagnostic, ProviderKind } from "@dax/protocol";
import type { RunnerEnv } from "@dax/server";
import type { LocalEndpoint } from "./runner.js";
import { keyMayGoTo } from "./runner.js";

/** Dependencies for explicit connection tests and model discovery. */
export interface DiagnosticOptions {
  localEndpoint?: LocalEndpoint;
  fetch?: typeof fetch;
}

async function connection(env: RunnerEnv, kind: ProviderKind, options: DiagnosticOptions) {
  const cfg = env.settings.providers[kind] ?? {};
  const local = kind === "local" ? await options.localEndpoint?.() : undefined;
  const baseUrl =
    kind === "openrouter"
      ? "https://openrouter.ai/api/v1"
      : kind === "openai"
        ? "https://api.openai.com/v1"
        : kind === "local"
          ? local?.baseUrl
          : kind === "openai-compatible"
            ? cfg.baseUrl
            : undefined;
  if (!baseUrl)
    throw new Error(
      "This connection cannot be tested here. Configure a local or compatible API endpoint first.",
    );
  const url = new URL(baseUrl);
  if (url.username || url.password || url.search || url.hash)
    throw new Error("Use an API base URL without credentials, query parameters or fragments.");
  const apiKey = kind === "local" ? local?.apiKey : await env.getApiKey(kind);
  if (apiKey && !keyMayGoTo(baseUrl))
    throw new Error("API keys require HTTPS or a loopback server on this computer.");
  if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("Use HTTP or HTTPS.");
  if ((kind === "openai" || kind === "openrouter") && !apiKey)
    throw new Error("Save an API key before testing this connection.");
  return { baseUrl: baseUrl.replace(/\/$/, ""), model: cfg.model ?? local?.modelId, apiKey };
}

function failure(status: number): string {
  if (status === 401 || status === 403)
    return "Authentication failed. Check the saved API key and model access.";
  if (status === 402)
    return "The provider reports insufficient credit. Check your provider account.";
  if (status === 429)
    return "The provider is rate limited or out of quota. Check limits and try again later.";
  if (status === 404) return "Endpoint or model not found. Check the API address and model ID.";
  if (status === 400 || status === 422)
    return "The provider rejected the tool request. Choose a tool-capable model and check its supported parameters.";
  return `The provider could not complete the test (HTTP ${status}). Try again or check its server.`;
}

/** Request a synthetic tool call without executing any tool; validates name and arguments. */
export async function testProvider(
  env: RunnerEnv,
  kind: ProviderKind,
  options: DiagnosticOptions = {},
): Promise<ProviderDiagnostic> {
  const checkedAt = Date.now();
  try {
    const conn = await connection(env, kind, options);
    if (!conn.model) throw new Error("Save a model ID before testing this connection.");
    const response = await (options.fetch ?? fetch)(`${conn.baseUrl}/chat/completions`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(kind === "local" ? 90_000 : 30_000),
      headers: {
        "Content-Type": "application/json",
        ...(conn.apiKey ? { Authorization: `Bearer ${conn.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: conn.model,
        stream: false,
        ...(kind === "openai" ? { max_completion_tokens: 256 } : { max_tokens: 128 }),
        ...(kind === "openrouter" ? { provider: { require_parameters: true } } : {}),
        ...(kind === "local" ? { chat_template_kwargs: { enable_thinking: false } } : {}),
        messages: [
          {
            role: "user",
            content: "Call connection_probe with value dax-probe. This is a connection test only.",
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "connection_probe",
              description: "Non-editing connection probe.",
              parameters: {
                type: "object",
                properties: { value: { type: "string", enum: ["dax-probe"] } },
                required: ["value"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "connection_probe" } },
      }),
    });
    if (!response.ok) throw new Error(failure(response.status));
    const json: unknown = await response.json();
    const call = toolCall(json);
    let args: unknown;
    try {
      args = typeof call?.arguments === "string" ? JSON.parse(call.arguments) : call?.arguments;
    } catch {
      args = undefined;
    }
    if (call?.name !== "connection_probe" || !isRecord(args) || args.value !== "dax-probe") {
      throw new Error(
        "The server answered, but a valid tool call was not returned. Choose a model with tool support.",
      );
    }
    return {
      kind,
      checkedAt,
      status: "connected",
      toolsSupported: true,
      detail: "Connected · tool-call probe passed",
    };
  } catch (error) {
    const detail =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
        ? "Connection test timed out. Check the server, model loading and available memory."
        : error instanceof Error && error.name !== "TypeError"
          ? error.message
          : "Could not reach the provider. Check the server address and network.";
    return { kind, checkedAt, status: "error", toolsSupported: false, detail };
  }
}

/** Fetch bounded model IDs using saved endpoint/authentication; never changes the selected model. */
export async function discoverModels(
  env: RunnerEnv,
  kind: ProviderKind,
  options: DiagnosticOptions = {},
): Promise<string[]> {
  const conn = await connection(env, kind, options);
  const response = await (options.fetch ?? fetch)(`${conn.baseUrl}/models`, {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: conn.apiKey ? { Authorization: `Bearer ${conn.apiKey}` } : {},
  });
  if (!response.ok) throw new Error(failure(response.status));
  const json: unknown = await response.json();
  if (!isRecord(json) || !Array.isArray(json.data))
    throw new Error("This provider does not support model discovery. Enter its model ID manually.");
  return [
    ...new Set(
      json.data
        .filter(isRecord)
        .map((model) => model.id)
        .filter((id): id is string => typeof id === "string" && id.length <= 200),
    ),
  ]
    .slice(0, 1000)
    .sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function toolCall(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value) || !Array.isArray(value.choices)) return;
  const choice: unknown = value.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message) || !Array.isArray(choice.message.tool_calls))
    return;
  const call: unknown = choice.message.tool_calls[0];
  return isRecord(call) && isRecord(call.function) ? call.function : undefined;
}
