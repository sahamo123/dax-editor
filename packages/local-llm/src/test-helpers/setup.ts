/**
 * Vitest setup: keep a developer's `DAX_LLAMA_SERVER` override from leaking into unit tests
 * (it would make "download the runtime" tests use the real binary). Live tests read the stashed
 * copy `DAX_LIVE_LLAMA_SERVER` instead.
 */
if (process.env.DAX_LLAMA_SERVER) {
  process.env.DAX_LIVE_LLAMA_SERVER = process.env.DAX_LLAMA_SERVER;
  delete process.env.DAX_LLAMA_SERVER;
}
