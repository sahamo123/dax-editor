---
name: add-lower-third
description: Use when the user wants a speaker's name and role shown in the lower part of the frame when a person first speaks or appears.
tags: [lower third, lower-third, name tag, speaker, introduce, who is speaking, name and role, job title, role, guest, host, byline, name]
---

## When to use
"Add my name and job title", "introduce the guest", "show who is speaking". For several speakers in an interview, see interview-with-lower-thirds.

## Steps
1. Get the name, and the role or company if any. If the name is missing, ask one short question. Never guess a name.
2. `get_project`: duration D, clips, existing overlays. Finish cutting first.
3. Pick the moment: about 1 s after the person starts speaking or appears (not the first 0.5 s). First speaker: `start` 1. Another person: the timeline time where their clip begins plus 1. Convert transcript or source time: clip start + (source time minus sourceIn).
4. `add_overlay {"preset":"lower-third-slide","start":1,"duration":4,"text":"Jane Smith","subtitle":"Head of Design, Acme"}`. Use 3 to 5 s. Name in `text`, role in `subtitle`; names under three words.
5. Keep the subtitle short (under 30 characters). On vertical video, add `"fontSize":44` so it fits.
6. Another overlay in the same seconds? Move this one with `move_overlay {"overlayId":"<id>","start":6}` so they never overlap.

## How to verify
`get_project`: overlay `text` and `subtitle` are exactly what the user gave, `start` is inside the video, `end` no later than the duration, and no other overlay shares the same seconds.

## Pitfalls
- It is shown at the lower left and does not move with the speaker.
- A second lower third for the same person needs a reason (long video, 5 minutes later).
- On 9:16 video the bottom fifth is covered by app buttons. Use `update_overlay {"overlayId":"<id>","position":"center"}` or "top" there.
- Text does not wrap.

## Do not
- Do not invent job titles or companies.
- Do not show it across a cut to a different speaker.
- Do not use it for a general title (see add-title).
