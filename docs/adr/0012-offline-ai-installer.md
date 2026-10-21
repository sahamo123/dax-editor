---
type: Decision
title: "ADR 0012: Ship a verified offline AI model in the Windows installer"
description: Bundle a small Qwen model and MIT llama.cpp runtime with the Windows editor, initialize them locally without network access, and retain LM Studio as an optional compatible endpoint.
tags: [adr, desktop, packaging, ai, offline]
status: stable
generated:
  by: process:implementer
  at: 2026-10-20T17:20:00Z
---

# ADR 0012: Offline AI in one installer

October 20 continuation: retain this runtime/package decision. A 533 MB Qwen3.5 0.8B trial was faster in raw CPU generation but failed the editing replacement gate, so it does not replace the 2B seed. OpenRouter is a separate optional hosted provider with its own key namespace and fixed official endpoint. See [the provider spec](../specs/lightweight-ai-providers.md) for evidence and configuration.

The owner requires a Windows desktop app with offline AI and one installer containing its dependencies. A single setup program that downloads a model on first run does not satisfy that requirement.

Bundle the catalogued Qwen 3.5 2B Q4_K_M weights (1,280,835,840 bytes) and the pinned Windows x64 CPU llama.cpp runtime. Verify the model against its catalog SHA-256 and the runtime archive against the release digest before packaging. The Windows runtime digest for b11721 was cross-checked against GitHub's release API on October 20, 2026 and matches the source pin. Include the upstream licence texts and pinned source/revision/digest provenance.

The installer carries read-only seed files as resources. On first engine launch, verify their hashes and initialize the model/runtime in the app's writable data directory, with completion manifests written last. No network or credentials are needed. Reuse a verified existing install; preserve unrelated models, projects, settings and secrets. A failed initialization must leave manual editing usable and an honest AI setup state.

Use the existing local-model controller and process supervision. The app may start the bundled model after initialization; errors must not stop the manual editor. Confirm actual tool-driven edits and export before marking offline AI ready.

LM Studio remains an optional OpenAI-compatible endpoint. Its published desktop terms restrict redistribution; do not include the LM Studio application in this installer. The redistribution rights of its separate llmster daemon have not been established here. The selected llama.cpp runtime is MIT and the selected Qwen model is Apache-2.0. Neither is Meta's Llama model family.

The model increases download size and first-launch disk work. Measure the actual installer size and cold-start time, verify a fresh data directory, and disclose unsigned developer-build status. Speech recognition remains a distinct dependency and is not implied by installing a text model.

Sources: [LM Studio app terms](https://lmstudio.ai/app-terms), [LM Studio API](https://lmstudio.ai/docs/developer), [llama.cpp licence](https://github.com/ggml-org/llama.cpp/blob/master/LICENSE), [Qwen licence](https://huggingface.co/Qwen/Qwen3.5-2B/blob/main/LICENSE).
