---
name: explainer-video-structure
description: Use when the user wants an explainer, product pitch or idea video shaped into a hook, a few clear points and a closing call to action.
tags: [explainer, explain, pitch, product video, idea, marketing video, promo, promotional, company video, brand video, hook, key points, structure, story, script, sales video]
---

## When to use
"Make this an explainer", "tidy my pitch", "give it a clear structure", a company or product talk of 1 to 3 minutes.

## Steps
1. `get_project`, `transcribe {}` if needed, `get_transcript`. Read the whole text and outline it: the problem, 2 to 4 key points, the payoff.
2. `save_checkpoint {"name":"before-explainer"}`.
3. Aim for: a hook in the first 10 s (the problem or a surprising claim), one idea per section of about 20 to 40 s, a one-line recap, then a call to action. A guideline, not a rule.
4. Hook not at the start? Offer a cold open: `add_clip {"assetId":"<asset id>","in":125,"out":133}` appends the hook line at the end, then `move_clip {"clipId":"<new clip id>","index":0}` moves it first. The line then plays twice; tell the user.
5. `smart_cut {"preset":"standard"}` to remove filler and pauses.
6. Optional: `smart_cut` leaves false starts for review; follow review-false-starts-and-retakes.
7. Overlays last, after all cutting and reordering:
   - opening title: `add_overlay {"preset":"title-fade","start":0.4,"duration":3,"text":"Why invoices go missing"}`.
   - one short title per key point at its first second (`title-fade`, 2 s), or `callout-slide-up` for a number.
   - closing line: add-end-card-cta.
8. Tell the user the outline you followed in 3 lines.

## How to verify
`get_project`: duration, clip order and overlays in time order. The title is before 1 s and the closing text ends at the end.

## Pitfalls
- No animation, diagrams or B-roll exist; say so if they were expected (see handle-unsupported-requests). Music from a file is possible (see add-music-zoom-or-logo).
- `move_clip` does not move overlays; reorder clips BEFORE adding overlays.
- Time from transcript to timeline: clip start + (source time minus sourceIn).

## Do not
- Do not rewrite or reorder the speaker's argument without saying so.
- Do not state claims or numbers in titles that the speaker did not say.
- Do not export.
