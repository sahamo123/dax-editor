---
name: interview-with-lower-thirds
description: Use when the video is an interview, panel or testimonial that needs gentle cleanup and name captions for each person who speaks.
tags: [interview, interviewee, interviewer, testimonial, panel, documentary, q&a, qa, customer story, case study, guest, speakers, names for each speaker, two speakers]
---

## When to use
"Edit this interview", "add names for both speakers", "tidy this testimonial". People's pauses carry meaning here, so cut gently.

## Steps
1. `get_project`, `transcribe {}` if needed, `get_transcript`. The editor does not tell speakers apart. Get names and roles from the user, or from the introductions in the transcript. Missing: ask one short question.
2. `save_checkpoint {"name":"before-interview"}`.
3. Light cleanup: `smart_cut {"preset":"gentle"}`. Fillers stay; long dead pauses and the ends are trimmed. Offer `standard` if they want more.
4. Leave the false starts and retakes alone unless the user asks (then review-false-starts-and-retakes). Hesitation can be the story.
5. Add a lower third when each person first speaks, about 1 s in: `add_overlay {"preset":"lower-third-slide","start":1,"duration":4,"text":"Jane Smith","subtitle":"Founder, Acme"}`. Timeline time = clip start + (source time minus sourceIn).
6. The second person: their first spoken second plus 1. Repeat a name only if 5 minutes have passed.
7. Keep names under three words and roles under 30 characters.
8. Optional title at the start (add-title) first; leave 1 s between it and the first name card.

## How to verify
`get_project`: one lower third per person, each 3 to 5 s, none overlapping another overlay, each `start` while that person speaks.

## Pitfalls
- No speaker detection: do not assign a line to a person you cannot be sure of. Ask for a time.
- A lower third must not run across a cut to the other speaker.
- No B-roll cutaways or captions exist (handle-unsupported-requests). Music from a file is possible (see add-music-zoom-or-logo).
- `tight` makes interviews feel rushed.

## Do not
- Do not invent names, roles or companies.
- Do not remove all pauses.
- Do not export.
