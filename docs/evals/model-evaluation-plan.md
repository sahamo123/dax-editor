---
type: Evaluation
title: Plan to evaluate lightweight open models
description: How we will find out whether a small, free, locally run model, including a multimodal one, can drive video editing well enough to be the default.
tags: [evals, models, local-llm, plan]
status: draft
generated:
  by: process:implementer
  at: 2026-10-18T19:05:00Z
---

# Plan to evaluate lightweight open models

**Status: plan, not yet run.** No model has been evaluated; nothing here is a result.

## The question

The product goal is that anybody can edit video by typing, for free, offline if they want. That only works if a small open model, possibly one shipped with the app, can do the job. The owner's hypothesis: video editing does not need a lot of intelligence. The open worries are **output speed** and **tool-call reliability** on ordinary laptops.

## Why it might work

We make the model's job small:

- Perception is done by deterministic tools (silence, scenes, transcript), which return short structured text. The model reads numbers and words, it does not need to "watch".
- Tools are **coarse and high-level** (`remove_silences`, `remove_filler_words`, `cut_by_transcript`), so most requests are one or two calls.
- Output is constrained: tool calls must match a JSON schema, with grammar-constrained decoding where the runtime supports it.
- Every call is validated before it touches the timeline, and failures are returned to the model as clear errors.

## Where it might fail

- Small models are weaker at reliable tool calling (one secondary source reports exactly this for the smallest Gemma 4 sizes; unverified).
- Long transcripts (a 30-minute tutorial) may exceed what a small model can read well; we may need chunking or a map-reduce summary tool.
- Judgment tasks (choose a structure for a tutorial vs an explainer, suggest animations) are harder than mechanical cuts.
- Runtime bugs: tool calling support differs between Ollama, llama.cpp and templates, and has had bugs (unverified).

## Candidates

Verify availability and licenses on the model cards at test time.

- The Gemma 4 family, sizes E2B, E4B, 12B and larger, per secondary sources, run through llama.cpp or Ollama (unverified details).
- Other small open models with documented tool-calling support, served by Ollama or llama.cpp. Add rows to the results table as they are tried.
- A large hosted model as a **ceiling reference** only (for example, to confirm a task is solvable), never as a requirement.

## Protocol

For every candidate:

1. Same task set, same fixtures, same tool definitions, same system prompt.
2. Temperature 0 (or the lowest the runtime allows); run each task **5 times** and report the pass rate, since output can still vary.
3. Record per run: pass/fail and reasons, turns, tool calls and invalid ones, input and output tokens, wall-clock latency, output tokens per second, peak memory.
4. Record the machine: CPU, GPU, RAM, runtime and version, quantization, context length.
5. Publish the table in this folder as a new dated concept, never overwriting older results.

**Hardware tiers** to test on: A) 8 GB RAM, CPU only; B) 16 GB RAM, CPU or integrated GPU; C) discrete GPU with 8 GB or more VRAM.

## Task ladder

1. **Mechanical** (exists): remove silences, keep first N seconds, delete a range.
2. **Transcript-based** (needs fixtures with supplied transcripts): remove filler words, cut a named sentence, keep only a topic.
3. **Multi-step**: "remove silences, then cut the intro, then export vertical".
4. **Ambiguous or underspecified**: the model should ask or state an assumption rather than guess.
5. **Format-aware**: "make this a tutorial" vs "make this an explainer". Checks are structural (has intro, no dead air, chapter markers); style is rated by humans.
6. **Long input**: 20 to 40 minute transcript.
7. **Vision sub-study**, only if text-only falls short: describe frames, find a slide change, pick a thumbnail. Compare a multimodal model with a text model plus the scene-detection tool.

## Decision rules (proposed; change them with an ADR)

A model may be the **recommended default** for a hardware tier when, on the core suite (tasks 1 to 3):

- pass rate is **90% or higher** across all runs,
- invalid tool calls are **5% or lower**,
- median time to finish a task is **30 seconds or less** on that tier.

If no small model clears the bar on tier A, we ship the best one as "basic" and recommend a larger local model or a bring-your-own-key API for harder requests. The app must show which tier it expects.

## Outputs

- A results concept per run date in `docs/evals/`.
- Updates to `docs/STATUS.md` and a log entry.
- If a rule above changes, an ADR.

## Prerequisites

The first OpenAI-compatible adapter and the agent loop's tool definitions must exist. Tracked in the [roadmap](/ROADMAP.md).
