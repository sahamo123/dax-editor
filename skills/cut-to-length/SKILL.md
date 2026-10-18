---
name: cut-to-length
description: Use when the user wants the video shorter or fitted to a target length such as 30 seconds, 60 seconds or under 2 minutes.
tags: [shorter, shorten, length, duration, seconds, minutes, minute, trim down, cut down, condense, under, limit, short version, fit, target length, too long]
---

## When to use
"Make it 30 seconds", "cut it down to 2 minutes", "under a minute for Reels". No number given ("make it shorter")? Tighten only with tighten-talking-video and report the new length.

## Steps
1. `get_project`: note duration D. Target T in seconds (2 min = 120). If D is already at or under T, say so and stop.
2. `save_checkpoint {"name":"before-length"}`.
3. Tighten first: `smart_cut {"preset":"standard"}`. If "Timeline is now" is at or below T, stop. Still above T: `undo`, then try `smart_cut {"preset":"tight"}`. Still above T: `undo` again.
4. Now the content must go. Confirm `get_project` duration is D again. With one untouched clip, timeline seconds equal source seconds.
5. `get_transcript`. Choose whole passages to drop, weakest first: greetings, tangents, repeats, the least relevant section. Total about D minus T. Keep the opening and the conclusion.
6. Find safe edges: `detect_silence {"minDuration":0.3}`. Put each cut inside a silent stretch right after a sentence ends, never inside speech.
7. Remove each passage with `delete_range {"from":40,"to":55}` (example values), working from the END of the video back to the start so earlier times stay valid. For one block to keep, use `keep_only {"ranges":[{"start":0,"end":90}]}`.
8. `smart_cut {"preset":"standard"}` again on what is left.

## How to verify
`get_project`: duration is at or just under T, never above, no more than 3 s below. `get_transcript` over the last 6 seconds ends on a finished sentence.

## Pitfalls
- Several clips: timeline time = clip start + (source time minus sourceIn), from `get_project`.
- One or two seconds off the target is better than a sentence cut in half.
- No transcript: choose passages from `detect_scenes` and silences, and tell the user which part you dropped.

## Do not
- Do not cut mid-sentence or mid-word to hit the number exactly.
- Do not remove more than half the video without telling the user what goes.
- Do not export.
