// Public surface of @dax/agent: the agent loop, the two providers, the system prompt and the small-model helpers.

export * from "./agent.js";
export { type LooseParse, parseJsonLoose } from "./json-repair.js";
export * from "./prompt.js";
export { type AnthropicProviderOptions, createAnthropicProvider } from "./providers/anthropic.js";
export { type HttpOptions, ProviderError } from "./providers/http.js";
export { createOpenAiProvider, type OpenAiProviderOptions } from "./providers/openai.js";
export * from "./scripted.js";
export {
  extractTextToolCalls,
  stripThinking,
  type TextToolCall,
  type TextToolExtraction,
} from "./text-tool-calls.js";
export {
  type Coerced,
  coerceArguments,
  type ToolStyle,
  toolSignature,
  toToolDefinition,
} from "./tools.js";
export * from "./types.js";
