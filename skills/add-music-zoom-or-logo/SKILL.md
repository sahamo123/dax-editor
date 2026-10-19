---
name: add-music-zoom-or-logo
description: Use when the user wants background music or a sound effect from a file, a zoom or punch-in on the picture, or a logo, watermark or sticker over the video.
tags: [music, background music, soundtrack, sound effect, sfx, whoosh, duck, ducking, zoom, punch in, push in, zoom in, logo, watermark, sticker, brand, image, picture]
---

## When to use
"Add this song under the video", "zoom in when I say the price", "put my logo in the corner", "add a whoosh at 12 seconds". The user gives a file or names the moment.

## Steps
1. `get_project`: note the duration and the times. All times here are timeline seconds, so finish cutting first.
2. Music: the user must give a file path. `add_audio {"path":"/Users/me/song.mp3","loop":true}` puts it under the whole video, fades it in and out and lowers it while someone speaks. Louder or quieter: `update_audio {"audioId":"<id>","volume":0.4}`. Deeper or no ducking: `set_ducking {"amountDb":18}` or `{"enabled":false}`.
3. A sound effect: `add_audio {"path":"/Users/me/pop.wav","role":"sfx","start":12}`.
4. Zoom: a quick punch-in for emphasis `add_zoom {"start":12,"end":14,"scale":1.15}`. A slow push-in `add_zoom {"start":0,"end":8,"scale":1.1,"style":"push-in"}`. Change one: `update_zoom {"zoomId":"<id>","scale":1.25}`.
5. Logo or sticker from a PNG or JPG: `add_image_overlay {"path":"/Users/me/logo.png","preset":"logo-corner"}` stays to the end. Faint for the whole video: `"preset":"watermark"`. Another spot or size: `update_image_overlay {"imageId":"<id>","position":"bottom-left","width":0.2}`.
6. Remove with `remove_audio`, `remove_zoom` or `remove_image_overlay`.

## How to verify
`get_project` lists `audio`, `zooms` and `images` with ids and times; check each starts before the end of the video. Repeating a command does not duplicate it.

## Pitfalls
- No music library: without a file, say so. The user must have the right to use the music.
- A zoom goes to the centre unless you give `"x"` and `"y"` (0 to 1). It does not find the speaker or the cursor.
- Zooms use 1.1 to 1.25; more looks soft. Zoom ranges cannot overlap.
- A zoom or logo made before cuts moves with the footage; music stays where it is.

## Do not
- Do not call `set_volume` music mixing; it only changes the video's own sound.
- Do not invent a file path; ask for it.
