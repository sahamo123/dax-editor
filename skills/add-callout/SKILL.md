---
name: add-callout
description: Use when the user wants a key number, step, term or point highlighted with a short text note that slides in over the video.
tags: [callout, call out, highlight text, emphasis, emphasize, key point, key number, stat, note, label, annotation, point out, tip, step label]
---

## When to use
"Highlight the price", "call out step 3", "add a note when I say 40 percent", "label this tip". One short note at one moment.

## Steps
1. Get the words. If the user gave a moment but no words, use their own phrase (a number, a step name). If neither is clear, ask one short question.
2. `get_project`: duration D, clips, existing overlays. Finish cutting first.
3. Find the moment: `get_transcript` shows [mm:ss] markers (source time). Convert: timeline time = clip start + (source time minus sourceIn) from `get_project`. On an untouched single clip they are equal. Start the callout about 0.3 s BEFORE the words are said.
4. `add_overlay {"preset":"callout-slide-up","start":42.5,"duration":3,"text":"Save 40%"}`. Use 2.5 to 4 s. Text up to 6 words and at most 1.6 times frame width divided by `fontSize` characters (default size 64 is about 48 characters landscape, 27 portrait).
5. Several callouts? Space them at least 4 s apart; if they overlap, `move_overlay {"overlayId":"<id>","start":50}`.
6. Too long or wrong? `update_overlay {"overlayId":"<id>","text":"Save 40%"}`.

## How to verify
`get_project`: overlay `text` exact, `start` in range, `end` no later than the duration, no overlap with another callout. Re-read the transcript at that second and confirm the thing is being said then.

## Pitfalls
- The callout is a yellow box at the top; it may cover important picture. Tell the user, and offer `"position":"bottom"`.
- Overlays use timeline seconds. Cuts made later shift them.
- It does not point at anything on screen: no arrows. A zoom on the moment is separate (see add-music-zoom-or-logo).

## Do not
- Do not call out more than one thing every 4 s.
- Do not invent numbers; quote what was said.
- Do not use it for the speaker's name (see add-lower-third).
