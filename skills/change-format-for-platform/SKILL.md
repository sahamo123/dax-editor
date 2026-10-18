---
name: change-format-for-platform
description: Use when the user wants the video set up for a platform or shape such as TikTok, Reels, Shorts, Instagram, YouTube, LinkedIn, vertical, square or widescreen.
tags: [format, aspect ratio, ratio, platform, vertical, portrait, landscape, square, widescreen, tiktok, reels, shorts, instagram, youtube, linkedin, facebook, 9:16, 16:9, 1:1, 4:5, 9 16, 16 9, 1080p, 720p, resolution, fps]
---

## When to use
"Make this vertical for TikTok", "square for Instagram", "put it in 16:9", "720p please".

## Steps
1. `get_project`: current format, duration D.
2. Choose by platform:
   - TikTok, Reels, YouTube Shorts: `set_format {"preset":"portrait-1080x1920"}`. Best under 60 s (Shorts allow up to 3 min).
   - Instagram or Facebook feed, LinkedIn feed: `set_format {"preset":"portrait-4x5"}` (fewer bars), or `square-1080` if asked. Best 15 to 60 s.
   - YouTube, websites, presentations: `set_format {"preset":"landscape-1080p"}`.
   - Small or fast to share: `set_format {"preset":"landscape-720p"}`.
   - Other frame rate: add `"fps":30` (only if the user asks).
3. Compare D with the platform length above. Too long: follow cut-to-length.
4. Tell the user the truth: footage that does not match is fitted inside the frame with bars. A landscape video made vertical gets black bars top and bottom. It is NOT cropped or re-centred on the speaker.
5. Existing text overlays: on vertical, text must fit the narrower frame. Use `update_overlay {"overlayId":"<id>","fontSize":48}` for long ones, and move text off the bottom fifth (app buttons) with `"position":"center"` or `"top"`.

## How to verify
`get_project`: `format` is the expected size, e.g. 1080x1920 @ fps. Duration is unchanged.

## Pitfalls
- Repeated format changes are harmless; the last one wins.
- Landscape to vertical shrinks the picture a lot. Offer `portrait-4x5` as the middle way.
- Screen recordings become unreadable in vertical. Warn.

## Do not
- Do not promise a crop, a zoom or subject tracking. They do not exist yet.
- Do not guess a platform from a vague "social media"; pick `portrait-1080x1920` and say so, or ask.
- Do not export unless asked.
