---
name: short-form-vertical-hook
description: Use when the user wants a short vertical video for TikTok, Reels or Shorts that grabs attention in the first seconds.
tags: [short, shorts, short form, tiktok, reels, vertical, hook, viral, first seconds, grab attention, attention, scroll, social clip, youtube shorts, instagram reel]
---

## When to use
"Make a Reel from this", "TikTok version", "needs a better hook", "turn this into a short". Target 15 to 60 s, vertical, hook in the first 2 to 3 s.

## Steps
1. `get_project`: duration D, `hasTranscript`. `save_checkpoint {"name":"before-short"}`.
2. Get to length: cut-to-length with T = 60 (or less). Use `smart_cut {"preset":"tight"}` for pace.
3. Reformat: `set_format {"preset":"portrait-1080x1920"}`. A landscape picture gets bars, not a crop; say so.
4. Find the hook: the strongest line (a result, a number, a question, a surprising claim). `get_transcript` over the whole video.
5. Not in the first 3 s? Cold open: `add_clip {"assetId":"<asset id>","in":47.2,"out":52}` adds that line (3 to 8 s) at the end, then `move_clip {"clipId":"<new clip id>","index":0}` puts it first. The line will play again later; tell the user. (Find ids in `get_project`.)
6. Hook text after all reordering: `add_overlay {"preset":"title-pop","start":0.2,"duration":2.5,"text":"I cut my edit time in half","fontSize":70,"position":"top"}`. Up to 6 words; 1.6 times 1080 divided by `fontSize` characters at most.
7. Optional last 2 s: add-end-card-cta (short: "Follow for more").
8. Optional soft ending: `set_fades` with `fadeOut` 0.4 on the last clip.

## How to verify
`get_project`: format 1080x1920, duration 60 s or less, the first overlay starts at 0.5 s or earlier, the hook is the first words of the video.

## Pitfalls
- No captions (handle-unsupported-requests). Many viewers watch muted; say captions are not available. Zoom and music from a file are possible (see add-music-zoom-or-logo).
- Keep text away from the bottom fifth.
- `move_clip` does not move overlays: add overlays last.

## Do not
- Do not promise a result the video does not deliver.
- Do not bury the payoff; put it first, not last.
- Do not export unless asked.
