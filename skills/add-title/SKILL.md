---
name: add-title
description: Use when the user wants a title, heading, name card or opening text shown over the video, at the start or at any chosen moment.
tags: [title, heading, headline, name, my name, opening text, intro text, intro title, chapter title, text on screen, put text, write text]
---

## When to use
"Add a title", "put my name at the start", "show 'Chapter 2' here", "add text saying ...". For a speaker's name and role use add-lower-third.

## Steps
1. Need the exact words. If the user did not give them, ask one short question and offer a default ("What should the title say?").
2. `get_project`: duration D, format, existing overlays. Finish all cutting and reordering first; later cuts move or remove overlays.
3. Choose the preset:
   - `title-fade`: calm, default for openings and chapters (3 s).
   - `title-pop`: punchy, short-form and hooks (2.5 s).
   - `title-typewriter`: techy or reveal (3.5 s).
4. Add it: `add_overlay {"preset":"title-fade","start":0.4,"duration":3,"text":"My Channel Name"}`. Opening title: `start` 0.3 to 0.5. At a later moment, use that timeline second. Hold 2.5 to 4 s.
5. Text never wraps. Keep it on one line: at most 1.6 times frame width divided by `fontSize` characters (1920 wide at size 96 allows about 32; 1080 wide needs `fontSize` 54 for 32). Else add `"fontSize":54`.
6. Wrong afterwards? `update_overlay {"overlayId":"<id>","text":"New words"}` (id from `get_project`).

## How to verify
`get_project`: the overlay shows the exact text, `start` at least 0 and `end` no later than the duration, and it does not overlap another title.

## Pitfalls
- Overlays use timeline seconds. Cutting before the overlay shifts it earlier; cutting under it shortens it.
- Do not put a title over the first 0.3 s; it flashes.
- Vertical video is narrow: shrink the text.
- The title is text over the footage, not a separate black card. Say so if asked for a card.

## Do not
- Do not invent a name, brand or claim.
- Do not use file names or transcript text as the title without the user's say-so.
- Do not stack two titles at the same time.
