---
type: Spec
title: Lightweight local AI and API provider setup
description: Measure a smaller local model and provide explicit OpenRouter and direct API configuration without making hosted services mandatory.
tags: [ai, providers, desktop]
status: stable
generated:
  by: process:implementer
  at: 2026-10-21T00:00:00Z
---

# Lightweight local AI and API provider setup

Tracked in [issue #6](https://github.com/sahamo123/dax-editor/issues/6).

## Implementation and acceptance plan

1. Verify the ungated Apache-2.0 Qwen3.5 0.8B Q4_K_M artifact against pinned upstream size and SHA-256. Measure CPU generation and real typed edits on this laptop. Keep the installed 2B model and use the smaller model as default only if editing checks pass.
2. Retain MIT llama.cpp as the embedded runtime (ADR 0012). LM Studio is an optional OpenAI-compatible connection; do not redistribute its desktop application. Do not promise one runtime is faster without a comparable measurement.
3. Add `openrouter` as a distinct provider with its own stored key and a fixed `https://openrouter.ai/api/v1` endpoint. Require a user-selected model ID and a key. Request parameter-compatible routing so editing tools are not silently dropped. Hosted APIs remain optional.
4. Add OpenAI, LM Studio, Ollama and custom endpoint presets for the generic adapter. Preserve model/context settings on save and expose optional output-token and temperature configuration. Keep API keys out of settings responses, project files, browser storage and logs.
5. Verify endpoint/key isolation, model/parameter forwarding, unavailable configuration and settings round trips using local HTTP mocks. Exercise the settings UI in the browser. Run `pnpm check`, catalogue verification and the scribe step before handoff.

The model coordinates validated commands. Queue management and rendering remain deterministic engine responsibilities. Uploading footage does not grant a text model visual understanding. Transcript-driven editing needs speech setup; semantic visual review remains outside this change. HyperFrames integration is separate work and Remotion remains excluded by ADR 0004.

## Trial outcome

The pinned 0.8B file is 532,517,120 bytes; downloaded SHA-256 matched `bd258782e35f7f458f8aced1adc053e6e92e89bc735ba3be89d38a06121dc517` (revision `6ab461498e2023f6e3c1baea90a8f0fe38ab64d0`, `unsloth/Qwen3.5-0.8B-GGUF`). It is retained only in ignored local trial artifacts, not added to the shipping catalogue. A corrected real-agent trial used initialized empty projects and all 20 compact editing tools: portrait and square dimensions changed successfully, but landscape 1280x720 was incorrectly refused as impossible. Square also changed fit to blur without being asked. This fails the replacement gate; keep the verified 2B shipping default. Trial evidence is `artifacts/model-trial/edit-results.json`; the earlier uninitialized-project diagnostic is superseded.

Four CPU threads, no GPU, three 128-token generation samples: 17.74 tokens/second; 128-token prompt processing: 87.99 tokens/second. Evidence: `artifacts/model-trial/benchmark-isolated.json`. The earlier 2B measurement was 9.57 tokens/second with the same runtime and benchmark parameters, recorded in `artifacts/qwen-laptop-benchmark.json`. These were separate runs, not simultaneous controlled comparisons. The initial 0.8B benchmark ran alongside inference and is excluded. Raw generation throughput does not measure end-to-end editing latency or reliability.

## Provider configuration

Settings offers a distinct OpenRouter row: enter a tool-capable model ID, enter the key, select Use OpenRouter for chat, and Save. Endpoint is fixed to the official API root; `provider.require_parameters` is true. Model IDs are entered directly rather than fetched from a changing online catalogue. OpenAI-compatible presets fill OpenAI, LM Studio or Ollama addresses; the address remains editable for other compatible APIs. Optional context window, maximum reply tokens and temperature survive settings round trips. Anthropic retains its native Messages adapter and supports the maximum reply token setting.

Configured status does not prove authentication, credit balance, model availability or an end-to-end hosted edit. Tests use mocked responses and no paid requests. A user-supplied key and tool-capable model are needed for a live OpenRouter check. Selecting a generic endpoint preset does not migrate or delete that provider's previously saved key.

## Verification

- `pnpm check` passed, exit 0: `artifacts/provider-full-check.log`. The initial restricted baseline hit Windows symlink permission failures; the final run used normal process/symlink privileges without changing security policy.
- Eight settings browser scenarios passed across `artifacts/provider-browser-verified.log` (seven) and the corrected OpenRouter rerun `artifacts/provider-openrouter-browser.log` (one). The first rerun exposed a label mismatch; the input now has the explicit accessible name Temperature. The screenshot `apps/desktop/test-results/shots/openrouter-provider-settings.png` was visually inspected.
- Provider tests verify a fixed OpenRouter endpoint despite a supplied override, separate key lookup, selected model, generation parameters, required parameter routing and refusal of missing configuration; no external API request is made.
- The refreshed preview reports all seven provider kinds. Its real offline Planning reply completed without errors in `artifacts/provider-preview-health.log`; timing was under concurrent repository tests and is not a latency benchmark. Native installer validation remains a separate blocked gate.
