---
name: add-end-card-cta
description: Use when the user wants a closing call to action such as subscribe, follow, visit a site or book a call shown during the last seconds.
tags: [end card, endcard, cta, call to action, subscribe, follow, like and subscribe, outro text, closing, sign off, end screen, website, link, book a call, fade out]
---

## When to use
"Add a subscribe message at the end", "end with my website", "put a call to action", "fade out at the end".

## Steps
1. Get the exact call to action. No words given? Ask one short question and offer a default ("Subscribe for more"). Any web address or handle must come from the user.
2. Finish all other edits first, then `get_project`: duration D and the id of the LAST clip.
3. Add it over the final seconds: `add_overlay {"preset":"title-fade","start":26,"duration":4,"text":"Subscribe for more"}`. Here `start` = D minus 4 and `duration` 4, so it ends exactly at the end. Under 8 s of video: use 2 s.
4. Long text (an address)? Add `"fontSize":64`. Keep it on one line, at most 1.6 times frame width divided by `fontSize` characters.
5. Soft ending: `set_fades {"clipId":"<last clip id>","fadeOut":0.6}`.
6. Tell the user plainly what this is: text over the last footage, not a separate end screen.

## How to verify
`get_project`: overlay `end` is no later than D, `text` exact, the last clip shows `fadeOut`. If D changes afterwards, move it with `move_overlay {"overlayId":"<id>","start":24}`.

## Pitfalls
- There is no end-card preset, no image, logo, button or clickable link. A web address is only text.
- Cutting after adding the CTA shifts or shrinks it; add it last.
- Platform end screens (YouTube cards) are added on the platform, not here.

## Do not
- Do not claim the link or button works.
- Do not invent a handle, URL or offer.
- Do not add the CTA to the first seconds of a short; keep it to the end.
