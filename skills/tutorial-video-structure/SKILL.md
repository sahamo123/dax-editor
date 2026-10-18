---
name: tutorial-video-structure
description: Use when the user is making a how-to or teaching video and wants it edited into a clear result-first, step-by-step structure.
tags: [tutorial, how to, how-to, lesson, course, teach, teaching, walkthrough, guide, step by step, steps, training, lecture, instructions]
---

## When to use
"Edit this tutorial", "make this how-to clearer", "add step titles". Narrated teaching footage where the viewer should learn one thing.

## Steps
1. `get_project`, then `transcribe {}` if there is no transcript, then `get_transcript`.
2. `save_checkpoint {"name":"before-tutorial"}`.
3. Plan the shape (a guideline, not a law): the result or promise first (5 to 10 s), then steps in order, then a short recap and one next step.
4. Find steps in the transcript from cue words (first, next, now, then, finally). Note each step's first spoken second.
5. Clean up with the teaching preset, which keeps thinking pauses: `smart_cut {"preset":"tutorial"}`.
6. Add the opening title: `add_overlay {"preset":"title-fade","start":0.4,"duration":3,"text":"Build a login form"}` (what the viewer will get).
7. Add a step card at each step start: `add_overlay {"preset":"title-fade","start":38,"duration":2,"text":"Step 1: Create the file"}`. Timeline time = clip start + (source time minus sourceIn), from `get_project` after the cut. Keep each under 30 characters.
8. Highlight a key command, setting or number with `callout-slide-up` (see add-callout).
9. If the result is shown late, offer to move it up; see short-form-vertical-hook for the cold-open trick.
10. Offer an ending line with add-end-card-cta.

## How to verify
`get_project`: step cards are in order, 2 s each, spaced at least 5 s apart, none past the end. Duration is shorter than before.

## Pitfalls
- Teaching pauses matter; `tight` makes tutorials hard to follow.
- Step titles go in AFTER cutting; cuts shift overlays.
- Without a transcript you can only guess steps. Ask the user for the step names and times.
- No zoom on the screen, music or cursor highlights.

## Do not
- Do not invent steps the speaker did not teach.
- Do not number steps that are not in order.
- Do not export.
